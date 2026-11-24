/**
 * Google Kalendář pro Chronose: čtení událostí, volné termíny, zakládání, úpravy a mazání.
 * Pracuje s hlavním kalendářem („primary“) a s časy v zóně Europe/Prague.
 */
import { googleApi } from './google.ts';

export const TZ = 'Europe/Prague';

/** Kdy se hledají volné termíny (výchozí: každý den 8:00–20:00). */
const WORK = parseWork(process.env.PRACOVNI_DOBA || '08:00-20:00');
const WORK_DAYS = new Set((process.env.PRACOVNI_DNY || '1,2,3,4,5,6,7').split(',').map((d) => Number(d.trim())));

function parseWork(s: string) {
  const m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return { from: 8 * 60, to: 20 * 60 };
  return { from: +m[1] * 60 + +m[2], to: +m[3] * 60 + +m[4] };
}

// ---------------------------------------------------------------- čas v Praze

/** Posun pražského času proti UTC v minutách k danému okamžiku (60 v zimě, 120 v létě). */
function pragueOffset(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 60;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0));
}

/** „2026-11-25T14:30“ (pražský čas) → Date. Bere v úvahu letní/zimní čas. */
export function fromLocal(local: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`Neplatné datum/čas: „${local}“ (čekám RRRR-MM-DD nebo RRRR-MM-DDTHH:MM)`);
  const utcGuess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  let d = new Date(utcGuess - pragueOffset(new Date(utcGuess)) * 60_000);
  d = new Date(utcGuess - pragueOffset(d) * 60_000); // druhý průchod kvůli přechodu času
  return d;
}

/** Date → „2026-11-25T14:30“ v pražském čase. */
export function toLocal(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Den v týdnu 1 = pondělí … 7 = neděle (pražský čas). */
function weekday(d: Date): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(w) + 1;
}

function addDays(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- události

export interface CalEvent {
  id: string;
  summary: string;
  /** Pražský čas „RRRR-MM-DDTHH:MM“, u celodenních jen „RRRR-MM-DD“. */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  link?: string;
}

function simplify(e: any): CalEvent {
  const allDay = !!e.start?.date;
  return {
    id: e.id,
    summary: e.summary ?? '(bez názvu)',
    start: allDay ? e.start.date : toLocal(new Date(e.start.dateTime)),
    end: allDay ? addDays(e.end.date, -1) : toLocal(new Date(e.end.dateTime)),
    allDay,
    ...(e.location ? { location: e.location } : {}),
    ...(e.description ? { description: String(e.description).replace(/<[^>]*>/g, ' ').slice(0, 300) } : {}),
    ...(e.htmlLink ? { link: e.htmlLink } : {}),
  };
}

export async function listEvents(opts: { from: string; to: string; query?: string; max?: number }): Promise<CalEvent[]> {
  const params = new URLSearchParams({
    timeMin: fromLocal(opts.from).toISOString(),
    timeMax: fromLocal(opts.to.length === 10 ? addDays(opts.to, 1) : opts.to).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone: TZ,
    maxResults: String(Math.min(opts.max ?? 50, 250)),
  });
  if (opts.query) params.set('q', opts.query);
  const j = (await googleApi(`/calendar/v3/calendars/primary/events?${params}`)) as { items?: any[] };
  return (j.items ?? []).filter((e) => e.status !== 'cancelled').map(simplify);
}

/** Volné úseky v zadaném období v rámci pracovní doby (výchozí 8:00–20:00 každý den). */
export async function freeSlots(opts: { from: string; to: string; minutes: number }): Promise<{ start: string; end: string }[]> {
  const from = fromLocal(opts.from);
  const to = fromLocal(opts.to.length === 10 ? addDays(opts.to, 1) : opts.to);
  const fb = (await googleApi('/calendar/v3/freeBusy', {
    method: 'POST',
    body: { timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: TZ, items: [{ id: 'primary' }] },
  })) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  const busy = (Object.values(fb.calendars ?? {})[0]?.busy ?? []).map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);

  const slots: { start: string; end: string }[] = [];
  const now = Date.now();
  for (let day = toLocal(from).slice(0, 10); day <= toLocal(to).slice(0, 10) && slots.length < 40; day = addDays(day, 1)) {
    const dayStart = fromLocal(day);
    if (!WORK_DAYS.has(weekday(new Date(dayStart.getTime() + 12 * 3600_000)))) continue;
    const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    let s = Math.max(fromLocal(`${day}T${hh(WORK.from)}`).getTime(), from.getTime(), now);
    const e = Math.min(fromLocal(`${day}T${hh(WORK.to)}`).getTime(), to.getTime());
    // zaokrouhlit začátek na celou čtvrthodinu
    s = Math.ceil(s / 900_000) * 900_000;
    const dayBusy = busy.filter(([bs, be]) => be > s && bs < e).sort((a, b) => a[0] - b[0]);
    let cursor = s;
    for (const [bs, be] of [...dayBusy, [e, e] as const]) {
      if (bs - cursor >= opts.minutes * 60_000) slots.push({ start: toLocal(new Date(cursor)), end: toLocal(new Date(bs)) });
      cursor = Math.max(cursor, be);
    }
  }
  return slots;
}

export interface EventInput {
  summary?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  reminderMinutes?: number;
}

function eventBody(e: EventInput) {
  const body: Record<string, unknown> = {};
  if (e.summary !== undefined) body.summary = e.summary;
  if (e.location !== undefined) body.location = e.location;
  if (e.description !== undefined) body.description = e.description;
  if (e.start) {
    const allDay = e.allDay ?? e.start.length === 10;
    if (allDay) {
      const s = e.start.slice(0, 10);
      const last = (e.end ?? e.start).slice(0, 10);
      body.start = { date: s };
      body.end = { date: addDays(last, 1) }; // Google má konec celodenní akce „exkluzivně“
    } else {
      const start = fromLocal(e.start);
      const end = e.end ? fromLocal(e.end) : new Date(start.getTime() + 3600_000);
      if (end <= start) throw new Error('Konec musí být po začátku.');
      body.start = { dateTime: start.toISOString(), timeZone: TZ };
      body.end = { dateTime: end.toISOString(), timeZone: TZ };
    }
  }
  if (e.reminderMinutes !== undefined) {
    body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: e.reminderMinutes }] };
  }
  return body;
}

export async function createEvent(e: EventInput & { summary: string; start: string }): Promise<CalEvent> {
  return simplify(await googleApi('/calendar/v3/calendars/primary/events', { method: 'POST', body: eventBody(e) }));
}

export async function updateEvent(id: string, e: EventInput): Promise<CalEvent> {
  // Při přesunu bez nového konce zachováme původní délku události.
  if (e.start && !e.end) {
    const old = simplify(await googleApi(`/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`));
    if (old.allDay && e.start.length === 10) {
      const days = Math.round((Date.parse(old.end) - Date.parse(old.start)) / 86_400_000);
      e = { ...e, end: addDays(e.start, days) };
    } else if (!old.allDay && e.start.length > 10) {
      const ms = fromLocal(old.end).getTime() - fromLocal(old.start).getTime();
      e = { ...e, end: toLocal(new Date(fromLocal(e.start).getTime() + ms)) };
    }
  }
  return simplify(await googleApi(`/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: eventBody(e) }));
}

export async function deleteEvent(id: string): Promise<void> {
  await googleApi(`/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Události od teď na `days` dní dopředu (pro panel a připomínky). */
export async function agenda(days = 7): Promise<CalEvent[]> {
  const today = toLocal(new Date()).slice(0, 10);
  return listEvents({ from: today, to: addDays(today, days - 1), max: 100 });
}
