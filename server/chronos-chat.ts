/** Chronos – kalendářní agent. Pracuje s Google Kalendářem přes nástroje. */
import type Anthropic from '@anthropic-ai/sdk';
import { agenda, createEvent, deleteEvent, freeSlots, listEvents, toLocal, updateEvent, type CalEvent } from './calendar.ts';
import { googleStatus, NotConnectedError } from './google.ts';
import { nowText } from './config.ts';

export const CHRONOS_MODEL = process.env.CHRONOS_MODEL || 'claude-sonnet-5-5';

const WORK_TEXT = process.env.PRACOVNI_DOBA || '08:00-20:00';

export const CHRONOS_SYSTEM = `Jsi Chronos, kalendářní agent ve virtuálním „Městečku Ondik“. Staráš se o Google Kalendář svého uživatele (jeho hlavní kalendář). Mluvíš česky, stručně a věcně.

Jak pracuješ:
- Kalendář čti a měň VÝHRADNĚ přes nástroje. Nikdy si nevymýšlej události ani volné termíny – vždy se podívej.
- Všechny časy jsou v pražském čase. Do nástrojů posílej datum jako RRRR-MM-DD a čas jako RRRR-MM-DDTHH:MM. „Zítra“, „v pátek“, „příští týden“ počítej od aktuálního data v systémové zprávě.
- Uživatel si přeje, abys změny dělal rovnou: když tě požádá o vytvoření, přesunutí nebo smazání události, rovnou to proveď a pak krátce napiš, co jsi udělal (název, den, čas).
- Ptej se jen, když požadavek není jednoznačný – např. když by změna mohla zasáhnout víc událostí, nevíš, kterou myslí, nebo chybí den či čas.
- Když délka události není řečená, dej jí 1 hodinu. Celodenní akce (dovolená, narozeniny) zakládej jako celodenní.
- Volné termíny hledej v čase ${WORK_TEXT}, každý den, pokud uživatel neřekne jinak.
- Před smazáním nebo úpravou si událost najdi (list_events), abys měl její id.
- Když kalendář není propojený, vysvětli, že se propojuje v panelu Chronose na záložce „Kalendář“ (stačí kliknout na jeho box).
- Odpovídej krátce, uživatel tě často čte na telefonu. Přehled událostí piš jako odrážky začínající „- “ (např. „- út 14:00–15:00 Porada“). Bez nadpisů a tabulek.`;

const DATE_DESC = 'Datum RRRR-MM-DD, nebo datum a čas RRRR-MM-DDTHH:MM (pražský čas)';

export const CHRONOS_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'list_events',
    description: 'Vypíše události v hlavním kalendáři v daném období (včetně opakovaných). Volitelně hledá podle textu.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: `Začátek období. ${DATE_DESC}` },
        to: { type: 'string', description: `Konec období (datum se počítá celé). ${DATE_DESC}` },
        query: { type: 'string', description: 'Hledaný text v názvu/popisu/místě (nepovinné)' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_free_time',
    description: `Najde volné úseky v kalendáři v daném období, v čase ${WORK_TEXT}. Vrací úseky aspoň zadané délky.`,
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: `Začátek období. ${DATE_DESC}` },
        to: { type: 'string', description: `Konec období. ${DATE_DESC}` },
        minutes: { type: 'integer', description: 'Minimální délka volného úseku v minutách' },
      },
      required: ['from', 'to', 'minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_event',
    description: 'Vytvoří událost v hlavním kalendáři.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Název události' },
        start: { type: 'string', description: `Začátek. ${DATE_DESC}. Jen datum = celodenní akce.` },
        end: { type: 'string', description: `Konec (nepovinné, výchozí +1 h; u celodenních poslední den akce). ${DATE_DESC}` },
        location: { type: 'string', description: 'Místo (nepovinné)' },
        description: { type: 'string', description: 'Poznámka (nepovinné)' },
        reminder_minutes: { type: 'integer', description: 'Připomenutí X minut předem (nepovinné)' },
      },
      required: ['summary', 'start'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_event',
    description: 'Upraví existující událost (přesun, přejmenování, změna místa…). Pošli jen to, co se mění.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id události z list_events' },
        summary: { type: 'string' },
        start: { type: 'string', description: DATE_DESC },
        end: { type: 'string', description: DATE_DESC },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_event',
    description: 'Smaže událost z kalendáře.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id události z list_events' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

