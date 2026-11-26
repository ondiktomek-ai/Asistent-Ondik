/**
 * Lexa – rešeršní agentka. Hledá a čte web (vestavěné nástroje Claude API)
 * a výsledek rešerše umí vylepit jako plakátek.
 */
import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { nowText } from './config.ts';
import { readJson, writeJson } from './store.ts';

export const LEXA_MODEL = process.env.LEXA_MODEL || 'claude-haiku-5-5';
/** Kolikrát smí Lexa v jedné odpovědi hledat / číst stránku (kvůli ceně). */
const MAX_SEARCHES = Number(process.env.LEXA_MAX_HLEDANI || 6);
const MAX_FETCHES = Number(process.env.LEXA_MAX_CTENI || 5);

export const LEXA_SYSTEM = `Jsi Lexa, rešeršní agentka ve virtuálním „Městečku Ondik“. Bydlíš a pracuješ v knihovně – boxu plném knih. Mluvíš česky, přátelsky a přesně.

Co děláš:
- Hledáš informace na webu (web_search) a čteš stránky (web_fetch). Porovnáváš možnosti, shrnuješ články a sepisuješ přehledy.
- Vycházej z toho, co opravdu najdeš. Fakta, čísla a ceny uváděj se zdrojem. Když se zdroje rozcházejí nebo něco nevíš jistě, řekni to.
- Hledej chytře: obvykle 2–4 hledání stačí, stránky čti jen ty nejslibnější. Uživatel bydlí v Lipníku nad Bečvou (Olomoucký kraj) – když se dotaz týká míst, obchodů nebo služeb, ber to v úvahu. Ceny uváděj v Kč, když to jde.
- Když uživatel chce plakátek (nebo je rešerše větší a hodí se přehled), zavolej create_poster s výsledkem: výstižný titulek, krátké shrnutí, 2–4 sekce s body, klíčová čísla, doporučení a zdroje (název + URL ze skutečně použitých stránek). Do chatu pak napiš jen krátce, co jsi zjistila – plakátek se mu otevře sám.
- Plakátek umíš vylepit i BEZ hledání na webu: z textu nebo podkladů, které ti uživatel dá („udělej plakátek z tohohle“), z toho, co už je v rozhovoru (třeba od kolegy), nebo ze svých obecných znalostí u témat, kde nejde o aktuální informace (návody, vysvětlení, tipy, plány, seznamy). Na web jdi jen tehdy, když jde o aktuální věci (ceny, otevírací doby, novinky, akce) nebo když si nejsi jistá. Když hledání nejde nebo selže, plakátek stejně vylep z toho, co víš, a řekni to.
- Bez hledání nech sources prázdné – nikdy si nevymýšlej odkazy. Fakta, která nemáš ověřená z webu, formuluj opatrně.
- Odpovídej stručně, uživatel tě často čte na telefonu. Odrážky začínající „- “, bez nadpisů a tabulek v chatu.`;

const POSTER_TOOL: Anthropic.Beta.BetaTool = {
  name: 'create_poster',
  description: 'Vylepí plakátek – z rešerše na webu, z podkladů od uživatele nebo z vlastních znalostí. Hned se uživateli otevře a uloží do knihovny plakátků.',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Zadání rešerše jednou větou (co uživatel chtěl)' },
      title: { type: 'string', description: 'Titulek plakátku, max. 70 znaků' },
      subtitle: { type: 'string', description: 'Podtitulek (nepovinné)' },
      summary: { type: 'string', description: 'Shrnutí ve 2–4 větách' },
      sections: {
        type: 'array',
        description: '2–4 sekce s body',
        items: {
          type: 'object',
          properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
          required: ['heading', 'points'],
          additionalProperties: false,
        },
      },
      facts: {
        type: 'array',
        description: 'Klíčová čísla/fakta (0–4), např. cena, vzdálenost, datum',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'string' } },
          required: ['label', 'value'],
          additionalProperties: false,
        },
      },
      verdict: { type: 'string', description: 'Doporučení nebo závěr (nepovinné)' },
      sources: {
        type: 'array',
        description: 'Skutečně použité webové zdroje; bez hledání na webu prázdné (nevymýšlet)',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, url: { type: 'string' } },
          required: ['title', 'url'],
          additionalProperties: false,
        },
      },
    },
    required: ['topic', 'title', 'summary', 'sections'],
    additionalProperties: false,
  },
};

