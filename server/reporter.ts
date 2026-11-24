/**
 * Echo – zpravodaj. Každých 10 minut stahuje zprávy (RSS) a každou celou hodinu
 * sepíše plakátek se souhrnem toho, co se stalo, a s vývojem počasí.
 */
import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { latestNews, newsSince, pollNews, type NewsItem } from './news.ts';
import { getWeather, weatherSentence, type Weather } from './weather.ts';
import { readJson, writeJson } from './store.ts';
import { apiKeyConfigured } from './config.ts';

export const REPORTER_MODEL = process.env.REPORTER_MODEL || 'claude-haiku-5-5';
const POLL_MINUTES = Number(process.env.ZPRAVY_INTERVAL_MIN || 10);
const FILE = 'digests.json';
const KEEP = 72;

export interface DigestEntry {
  text: string;
  source: string;
  link?: string;
}

export interface Digest {
  id: string;
  createdAt: string;
  /** Od kdy souhrn zprávy zahrnuje. */
  from: string;
  ai: boolean;
  model: string | null;
  note: string | null;
  headline: string;
  summary: string;
  world: DigestEntry[];
  czech: DigestEntry[];
  region: DigestEntry[];
  weatherText: string;
  weather: Weather | null;
  newsCount: number;
}

let digests: Digest[] | null = null;
let generating = false;
let lastError: string | null = null;

async function loadDigests() {
  digests ??= await readJson<Digest[]>(FILE, []);
  return digests;
}

export async function digestState() {
  const list = await loadDigests();
  return {
    latest: list[0] ?? null,
    history: list.map((d) => ({ id: d.id, createdAt: d.createdAt, headline: d.headline, ai: d.ai })),
    generating,
    lastError,
    model: REPORTER_MODEL,
  };
}

export async function getDigest(id: string) {
  return (await loadDigests()).find((d) => d.id === id) ?? null;
}

// ---------------------------------------------------------------- souhrn přes Claude

const ZPRAVA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'cislo'],
  properties: {
    text: { type: 'string', description: 'Zpráva jednou větou česky' },
    cislo: { type: 'integer', description: 'Číslo zdrojové zprávy ze seznamu' },
  },
} as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titulek', 'shrnuti', 'svet', 'cesko', 'region', 'pocasi'],
  properties: {
    titulek: { type: 'string', description: 'Hlavní titulek hodiny, max. 80 znaků' },
    shrnuti: { type: 'string', description: '2–3 věty: co je teď nejdůležitější' },
    svet: { type: 'array', items: ZPRAVA },
    cesko: { type: 'array', items: ZPRAVA },
    region: { type: 'array', items: ZPRAVA },
    pocasi: { type: 'string', description: '1–2 věty o vývoji počasí' },
  },
} as const;

const SYSTEM = `Jsi Echo, zpravodaj v „Městečku Ondik“. Každou hodinu píšeš krátký plakátek pro jednoho čtenáře z Lipníku nad Bečvou.
Pravidla:
- Vycházej POUZE ze zpráv v seznamu. Nic si nevymýšlej a nepřidávej vlastní fakta.
- Vyber to nejdůležitější: do každé sekce nejvýš 4 zprávy, seřazené podle důležitosti. Když pro sekci nic není, nech ji prázdnou.
- „svet“ = zahraničí, „cesko“ = celá ČR, „region“ = Olomoucký kraj, Přerovsko, Lipník. Zprávu z obecného zdroje zařaď podle obsahu.
- Každou zprávu napiš jednou srozumitelnou větou česky (i když je zdroj anglicky) a uveď její číslo ze seznamu.
- Stejnou událost z více zdrojů uveď jen jednou.
- Tón: věcný, klidný, bez senzace. Počasí popiš lidsky (jak se oblékat, kdy zmokne).`;

function formatNews(items: NewsItem[]) {
  return items
    .map((n, i) => `${i + 1}. [${n.scope}] ${n.source}, ${n.published.slice(11, 16)} UTC: ${n.title}${n.summary ? ` — ${n.summary}` : ''}`)
    .join('\n');
}

function formatWeather(w: Weather | null) {
  if (!w) return 'Počasí není k dispozici.';
  const hours = w.hourly
    .filter((_, i) => i % 3 === 0)
    .map((h) => `${h.time.slice(11, 16)} ${Math.round(h.temp)}°C, srážky ${h.precipProb}%`)
    .join('; ');
  const days = w.daily.map((d) => `${d.date}: ${d.text}, ${Math.round(d.min)}–${Math.round(d.max)}°C, srážky ${d.precip} mm`).join('; ');
  return `${w.place}, teď ${w.current.temp}°C (pocitově ${w.current.feels}°C), ${w.current.text}, vítr ${w.current.wind} km/h.\nPříštích 24 h: ${hours}\nDny: ${days}`;
}

let client: Anthropic | null = null;

