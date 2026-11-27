/** Chat s Bitem – údržbářem městečka a správcem nápadů na vylepšení. */
import type Anthropic from '@anthropic-ai/sdk';
import { AGENTS } from '../src/world/agents.ts';
import { addIdea, getReport, listIdeas, updateIdea, type CheckState } from './bit.ts';
import { nowText } from './config.ts';
import { spendText } from './usage.ts';

export const BIT_MODEL = process.env.BIT_MODEL || 'claude-haiku-5-5';

const TEAM = AGENTS.map((a) => `- ${a.name} (${a.role}): ${a.description}`).join('\n');

export const BIT_SYSTEM = `Jsi Bit, technik a údržbář ve virtuálním městečku „OndiVerse“. Bydlíš a pracuješ v dílně – boxu se servery. Mluvíš česky, věcně a s lehkým technickým humorem.

Co je OndiVerse: osobní AI asistent uživatele jako 3D městečko. Boxy agentů stojí v kruhu kolem radnice, na náměstí jsou stánky, roboti chodí na nákupy, navštěvují se a scházejí na poradách. Městečko běží na uživatelově počítači (Windows, spouští se ikonou na ploše) a dá se otevřít i z telefonu.
Tým:
${TEAM}

Tvoje práce:
1. Hlídáš útratu za Claude API (odhad je v podkladech; přesná čísla má uživatel v Claude Console → Usage / Cost) a hlídáš, že všechno běží: Claude API klíč, zdroje zpráv a plakátky (Echo), počasí, Google Kalendář (Chronos), data a server. Stav zjistíš nástrojem system_status. Když něco nejde, vysvětli srozumitelně, co to znamená a co má uživatel udělat (krok za krokem, bez žargonu).
2. Připomínáš přihlášení ke Googlu: aplikace je v testovacím režimu, takže přihlášení platí 7 dní. Když se blíží konec, připomeň, ať se přihlásí znovu (u Chronose v záložce Kalendář, nebo tlačítkem v upozornění).
3. Vedeš seznam vylepšení městečka. Když uživatel řekne nápad nebo přání, zapiš ho (add_idea, from = "ty") a krátce shrň, jak bys ho pochopil. Když se tě zeptá, co vylepšit, navrhni 2–3 konkrétní věci podle stavu a seznamu, a zapiš je, jen když souhlasí (from = "bit"). Priority a stavy měň přes update_idea.
- Kód městečka sám neměníš. Nápady z tvého seznamu uživatel vezme k programátorovi (Claude Code) – můžeš mu k tomu připravit stručné zadání.
- Nikdy si nevymýšlej stav systému – vždy se podívej (system_status) nebo vycházej z podkladů.
- Piš krátce, uživatel tě často čte na telefonu. Odrážky začínající „- “, bez nadpisů a tabulek.`;

export const BIT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'system_status',
    description: 'Zkontroluje teď celé městečko (API klíč, Google, zprávy, plakátky, počasí, data, server) a vrátí výsledky.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_ideas',
    description: 'Vypíše seznam nápadů na vylepšení městečka.',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['novy', 'planovany', 'hotovo', 'zamitnuty'], description: 'Jen nápady v tomto stavu (nepovinné)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'add_idea',
    description: 'Zapíše nový nápad na vylepšení městečka.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Krátký název nápadu' },
        detail: { type: 'string', description: 'Co přesně a proč (pár vět)' },
        priority: { type: 'string', enum: ['vysoka', 'stredni', 'nizka'] },
        from: { type: 'string', enum: ['ty', 'bit'], description: '„ty“ = nápad uživatele, „bit“ = tvůj návrh' },
      },
      required: ['title', 'from'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_idea',
    description: 'Upraví nápad: stav (novy, planovany, hotovo, zamitnuty), prioritu, název nebo popis.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['novy', 'planovany', 'hotovo', 'zamitnuty'] },
        priority: { type: 'string', enum: ['vysoka', 'stredni', 'nizka'] },
        title: { type: 'string' },
        detail: { type: 'string' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

export const BIT_TOOL_LABELS: Record<string, string> = {
  system_status: '🔧 Kontroluji městečko…',
  list_ideas: '📋 Listuji nápady…',
  add_idea: '✍️ Zapisuji nápad…',
  update_idea: '✏️ Upravuji nápad…',
};

const STATE_WORD: Record<CheckState, string> = { ok: 'OK', warn: 'POZOR', error: 'CHYBA', info: 'info' };
const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export async function runBitTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'system_status': {
      const r = await getReport(true);
      return JSON.stringify({ zkontrolovano: r.checkedAt, kontroly: r.checks.map((c) => ({ co: c.name, stav: STATE_WORD[c.state], detail: c.detail, rada: c.hint })) });
    }
    case 'list_ideas': {
      const all = await listIdeas();
      const list = opt(input.status) ? all.filter((i) => i.status === input.status) : all;
      return JSON.stringify({ pocet: list.length, napady: list.map((i) => ({ id: i.id, nazev: i.title, popis: i.detail, stav: i.status, priorita: i.priority, od: i.from })) });
    }
    case 'add_idea': {
      const i = await addIdea({ title: String(input.title ?? ''), detail: opt(input.detail), priority: opt(input.priority), from: input.from === 'bit' ? 'bit' : 'ty' });
      return JSON.stringify({ zapsano: { id: i.id, nazev: i.title, priorita: i.priority } });
    }
    case 'update_idea': {
      if (!opt(input.id)) throw new Error('Chybí id nápadu.');
      const i = await updateIdea(String(input.id), { status: opt(input.status), priority: opt(input.priority), title: opt(input.title), detail: opt(input.detail) });
      return JSON.stringify({ upraveno: { id: i.id, nazev: i.title, stav: i.status, priorita: i.priority } });
    }
    default:
      throw new Error(`Neznámý nástroj ${name}`);
  }
}

/** Podklady ke každé otázce: čas, poslední kontrola a otevřené nápady. */
export async function bitContext(): Promise<string> {
  const r = await getReport();
  const ideas = (await listIdeas()).filter((i) => i.status === 'novy' || i.status === 'planovany');
  return [
    `Aktuální datum a čas: ${nowText()}.`,
    `Poslední kontrola (${new Date(r.checkedAt).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' })}):`,
    ...r.checks.map((c) => `- ${c.name}: ${STATE_WORD[c.state]} – ${c.detail}`),
    await spendText(),
    `Otevřené nápady: ${ideas.length}${ideas.length ? ` (${ideas.slice(0, 5).map((i) => i.title).join('; ')})` : ''}.`,
  ].join('\n');
}