/** Popis práce pro bublinu nad robotem a pro chat. */
export const TOOL_LABELS: Record<string, string> = {
  list_events: '📅 Dívám se do kalendáře…',
  find_free_time: '🔎 Hledám volno…',
  create_event: '✍️ Zapisuji do kalendáře…',
  update_event: '✏️ Upravuji událost…',
  delete_event: '🗑️ Mažu událost…',
};

const str = (v: unknown, name: string, required = true): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new Error(`Chybí „${name}“.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new Error(`„${name}“ musí být text.`);
  return v;
};
const int = (v: unknown, name: string, required = true): number | undefined => {
  if (v === undefined || v === null) {
    if (required) throw new Error(`Chybí „${name}“.`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`„${name}“ musí být kladné celé číslo.`);
  return n;
};

const compact = (e: CalEvent) => ({ id: e.id, nazev: e.summary, zacatek: e.start, konec: e.end, ...(e.allDay ? { celodenni: true } : {}), ...(e.location ? { misto: e.location } : {}), ...(e.description ? { popis: e.description } : {}) });

/** Spustí nástroj a vrátí výsledek jako text pro model. */
export async function runChronosTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_events': {
      const list = await listEvents({ from: str(input.from, 'from')!, to: str(input.to, 'to')!, query: str(input.query, 'query', false) });
      return JSON.stringify({ pocet: list.length, udalosti: list.map(compact) });
    }
    case 'find_free_time': {
      const slots = await freeSlots({ from: str(input.from, 'from')!, to: str(input.to, 'to')!, minutes: int(input.minutes, 'minutes')! });
      return JSON.stringify({ volno: slots });
    }
    case 'create_event': {
      const e = await createEvent({
        summary: str(input.summary, 'summary')!,
        start: str(input.start, 'start')!,
        end: str(input.end, 'end', false),
        location: str(input.location, 'location', false),
        description: str(input.description, 'description', false),
        reminderMinutes: int(input.reminder_minutes, 'reminder_minutes', false),
      });
      return JSON.stringify({ vytvoreno: compact(e) });
    }
    case 'update_event': {
      const e = await updateEvent(str(input.id, 'id')!, {
        summary: str(input.summary, 'summary', false),
        start: str(input.start, 'start', false),
        end: str(input.end, 'end', false),
        location: str(input.location, 'location', false),
        description: str(input.description, 'description', false),
      });
      return JSON.stringify({ upraveno: compact(e) });
    }
    case 'delete_event': {
      await deleteEvent(str(input.id, 'id')!);
      return JSON.stringify({ smazano: input.id });
    }
    default:
      throw new Error(`Neznámý nástroj ${name}`);
  }
}

/** Podklady přiložené ke každé otázce: čas, stav propojení, dnešek a zítřek. */
export async function chronosContext(): Promise<string> {
  const now = new Date();
  const parts = [`Aktuální datum a čas: ${nowText(now)} (${toLocal(now)}).`];
  const st = await googleStatus();
  if (!st.connected) {
    parts.push('Google Kalendář NENÍ propojený – nástroje nebudou fungovat.');
    return parts.join('\n');
  }
  try {
    const today = toLocal(now).slice(0, 10);
    const tomorrow = toLocal(new Date(now.getTime() + 86_400_000)).slice(0, 10);
    const ev = (await agenda(2)).filter((e) => e.start.slice(0, 10) <= tomorrow);
    const fmt = (e: CalEvent) => `- ${e.start.slice(0, 10) === today ? 'dnes' : 'zítra'} ${e.allDay ? 'celý den' : `${e.start.slice(11)}–${e.end.slice(11)}`} ${e.summary}`;
    parts.push(`Kalendář propojen (${st.email ?? 'účet Google'}). Dnes a zítra:\n${ev.length ? ev.map(fmt).join('\n') : '- nic'}`);
  } catch (err) {
    parts.push(err instanceof NotConnectedError ? 'Google Kalendář NENÍ propojený.' : `Kalendář se teď nepodařilo načíst: ${err instanceof Error ? err.message : err}`);
  }
  return parts.join('\n');
}