export const LEXA_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  // Haiku 5.5 používá základní verze webových nástrojů (bez dynamického filtrování).
  { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES, user_location: { type: 'approximate', city: 'Lipník nad Bečvou', region: 'Olomoucký kraj', timezone: 'Europe/Prague' } },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: MAX_FETCHES },
  POSTER_TOOL,
];

export const LEXA_TOOL_LABELS: Record<string, string> = {
  web_search: '🔎 Hledám na webu…',
  web_fetch: '📖 Čtu stránku…',
  create_poster: '🖨️ Tisknu plakátek…',
};

export async function lexaContext(): Promise<string> {
  return `Aktuální datum a čas: ${nowText()}.`;
}

// ---------------------------------------------------------------- plakátky z rešerší

export interface ResearchPoster {
  id: string;
  createdAt: string;
  topic: string;
  title: string;
  subtitle: string;
  summary: string;
  sections: { heading: string; points: string[] }[];
  facts: { label: string; value: string }[];
  verdict: string;
  sources: { title: string; url: string }[];
}

const FILE = 'lexa-plakaty.json';
const KEEP = 60;

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

export async function savePoster(input: Record<string, unknown>): Promise<ResearchPoster> {
  const title = s(input.title, 120);
  const summary = s(input.summary, 1200);
  if (!title || !summary) throw new Error('Plakátek potřebuje titulek a shrnutí.');
  const poster: ResearchPoster = {
    id: randomUUID().slice(0, 12),
    createdAt: new Date().toISOString(),
    topic: s(input.topic, 300),
    title,
    subtitle: s(input.subtitle, 200),
    summary,
    sections: arr(input.sections)
      .slice(0, 6)
      .map((x) => ({ heading: s((x as Record<string, unknown>)?.heading, 100), points: arr((x as Record<string, unknown>)?.points).slice(0, 8).map((p) => s(p, 400)).filter(Boolean) }))
      .filter((x) => x.heading && x.points.length),
    facts: arr(input.facts)
      .slice(0, 6)
      .map((x) => ({ label: s((x as Record<string, unknown>)?.label, 60), value: s((x as Record<string, unknown>)?.value, 80) }))
      .filter((x) => x.label && x.value),
    verdict: s(input.verdict, 600),
    sources: arr(input.sources)
      .slice(0, 12)
      .map((x) => ({ title: s((x as Record<string, unknown>)?.title, 160), url: s((x as Record<string, unknown>)?.url, 500) }))
      .filter((x) => /^https?:\/\//.test(x.url)),
  };
  const list = await readJson<ResearchPoster[]>(FILE, []);
  list.unshift(poster);
  list.splice(KEEP);
  await writeJson(FILE, list);
  return poster;
}

export async function listPosters() {
  return (await readJson<ResearchPoster[]>(FILE, [])).map((p) => ({ id: p.id, createdAt: p.createdAt, title: p.title, topic: p.topic }));
}

export async function getPoster(id: string) {
  return (await readJson<ResearchPoster[]>(FILE, [])).find((p) => p.id === id) ?? null;
}

export async function deletePoster(id: string) {
  const list = await readJson<ResearchPoster[]>(FILE, []);
  await writeJson(
    FILE,
    list.filter((p) => p.id !== id),
  );
}

export async function runLexaTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (name !== 'create_poster') throw new Error(`Neznámý nástroj ${name}`);
  const p = await savePoster(input);
  return JSON.stringify({ ulozeno: true, id: p.id, titulek: p.title });
}
