import { netError, serviceFailed, serviceOk } from './net.ts';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { NEWS_SOURCES, type NewsScope, type NewsSource } from './news-sources.ts';
import { readJson, writeJson } from './store.ts';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  sourceId: string;
  scope: NewsScope;
  /** Kdy zprávu vydal zdroj (ISO), případně kdy jsme ji poprvé viděli. */
  published: string;
  /** Kdy ji Echo poprvé zachytil (ISO). */
  seen: string;
}

export interface SourceStatus {
  id: string;
  name: string;
  scope: NewsScope;
  ok: boolean;
  lastCheck: string | null;
  lastError: string | null;
  items: number;
}

interface NewsDb {
  items: NewsItem[];
  sources: Record<string, SourceStatus>;
  lastPoll: string | null;
}

const FILE = 'news.json';
const KEEP_HOURS = 72;
const MAX_ITEMS = 800;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
});

let db: NewsDb | null = null;

async function load(): Promise<NewsDb> {
  db ??= await readJson<NewsDb>(FILE, { items: [], sources: {}, lastPoll: null });
  return db;
}

const asArray = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) return text((v as Record<string, unknown>)['#text']);
  return '';
}

/** Odstraní HTML značky a zbytečné mezery. */
export function clean(s: string, max = 300): string {
  const out = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out;
}

function isoDate(v: unknown): string | null {
  const t = Date.parse(text(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Přečte RSS 2.0, RSS 1.0 (RDF) i Atom a vrátí jednotný seznam zpráv. */
export function parseFeed(xml: string, source: NewsSource, now = new Date()): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const seen = now.toISOString();
  const raw: { title: unknown; link: unknown; desc: unknown; date: unknown; guid: unknown }[] = [];

  if (doc.rss?.channel) {
    for (const it of asArray(doc.rss.channel.item)) {
      raw.push({ title: it.title, link: it.link, desc: it.description, date: it.pubDate ?? it['dc:date'], guid: it.guid });
    }
  } else if (doc['rdf:RDF']) {
    for (const it of asArray(doc['rdf:RDF'].item)) {
      raw.push({ title: it.title, link: it.link, desc: it.description, date: it['dc:date'], guid: it['@_rdf:about'] });
    }
  } else if (doc.feed) {
    for (const it of asArray(doc.feed.entry)) {
      const links = asArray(it.link) as Record<string, unknown>[];
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
      raw.push({ title: it.title, link: alt?.['@_href'], desc: it.summary ?? it.content, date: it.published ?? it.updated, guid: it.id });
    }
  } else {
    throw new Error('Neznámý formát (není to RSS ani Atom)');
  }

  return raw
    .map((r) => {
      const title = clean(text(r.title), 220);
      const link = text(r.link).trim();
      const key = text(r.guid) || link || title;
      return {
        id: createHash('sha1').update(`${source.id}|${key}`).digest('hex').slice(0, 16),
        title,
        summary: clean(text(r.desc), 280),
        link,
        source: source.name,
        sourceId: source.id,
        scope: source.scope,
        published: isoDate(r.date) ?? seen,
        seen,
      };
    })
    .filter((i) => i.title);
}

async function fetchSource(src: NewsSource): Promise<NewsItem[]> {
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'MesteckoOndik/1.0 (osobni RSS ctecka)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), src);
}

let polling = false;

/** Stáhne všechny zdroje a uloží nové zprávy. Vrací zprávy, které jsou opravdu nové. */
export async function pollNews(): Promise<NewsItem[]> {
  if (polling) return [];
  polling = true;
  try {
    const d = await load();
    const known = new Set(d.items.map((i) => i.id));
    // stejná zpráva často vyjde ve více kanálech (např. iROZHLAS i iROZHLAS Svět) – bereme ji jen jednou
    const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const knownTitles = new Set(d.items.map((i) => titleKey(i.title)));
    const firstRun = d.items.length === 0;
    const fresh: NewsItem[] = [];
    const now = new Date().toISOString();

    const results = await Promise.allSettled(NEWS_SOURCES.map(fetchSource));
    results.forEach((r, i) => {
      const src = NEWS_SOURCES[i];
      const st: SourceStatus = d.sources[src.id] ?? { id: src.id, name: src.name, scope: src.scope, ok: false, lastCheck: null, lastError: null, items: 0 };
      st.name = src.name;
      st.scope = src.scope;
      st.lastCheck = now;
      if (r.status === 'fulfilled') {
        st.ok = true;
        st.lastError = null;
        st.items = r.value.length;
        for (const item of r.value) {
          if (known.has(item.id) || knownTitles.has(titleKey(item.title))) continue;
          known.add(item.id);
          knownTitles.add(titleKey(item.title));
          // Při úplně prvním stažení nebereme staré články jako „právě se stalo“.
          if (firstRun) item.seen = item.published;
          fresh.push(item);
        }
      } else {
        st.ok = false;
        st.lastError = netError(r.reason);
      }
      d.sources[src.id] = st;
    });
    // zdroje, které už v seznamu nejsou, zahodíme
    for (const id of Object.keys(d.sources)) if (!NEWS_SOURCES.some((s) => s.id === id)) delete d.sources[id];

    const cutoff = Date.now() - KEEP_HOURS * 3600_000;
    d.items = [...fresh, ...d.items]
      .filter((i) => Date.parse(i.published) >= cutoff || Date.parse(i.seen) >= cutoff)
      .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
      .slice(0, MAX_ITEMS);
    d.lastPoll = now;
    await writeJson(FILE, d);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length === results.length) {
      const err = Object.assign(new Error(`nefunguje žádný z ${results.length} zdrojů zpráv`), { cause: failed[0].reason });
      serviceFailed('zpravy', 'Zprávy (RSS)', err, () => pollNews());
    } else {
      serviceOk('zpravy', 'Zprávy (RSS)');
      if (failed.length) console.warn(`[echo] nefunguje ${failed.length} z ${results.length} zdrojů: ${NEWS_SOURCES.filter((_, i) => results[i].status === 'rejected').map((s) => s.name).join(', ')}`);
    }
    return firstRun ? [] : fresh;
  } finally {
    polling = false;
  }
}

export async function latestNews(limit = 80) {
  const d = await load();
  return {
    items: d.items.slice(0, limit),
    sources: NEWS_SOURCES.map((s) => d.sources[s.id] ?? { id: s.id, name: s.name, scope: s.scope, ok: false, lastCheck: null, lastError: null, items: 0 }),
    lastPoll: d.lastPoll,
  };
}

/** Zprávy vydané od daného okamžiku (nejnovější první). */
export async function newsSince(since: number, limit = 60): Promise<NewsItem[]> {
  const d = await load();
  return d.items.filter((i) => Date.parse(i.published) >= since).slice(0, limit);
}
