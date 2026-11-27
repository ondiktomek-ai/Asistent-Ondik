/**
 * Jarvis – mluvené hlášení („Dobrý večer, pane, je 22:58…“).
 * Server sesbírá podklady (čas, počasí, zprávy, kalendář, stav týmu), Claude z nich napíše
 * krátké hlášení rozdělené na části a prohlížeč ho přečte nahlas.
 */
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { latestNews, type NewsItem } from './news.ts';
import { getWeather, type Weather } from './weather.ts';
import { googleStatus } from './google.ts';
import { agenda, type CalEvent } from './calendar.ts';
import { getReport } from './bit.ts';
import { readJson } from './store.ts';
import { recordUsage } from './usage.ts';
import { claude } from './config.ts';
import type { MemoryItem } from './team.ts';

export const JARVIS_MODEL = process.env.JARVIS_MODEL || process.env.CLAUDE_MODEL || 'claude-opus-5-5';
/** Jak Jarvis oslovuje (dá se změnit v .env). */
export const ADDRESS = process.env.JARVIS_OSLOVENI || 'pane';

export type SegmentKind = 'uvod' | 'pocasi' | 'svet' | 'cesko' | 'region' | 'program' | 'tym' | 'otazka';

export interface BriefingSegment {
  kind: SegmentKind;
  /** text k zobrazení (titulky) */
  text: string;
  /** text k přečtení nahlas (čísla a časy slovy, bez zkratek) */
  say: string;
  /** zprávy, o kterých část mluví (pro kartičky) */
  items: { title: string; source: string; link: string }[];
}

export interface Briefing {
  id: string;
  createdAt: string;
  segments: BriefingSegment[];
  weather: {
    temp: number;
    text: string;
    icon: string;
    min?: number;
    max?: number;
    /** příštích 12 hodin (pro graf) */
    hourly?: { time: string; temp: number; precipProb: number }[];
    tomorrow?: { text: string; icon: string; min: number; max: number };
  } | null;
  events: { start: string; summary: string; allDay: boolean; location?: string }[];
  calendarConnected: boolean;
}

const SYSTEM = `Jsi Jarvis – osobní hlasový asistent uživatele ve virtuálním městečku „OndiVerse“ (jinak známý jako Ondik, šéf týmu AI agentů). Uživatel bydlí v Lipníku nad Bečvou. Právě mu přednášíš krátké mluvené hlášení – jako Jarvis z Iron Mana: klidně, elegantně, s noblesou a lehkým suchým humorem, nikdy ne patolízalsky.

Pravidla hlášení:
- Vykáš a oslovuješ „${ADDRESS}“ (v úvodu a nanejvýš ještě jednou).
- Rozděl hlášení do částí v tomto pořadí (vynech části, pro které nejsou podklady):
  1. uvod – pozdrav podle denní doby (ráno do 9 „Dobré ráno“, přes den „Dobrý den“, večer od 18 „Dobrý večer“, v noci po půlnoci třeba „Ještě vzhůru, ${ADDRESS}?“), přesný čas a teplota venku v Lipníku.
  2. pocasi – jednou větou, co čekat (déšť, mráz, vítr, zítřek, když je večer).
  3. svet – 1–2 nejdůležitější zprávy ze světa.
  4. cesko – 1–2 nejdůležitější zprávy z Česka.
  5. region – zprávy z Lipníku a okolí (Přerov, Hranice, Olomoucký kraj), jen když nějaké jsou.
  6. program – co má dnes ještě v kalendáři (večer i první věci zítra). Když kalendář není propojený nebo je prázdný, řekni to jednou krátkou větou.
  7. tym – jen když je v podkladech něco důležitého od týmu (upozornění od Bita, např. přihlášení ke Googlu). Jinak vynech.
  8. otazka – krátká závěrečná otázka, např. „Chcete se do něčeho pustit?“ nebo konkrétní nabídka podle programu.
- Každá část 1–2 krátké věty. Celé hlášení zhruba 40–70 sekund mluveného slova. Zprávy převyprávěj vlastními slovy, věcně, bez senzace; nevymýšlej nic, co v podkladech není.
- U částí svet, cesko a region uveď v \`refs\` čísla zpráv, o kterých mluvíš. U ostatních částí nech \`refs\` prázdné.
- \`text\` je titulek k zobrazení: normální psaný text, časy jako „22:58“, teploty jako „1 °C“.
- \`say\` je to samé pro hlasovou syntézu: čísla, časy a teploty napiš slovy ve správném tvaru („dvacet dva hodin padesát osm minut“, „jeden stupeň Celsia“, „minus tři stupně“), rozepiš zkratky („ČR“ → „Česko“, „EU“ → „Evropská unie“ nebo „é ú“), žádné emoji, odkazy ani závorky.`;

