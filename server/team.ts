/**
 * Tým: společná paměť všech agentů a deník spolupráce (kdo komu co zadal a co se zjistilo).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { AGENT_BY_ID } from '../src/world/agents.ts';
import { readJson, writeJson } from './store.ts';

// ------------------------------------------------------------------ paměť

export type MemoryKind = 'uzivatel' | 'preference' | 'projekt' | 'ukol' | 'jine';

export interface MemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  /** kdo to zapsal: id agenta, nebo „ty“ (uživatel ručně) */
  by: string;
  at: string;
}

const MEMORY_FILE = 'pamet.json';
const MEMORY_MAX = 200;
/** Kolik posledních vzpomínek dostane agent do podkladů. */
const MEMORY_IN_CONTEXT = 60;

let memQueue: Promise<unknown> = Promise.resolve();
function withMemory<T>(fn: (items: MemoryItem[]) => Promise<T> | T): Promise<T> {
  const run = memQueue.then(async () => {
    const items = await readJson<MemoryItem[]>(MEMORY_FILE, []);
    return fn(items);
  });
  memQueue = run.catch(() => {});
  return run;
}

export function listMemory(): Promise<MemoryItem[]> {
  return withMemory((items) => [...items].reverse());
}

export function addMemory(text: string, kind: MemoryKind, by: string): Promise<MemoryItem> {
  return withMemory(async (items) => {
    const clean = text.trim().slice(0, 500);
    if (!clean) throw new Error('Prázdná vzpomínka.');
    // stejnou věc nezapisujeme dvakrát
    const same = items.find((i) => i.text.toLowerCase() === clean.toLowerCase());
    if (same) return same;
    const item: MemoryItem = { id: randomUUID().slice(0, 8), text: clean, kind, by, at: new Date().toISOString() };
    items.push(item);
    await writeJson(MEMORY_FILE, items.slice(-MEMORY_MAX));
    return item;
  });
}

export function deleteMemory(id: string): Promise<boolean> {
  return withMemory(async (items) => {
    const next = items.filter((i) => i.id !== id);
    if (next.length === items.length) return false;
    await writeJson(MEMORY_FILE, next);
    return true;
  });
}

// ------------------------------------------------------------------ deník spolupráce

export interface TeamTask {
  id: string;
  from: string;
  to: string;
  task: string;
  state: 'bezi' | 'hotovo' | 'chyba';
  /** zkrácená odpověď kolegy */
  result?: string;
  at: string;
  doneAt?: string;
}

const LOG_FILE = 'tym.json';
const active = new Map<string, TeamTask>();

export function activeTasks(): TeamTask[] {
  return [...active.values()];
}

export async function teamLog(limit = 30): Promise<TeamTask[]> {
  return (await readJson<TeamTask[]>(LOG_FILE, [])).slice(-limit).reverse();
}

let logQueue: Promise<unknown> = Promise.resolve();

export function startTask(from: string, to: string, task: string): TeamTask {
  const t: TeamTask = { id: randomUUID().slice(0, 8), from, to, task: task.slice(0, 400), state: 'bezi', at: new Date().toISOString() };
  active.set(t.id, t);
  return t;
}

export function finishTask(t: TeamTask, ok: boolean, result: string) {
  active.delete(t.id);
  const done: TeamTask = { ...t, state: ok ? 'hotovo' : 'chyba', result: result.slice(0, 600), doneAt: new Date().toISOString() };
  logQueue = logQueue
    .then(async () => {
      const log = await readJson<TeamTask[]>(LOG_FILE, []);
      log.push(done);
      await writeJson(LOG_FILE, log.slice(-60));
    })
    .catch(() => {});
}

// ------------------------------------------------------------------ podklady a pravidla pro agenty

const name = (id: string) => (id === 'ty' ? 'uživatel' : (AGENT_BY_ID[id]?.name ?? id));
const KIND_LABEL: Record<MemoryKind, string> = { uzivatel: 'o uživateli', preference: 'preference', projekt: 'projekt', ukol: 'úkol', jine: 'jiné' };

/** Společná paměť a poslední spolupráce – přikládá se ke každé otázce každého agenta. */
export async function teamContext(): Promise<string> {
  const items = (await readJson<MemoryItem[]>(MEMORY_FILE, [])).slice(-MEMORY_IN_CONTEXT);
  const mem = items.length
    ? items.map((i) => `- [${i.id}] (${KIND_LABEL[i.kind] ?? i.kind}) ${i.text} — zapsal ${name(i.by)}, ${i.at.slice(0, 10)}`).join('\n')
    : '(zatím prázdná)';
  const log = (await readJson<TeamTask[]>(LOG_FILE, [])).slice(-5);
  const collab = log.length
    ? log.map((t) => `- ${t.at.slice(0, 16).replace('T', ' ')} ${name(t.from)} → ${name(t.to)}: „${t.task.slice(0, 120)}“ → ${t.state === 'hotovo' ? (t.result ?? '').slice(0, 200) : 'nepovedlo se'}`).join('\n')
    : '(zatím žádná)';
  return `SPOLEČNÁ PAMĚŤ TÝMU:\n${mem}\n\nPOSLEDNÍ SPOLUPRÁCE V TÝMU:\n${collab}`;
}

