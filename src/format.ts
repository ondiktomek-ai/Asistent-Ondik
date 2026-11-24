/** Formátování časů a čísel v češtině. */

const TZ = 'Europe/Prague';

export function hhmm(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export function longDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}

export function dayName(isoDate: string): string {
  // porovnáváme kalendářní data v české zóně (YYYY-MM-DD), ne rozdíly v hodinách
  const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
  const today = new Date();
  if (isoDate === ymd(today)) return 'Dnes';
  if (isoDate === ymd(new Date(today.getTime() + 86_400_000))) return 'Zítra';
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('cs-CZ', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
}

/** „před 5 min“, „před 2 h“, jinak čas. */
export function ago(iso: string, now = Date.now()): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  if (min < 24 * 60) return `před ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: TZ });
}

/** Hodina z lokálního času Open-Meteo („2026-11-24T21:00“) – bez přepočtu zóny. */
export function localHour(t: string): string {
  return t.slice(11, 16);
}

export const deg = (n: number) => `${Math.round(n)} °C`;

export const SCOPE_LABEL = { svet: 'Svět', cesko: 'Česko', region: 'Region' } as const;

/** Posun pražského času proti UTC v minutách (60 v zimě, 120 v létě). */
function pragueOffset(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 60;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] ?? 0));
}

/** „2026-11-25T14:30“ v pražském čase → milisekundy (nezávisle na zóně prohlížeče). */
export function pragueMs(local: string): number {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const first = guess - pragueOffset(new Date(guess)) * 60_000;
  return guess - pragueOffset(new Date(first)) * 60_000;
}