const SCHEMA = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['uvod', 'pocasi', 'svet', 'cesko', 'region', 'program', 'tym', 'otazka'] },
          text: { type: 'string' },
          say: { type: 'string' },
          refs: { type: 'array', items: { type: 'integer' } },
        },
        required: ['kind', 'text', 'say', 'refs'],
        additionalProperties: false,
      },
    },
  },
  required: ['segments'],
  additionalProperties: false,
} as const;

const recent = new Map<string, Briefing>();

const prague = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', ...opts });

function weatherText(w: Weather | null) {
  if (!w) return 'Počasí není k dispozici.';
  const next = w.hourly
    .filter((_, i) => i % 3 === 0)
    .slice(0, 6)
    .map((h) => `${h.time.slice(11, 16)} ${Math.round(h.temp)} °C, srážky ${h.precipProb} %`)
    .join('; ');
  const days = w.daily.slice(0, 2).map((d, i) => `${i === 0 ? 'dnes' : 'zítra'}: ${d.text}, ${Math.round(d.min)} až ${Math.round(d.max)} °C, srážky ${d.precip} mm`).join('; ');
  return `${w.place} teď ${Math.round(w.current.temp)} °C (pocitově ${Math.round(w.current.feels)} °C), ${w.current.text}, vítr ${Math.round(w.current.wind)} km/h.\nPříštích 18 h: ${next}\n${days}`;
}

/** Zprávy za posledních 12 hodin, z každé oblasti nejvýš 12, očíslované. */
function pickNews(items: NewsItem[]) {
  const since = Date.now() - 12 * 3600_000;
  const fresh = items.filter((i) => Date.parse(i.published) >= since || Date.parse(i.seen) >= since);
  const pool = fresh.length >= 6 ? fresh : items;
  const picked: NewsItem[] = [];
  for (const scope of ['svet', 'cesko', 'region'] as const) picked.push(...pool.filter((i) => i.scope === scope).slice(0, 12));
  return picked;
}

const SCOPE_NAME = { svet: 'svět', cesko: 'Česko', region: 'region Lipník a okolí' } as const;

