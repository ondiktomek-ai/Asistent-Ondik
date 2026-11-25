/**
 * Počítadlo útraty: po každém volání Claude API sečte tokeny a podle ceníku odhadne cenu.
 * Je to odhad – přesná čísla jsou v Claude Console (Usage / Cost).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { readJson, writeJson } from './store.ts';

const FILE = 'utrata.json';

/** Ceník v USD za milion tokenů (vstup, výstup, čtení z cache). Zápis do cache = 1,25 × vstup. */
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
};
const FALLBACK_PRICE = PRICES['claude-opus-5-5'];
/** Hledání na webu: 10 USD za 1000 dotazů. Čtení stránek se platí jen jako tokeny. */
const WEB_SEARCH_USD = 0.01;
/** Kurz pro zobrazení v korunách (dá se změnit v .env). */
export const USD_CZK = Number(process.env.KURZ_USD) || 23;

interface Bucket {
  usd: number;
  calls: number;
  inTok: number;
  outTok: number;
  searches: number;
}
interface UsageFile {
  /** den (YYYY-MM-DD, pražský čas) → agent → součty */
  days: Record<string, Record<string, Bucket>>;
}

type AnyUsage = Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens'> & {
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function costUsd(model: string, u: AnyUsage): number {
  const base = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`)) ?? '';
  const p = PRICES[base] ?? FALLBACK_PRICE;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  return (u.input_tokens * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.cacheRead + u.output_tokens * p.out) / 1e6 + searches * WEB_SEARCH_USD;
}

const day = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });

// zápisy za sebou, ať se dvě současná volání nepřepíšou
let queue: Promise<unknown> = Promise.resolve();

/** Zapíše jedno volání API (agent = kdo ho udělal). Chyba zápisu nikdy neshodí odpověď. */
export function recordUsage(agentId: string, model: string, usage: AnyUsage | null | undefined): void {
  if (!usage) return;
  queue = queue
    .then(async () => {
      const f = await readJson<UsageFile>(FILE, { days: {} });
      const d = (f.days[day()] ??= {});
      const b = (d[agentId] ??= { usd: 0, calls: 0, inTok: 0, outTok: 0, searches: 0 });
      b.usd += costUsd(model, usage);
      b.calls += 1;
      b.inTok += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      b.outTok += usage.output_tokens;
      b.searches += usage.server_tool_use?.web_search_requests ?? 0;
      // necháme posledních ~120 dní
      const keep = Object.keys(f.days).sort().slice(-120);
      f.days = Object.fromEntries(keep.map((k) => [k, f.days[k]]));
      await writeJson(FILE, f);
    })
    .catch((err) => console.warn('Útrata se nezapsala:', err instanceof Error ? err.message : err));
}

export interface SpendSummary {
  today: { usd: number; czk: number; calls: number };
  month: { usd: number; czk: number; calls: number };
  /** útrata za tento měsíc podle agentů, od nejvyšší */
  byAgent: { id: string; usd: number; czk: number; calls: number; searches: number }[];
  /** posledních 14 dní (pro malý graf) */
  days: { date: string; czk: number }[];
  rate: number;
}

export async function getSpend(): Promise<SpendSummary> {
  await queue;
  const f = await readJson<UsageFile>(FILE, { days: {} });
  const today = day();
  const month = today.slice(0, 7);
  const sum = (buckets: Bucket[]) => buckets.reduce((a, b) => ({ usd: a.usd + b.usd, calls: a.calls + b.calls }), { usd: 0, calls: 0 });
  const t = sum(Object.values(f.days[today] ?? {}));
  const monthDays = Object.entries(f.days).filter(([k]) => k.startsWith(month));
  const m = sum(monthDays.flatMap(([, v]) => Object.values(v)));
  const agents: Record<string, { usd: number; calls: number; searches: number }> = {};
  for (const [, v] of monthDays)
    for (const [id, b] of Object.entries(v)) {
      const a = (agents[id] ??= { usd: 0, calls: 0, searches: 0 });
      a.usd += b.usd;
      a.calls += b.calls;
      a.searches += b.searches;
    }
  const czk = (usd: number) => Math.round(usd * USD_CZK * 100) / 100;
  const days: { date: string; czk: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = day(new Date(Date.now() - i * 86_400_000));
    days.push({ date: d, czk: czk(sum(Object.values(f.days[d] ?? {})).usd) });
  }
  return {
    today: { usd: t.usd, czk: czk(t.usd), calls: t.calls },
    month: { usd: m.usd, czk: czk(m.usd), calls: m.calls },
    byAgent: Object.entries(agents)
      .map(([id, a]) => ({ id, ...a, czk: czk(a.usd) }))
      .sort((a, b) => b.usd - a.usd),
    days,
    rate: USD_CZK,
  };
}

/** Krátký text pro Bita. */
export async function spendText(): Promise<string> {
  const s = await getSpend();
  const top = s.byAgent.slice(0, 5).map((a) => `${a.id} ${a.czk.toFixed(2)} Kč`).join(', ');
  return `Odhad útraty Claude API: dnes ${s.today.czk.toFixed(2)} Kč, tento měsíc ${s.month.czk.toFixed(2)} Kč (${s.month.calls} volání). Podle agentů: ${top || 'zatím nic'}. Přesná čísla jsou v Claude Console (Usage / Cost).`;
}