async function aiDigest(items: NewsItem[], weather: Weather | null) {
  client ??= new Anthropic();
  const now = new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const res = await client.messages.create({
    model: REPORTER_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: 'user',
        content: `Je ${now}. Sepiš plakátek.\n\nZPRÁVY (${items.length}):\n${formatNews(items) || '(žádné nové zprávy)'}\n\nPOČASÍ:\n${formatWeather(weather)}`,
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('Model souhrn odmítl napsat.');
  if (res.stop_reason === 'max_tokens') throw new Error('Souhrn se nevešel do limitu.');
  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Prázdná odpověď.');
  const out = JSON.parse(textBlock.text) as {
    titulek: string;
    shrnuti: string;
    svet: { text: string; cislo: number }[];
    cesko: { text: string; cislo: number }[];
    region: { text: string; cislo: number }[];
    pocasi: string;
  };
  const map = (list: { text: string; cislo: number }[]): DigestEntry[] =>
    list.slice(0, 4).map((e) => {
      const src = items[e.cislo - 1];
      return { text: e.text, source: src?.source ?? '', link: src?.link };
    });
  return { headline: out.titulek, summary: out.shrnuti, world: map(out.svet), czech: map(out.cesko), region: map(out.region), weatherText: out.pocasi };
}

/** Souhrn bez AI – když chybí klíč nebo API selže. */
function plainDigest(items: NewsItem[], weather: Weather | null) {
  const pick = (scope: NewsItem['scope']): DigestEntry[] =>
    items
      .filter((i) => i.scope === scope)
      .slice(0, 4)
      .map((i) => ({ text: i.title, source: i.source, link: i.link }));
  return {
    headline: items[0]?.title ?? 'Klidná hodina – žádné nové zprávy',
    summary: items.length ? `Za poslední hodinu přibylo ${items.length} zpráv.` : 'Od minulého plakátku se nic nového neobjevilo.',
    world: pick('svet'),
    czech: pick('cesko'),
    region: pick('region'),
    weatherText: weather ? weatherSentence(weather) : 'Počasí se nepodařilo načíst.',
  };
}

export async function generateDigest(): Promise<Digest> {
  if (generating) throw new Error('Souhrn se právě píše.');
  generating = true;
  try {
    const list = await loadDigests();
    const from = list[0] ? Date.parse(list[0].createdAt) : Date.now() - 3600_000;
    let items = await newsSince(Math.min(from, Date.now() - 3600_000), 60);
    if (items.length < 5) items = await newsSince(Date.now() - 3 * 3600_000, 40);

    let weather: Weather | null = null;
    try {
      weather = await getWeather();
    } catch (err) {
      console.warn('[echo] počasí:', err instanceof Error ? err.message : err);
    }

    let content: Awaited<ReturnType<typeof aiDigest>>;
    let ai = false;
    let note: string | null = null;
    if (apiKeyConfigured()) {
      try {
        content = await aiDigest(items, weather);
        ai = true;
      } catch (err) {
        note = `AI souhrn se nepovedl (${err instanceof Error ? err.message : 'chyba'}), zobrazuji titulky.`;
        console.warn('[echo]', note);
        content = plainDigest(items, weather);
      }
    } else {
      note = 'Bez API klíče – zobrazuji jen titulky.';
      content = plainDigest(items, weather);
    }

    const digest: Digest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      from: new Date(from).toISOString(),
      ai,
      model: ai ? REPORTER_MODEL : null,
      note,
      ...content,
      weather,
      newsCount: items.length,
    };
    list.unshift(digest);
    list.splice(KEEP);
    await writeJson(FILE, list);
    lastError = null;
    return digest;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    generating = false;
  }
}

// ---------------------------------------------------------------- plánování

let started = false;

export function startReporter() {
  if (started) return;
  started = true;

  const poll = async () => {
    try {
      const fresh = await pollNews();
      if (fresh.length) console.log(`[echo] ${fresh.length} nových zpráv`);
    } catch (err) {
      console.warn('[echo] stahování zpráv:', err instanceof Error ? err.message : err);
    }
  };

  const hourly = async () => {
    try {
      const d = await generateDigest();
      console.log(`[echo] plakátek: ${d.headline}`);
    } catch (err) {
      console.warn('[echo] plakátek:', err instanceof Error ? err.message : err);
    }
  };

  // zprávy hned a pak pravidelně
  void poll().then(async () => {
    // po startu: když je poslední plakátek starší než hodina, napiš nový hned
    const list = await loadDigests();
    if (!list[0] || Date.now() - Date.parse(list[0].createdAt) > 3600_000) await hourly();
  });
  setInterval(poll, POLL_MINUTES * 60_000);

  // plakátek každou celou hodinu (s malou rezervou, aby se stihly stáhnout zprávy)
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 30, 0);
    next.setHours(now.getHours() + 1);
    setTimeout(async () => {
      await poll();
      await hourly();
      scheduleNext();
    }, next.getTime() - now.getTime());
  };
  scheduleNext();
}

export { latestNews };