export async function createBriefing(): Promise<Briefing> {
  const now = new Date();
  const [weather, news, gs, report, memory] = await Promise.all([
    getWeather().catch(() => null),
    latestNews(150).catch(() => ({ items: [] as NewsItem[] })),
    googleStatus().catch(() => null),
    getReport().catch(() => null),
    readJson<MemoryItem[]>('pamet.json', []),
  ]);
  const calendarConnected = !!gs?.connected;
  let events: CalEvent[] = [];
  if (calendarConnected) events = await agenda(2).catch(() => []);
  const nowLocal = prague(now, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  // zbývající dnešní a zítřejší události (pražský čas „RRRR-MM-DDTHH:MM“)
  const todayYmd = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
  const localNow = `${todayYmd}T${prague(now, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  const upcoming = events.filter((e) => (e.allDay ? e.start >= todayYmd : e.end > localNow)).slice(0, 8);

  const items = pickNews(news.items);
  const newsText = items.length
    ? (['svet', 'cesko', 'region'] as const)
        .map((scope) => {
          const list = items.map((n, i) => ({ n, i })).filter(({ n }) => n.scope === scope);
          return `${SCOPE_NAME[scope].toUpperCase()}:\n${list.length ? list.map(({ n, i }) => `${i + 1}. ${n.source}, ${prague(new Date(n.published), { hour: '2-digit', minute: '2-digit' })}: ${n.title}${n.summary ? ` — ${n.summary.slice(0, 200)}` : ''}`).join('\n') : '(nic)'}`;
        })
        .join('\n\n')
    : '(zprávy nejsou k dispozici)';
  const eventsText = !calendarConnected
    ? 'Kalendář není propojený.'
    : upcoming.length
      ? upcoming.map((e) => `- ${e.allDay ? `${e.start} celý den` : e.start.replace('T', ' ')}: ${e.summary}${e.location ? ` (${e.location})` : ''}`).join('\n')
      : 'Dnes ani zítra nic v kalendáři.';
  const warnings = report?.checks.filter((c) => c.state === 'warn' || c.state === 'error').map((c) => `- ${c.name}: ${c.detail}`) ?? [];
  const mem = memory.slice(-25).map((m) => `- ${m.text}`).join('\n');

  const prompt = `Je ${prague(now, { weekday: 'long', day: 'numeric', month: 'long' })}, ${nowLocal.slice(-5)} (pražský čas).

POČASÍ:
${weatherText(weather)}

ZPRÁVY (čísla používej v refs):
${newsText}

KALENDÁŘ (dnes a zítra, od teď):
${eventsText}

TÝM (upozornění od Bita):
${warnings.length ? warnings.join('\n') : '(vše v pořádku)'}

CO O UŽIVATELI VÍME (společná paměť, použij jen když se to hodí):
${mem || '(nic)'}

Napiš hlášení.`;

  const res = await claude().beta.messages.create({
    model: JARVIS_MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    ...(/opus|sonnet/.test(JARVIS_MODEL) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  recordUsage('ondik', res.model || JARVIS_MODEL, res.usage);
  if (res.stop_reason === 'refusal') throw new Error('Jarvis hlášení odmítl připravit.');
  if (res.stop_reason === 'max_tokens') throw new Error('Hlášení se nevešlo do limitu.');
  const block = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new Error('Prázdná odpověď.');
  const out = JSON.parse(block.text) as { segments: { kind: SegmentKind; text: string; say: string; refs: number[] }[] };

  const briefing: Briefing = {
    id: randomUUID().slice(0, 8),
    createdAt: now.toISOString(),
    segments: out.segments
      .filter((s) => s.text.trim() && s.say.trim())
      .map((s) => ({
        kind: s.kind,
        text: s.text.trim(),
        say: s.say.trim(),
        items: [...new Set(s.refs)]
          .map((r) => items[r - 1])
          .filter(Boolean)
          .slice(0, 3)
          .map((n) => ({ title: n.title, source: n.source, link: n.link })),
      })),
    weather: weather
      ? {
          temp: weather.current.temp,
          text: weather.current.text,
          icon: weather.current.icon,
          min: weather.daily[0]?.min,
          max: weather.daily[0]?.max,
          hourly: weather.hourly.slice(0, 12).map((h) => ({ time: h.time.slice(11, 16), temp: h.temp, precipProb: h.precipProb })),
          tomorrow: weather.daily[1] ? { text: weather.daily[1].text, icon: weather.daily[1].icon, min: weather.daily[1].min, max: weather.daily[1].max } : undefined,
        }
      : null,
    events: upcoming.map((e) => ({ start: e.start, summary: e.summary, allDay: e.allDay, location: e.location })),
    calendarConnected,
  };
  if (!briefing.segments.length) throw new Error('Hlášení vyšlo prázdné.');
  recent.set(briefing.id, briefing);
  if (recent.size > 5) recent.delete(recent.keys().next().value!);
  return briefing;
}

/** Podklady pro hlasový rozhovor s Ondikem/Jarvisem (přikládají se k otázce). */
export function voiceContext(briefingId?: string): string {
  const b = briefingId ? recent.get(briefingId) : undefined;
  return `Uživatel s tebou teď mluví HLASEM – jsi jeho Jarvis a tvoje odpověď se mu přečte nahlas. Odpovídej jako Jarvis: vykej, oslovení „${ADDRESS}“ jen občas, klidně a s noblesou. 1–4 krátké věty, žádné odrážky, nadpisy, emoji, tabulky ani odkazy. Časy, data a čísla piš tak, aby se dobře četla nahlas (např. „v osm večer“, „tři stupně“). Když potřebuješ kolegy, klidně je zapoj (ask_colleague) a výsledek shrň pár větami. Rozpoznaný text může obsahovat chyby z diktování – domysli rozumný význam.${
    b ? `\n\nPřed chvílí jsi uživateli přednesl toto hlášení (odpovídá na něj):\n${b.segments.map((s) => s.text).join(' ')}` : ''
  }`;
}