/** Pravidla týmové práce, přidaná na konec systémového promptu každého agenta. */
export function teamRules(selfId: string, canAsk: boolean): string {
  const others = Object.keys(COLLEAGUE_SKILLS)
    .filter((id) => id !== selfId)
    .map((id) => `- ${name(id)} (${id}): ${COLLEAGUE_SKILLS[id]}`)
    .join('\n');
  return `

Týmová práce:
- Celý tým sdílí společnou paměť (najdeš ji v podkladech u každé otázky). Když se dozvíš něco, co se bude hodit i příště nebo kolegům (jak se uživatel jmenuje a čemu se věnuje, co má rád, rozhodnutí, rozdělané projekty, termíny, dohody), zapiš to nástrojem remember – jednou krátkou větou, bez hesel a citlivých údajů. Zastaralou nebo chybnou vzpomínku smaž nástrojem forget. Drobnosti a jednorázové věci nezapisuj.
${
  canAsk
    ? `- Když úkol potřebuje schopnost kolegy, zadej mu ho nástrojem ask_colleague: napiš úkol tak, aby mu rozuměl bez znalosti vašeho rozhovoru (co, proč, jaký výstup chceš). Jeho odpověď pak shrň uživateli. Neptej se kolegy na to, co zvládneš sám.
Kolegové:
${others}`
    : '- Teď plníš úkol, který ti zadal kolega. Odpověz mu věcně a stručně (výsledek, ne povídání). Další kolegy už nezapojuj.'
}`;
}

/** Co který agent umí (pro rozhodování, komu co zadat). */
export const COLLEAGUE_SKILLS: Record<string, string> = {
  ondik: 'hlavní asistent na radnici – rady, plánování, texty, koordinace týmu',
  chronos: 'Google Kalendář – co je naplánováno, volné termíny, vytvoření/přesunutí/smazání události',
  lexa: 'rešerše na webu (hledá a čte stránky, uvádí zdroje), umí výsledek vylepit jako plakátek',
  echo: 'aktuální zprávy ze světa, Česka a regionu Lipník nad Bečvou a počasí pro Lipník',
  bit: 'technický stav městečka, upozornění, seznam nápadů na vylepšení, odhad útraty za Claude API',
};

export const ASK_COLLEAGUE = 'ask_colleague';

export function teamTools(selfId: string, canAsk: boolean): Anthropic.Beta.BetaTool[] {
  const tools: Anthropic.Beta.BetaTool[] = [
    {
      name: 'remember',
      description: 'Zapíše do společné paměti týmu jednu důležitou informaci, kterou uvidí všichni agenti i příště.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Jedna krátká věta, srozumitelná bez kontextu rozhovoru' },
          kind: { type: 'string', enum: ['uzivatel', 'preference', 'projekt', 'ukol', 'jine'], description: 'o uživateli / preference / projekt / úkol / jiné' },
        },
        required: ['text', 'kind'],
        additionalProperties: false,
      },
    },
    {
      name: 'forget',
      description: 'Smaže ze společné paměti zastaralou nebo chybnou vzpomínku (podle id v hranatých závorkách).',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    },
  ];
  if (canAsk) {
    tools.push({
      name: ASK_COLLEAGUE,
      description: 'Zadá úkol kolegovi z týmu a počká na jeho odpověď. Kolega má své vlastní nástroje (kalendář, web, zprávy…).',
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: Object.keys(COLLEAGUE_SKILLS).filter((id) => id !== selfId), description: 'Komu úkol zadáváš' },
          task: { type: 'string', description: 'Úkol srozumitelný bez znalosti tvého rozhovoru: co, proč a jaký výstup chceš' },
        },
        required: ['agent', 'task'],
        additionalProperties: false,
      },
    });
  }
  return tools;
}

export const TEAM_TOOL_LABELS: Record<string, string> = {
  remember: '🧠 Zapisuji si to…',
  forget: '🧽 Mažu z paměti…',
};

/** Provede paměťový nástroj; vrací null, když nejde o paměťový nástroj. */
export async function runMemoryTool(agentId: string, toolName: string, input: Record<string, unknown>): Promise<string | null> {
  if (toolName === 'remember') {
    const kind = (['uzivatel', 'preference', 'projekt', 'ukol', 'jine'] as const).includes(input.kind as MemoryKind) ? (input.kind as MemoryKind) : 'jine';
    const item = await addMemory(String(input.text ?? ''), kind, agentId);
    return JSON.stringify({ zapsano: true, id: item.id });
  }
  if (toolName === 'forget') {
    const ok = await deleteMemory(String(input.id ?? ''));
    return JSON.stringify({ smazano: ok });
  }
  return null;
}
