/**
 * Síť a odolnost proti výpadkům:
 * - netError(): srozumitelná příčina chyby (DNS, timeout, certifikát…), ne jen „fetch failed“,
 * - checkInternet(): je počítač vůbec online? (rozliší výpadek internetu od výpadku jedné služby),
 * - recovery: po chybě zkusí službu znovu za 1, 5 a 15 minut,
 * - log do souboru data/log.txt (okno serveru po zavření zmizí, soubor zůstane).
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { DATA_DIR } from './store.ts';

// ---------------------------------------------------------------- log do souboru

const LOG_FILE = path.join(DATA_DIR, 'log.txt');
const LOG_MAX = 1024 * 1024; // 1 MB, pak se starý log přejmenuje na log.old.txt

function writeLog(level: string, parts: unknown[]) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    try {
      if (statSync(LOG_FILE).size > LOG_MAX) renameSync(LOG_FILE, path.join(DATA_DIR, 'log.old.txt'));
    } catch {
      // log ještě neexistuje
    }
    const text = parts.map((p) => (p instanceof Error ? `${p.message}${netCause(p) ? ` [${netCause(p)!.code}]` : ''}` : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    const ts = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Prague' });
    appendFileSync(LOG_FILE, `${ts} ${level} ${text}\n`, 'utf8');
  } catch {
    // logování nikdy nesmí shodit server
  }
}

/** Varování a chyby z konzole se zapisují i do data/log.txt. */
export function installFileLog() {
  const warn = console.warn.bind(console);
  const error = console.error.bind(console);
  const log = console.log.bind(console);
  console.warn = (...a: unknown[]) => {
    warn(...a);
    writeLog('VAROVÁNÍ', a);
  };
  console.error = (...a: unknown[]) => {
    error(...a);
    writeLog('CHYBA', a);
  };
  console.log = (...a: unknown[]) => {
    log(...a);
    writeLog('info', a);
  };
}

// ---------------------------------------------------------------- příčina chyby

const CAUSES: [RegExp, string][] = [
  [/^(ENOTFOUND|EAI_AGAIN|EAI_FAIL)$/, 'nepodařilo se přeložit adresu (DNS) – počítač je bez internetu, nebo nefunguje DNS'],
  [/^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|TimeoutError|AbortError)$/, 'vypršel čas na odpověď – pomalé nebo přerušené připojení'],
  [/^ECONNREFUSED$/, 'spojení odmítnuto – firewall, proxy nebo antivir'],
  [/^(ECONNRESET|UND_ERR_SOCKET|EPIPE|UND_ERR_CLOSED)$/, 'spojení se přerušilo'],
  [/^(ENETUNREACH|EHOSTUNREACH|ENETDOWN)$/, 'síť je nedostupná – počítač není připojený'],
  [/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/, 'problém s certifikátem – zkontroluj datum a čas v počítači, nebo antivir, který kontroluje HTTPS'],
];

/** Kód síťové chyby z celého řetězce příčin (fetch → undici → systém). */
export function netCause(err: unknown): { code: string; text: string } | null {
  let e: unknown = err;
  for (let i = 0; i < 6 && e; i++) {
    const o = e as { code?: unknown; name?: unknown; cause?: unknown };
    const code = typeof o.code === 'string' ? o.code : o.name === 'TimeoutError' || o.name === 'AbortError' ? String(o.name) : '';
    if (code) {
      const hit = CAUSES.find(([re]) => re.test(code));
      if (hit) return { code, text: hit[1] };
    }
    e = o.cause;
  }
  return null;
}

/** Text chyby pro lidi: zpráva + srozumitelná příčina, když ji známe. */
export function netError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const c = netCause(err);
  return c ? `${msg} – ${c.text} (${c.code})` : msg;
}

// ---------------------------------------------------------------- je počítač online?

export type InternetState = 'online' | 'dns' | 'offline' | 'unknown';
let internet: { state: InternetState; detail: string; at: number } = { state: 'unknown', detail: 'Zatím neověřeno.', at: 0 };

const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), ms))]);

/**
 * Zkusí DNS a HTTPS na dvě nezávislé adresy. Výsledek se pamatuje 60 s.
 * online = funguje HTTPS; dns = nefunguje ani překlad adres; offline = DNS jde, ale HTTPS ne (firewall/proxy/antivir).
 */
export async function checkInternet(force = false) {
  if (!force && Date.now() - internet.at < 60_000) return internet;
  const hosts = ['www.google.com', 'cloudflare.com'];
  const dns = await Promise.allSettled(hosts.map((h) => withTimeout(lookup(h), 5000)));
  const https = await Promise.allSettled([
    fetch('https://www.google.com/generate_204', { method: 'HEAD', signal: AbortSignal.timeout(6000) }),
    fetch('https://cloudflare.com/cdn-cgi/trace', { method: 'HEAD', signal: AbortSignal.timeout(6000) }),
  ]);
  const okHttps = https.some((r) => r.status === 'fulfilled');
  const okDns = dns.some((r) => r.status === 'fulfilled');
  const firstErr = [...https, ...dns].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  internet = okHttps
    ? { state: 'online', detail: 'Připojení k internetu funguje.', at: Date.now() }
    : !okDns
      ? { state: 'dns', detail: `Počítač nepřeloží žádnou adresu (DNS) – je bez internetu, nebo nefunguje DNS${firstErr ? ` (${netCause(firstErr.reason)?.code ?? 'chyba'})` : ''}.`, at: Date.now() }
      : { state: 'offline', detail: `DNS funguje, ale spojení HTTPS ne – nejspíš firewall, proxy nebo antivir blokuje Node.js${firstErr ? ` (${netCause(firstErr.reason)?.code ?? 'chyba'})` : ''}.`, at: Date.now() };
  return internet;
}

export const internetState = () => internet;

// ---------------------------------------------------------------- opakování po výpadku

/** Za kolik minut zkusit službu znovu po 1., 2., 3. a další chybě. */
const RETRY_MIN = [1, 5, 15];

export interface ServiceHealth {
  id: string;
  name: string;
  ok: boolean;
  failures: number;
  /** od kdy služba nefunguje */
  since: string | null;
  lastError: string | null;
  lastOk: string | null;
  nextRetry: string | null;
}

interface Entry extends ServiceHealth {
  retry: (() => Promise<unknown>) | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const services = new Map<string, Entry>();
let lastNetLog = '';

function entry(id: string, name: string): Entry {
  let e = services.get(id);
  if (!e) {
    e = { id, name, ok: true, failures: 0, since: null, lastError: null, lastOk: null, nextRetry: null, retry: null, timer: null };
    services.set(id, e);
  }
  return e;
}

/** Služba funguje – zruší plánované opakování. */
export function serviceOk(id: string, name: string) {
  const e = entry(id, name);
  if (!e.ok) console.log(`[obnova] ${name} zase funguje (po ${e.failures} chybách).`);
  e.ok = true;
  e.failures = 0;
  e.since = null;
  e.lastError = null;
  e.lastOk = new Date().toISOString();
  e.nextRetry = null;
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
}

/**
 * Služba selhala – zapíše příčinu a naplánuje opakování za 1, 5 a 15 minut (dál každých 15 minut).
 * `retry` má při úspěchu zavolat serviceOk a při chybě znovu serviceFailed (dělají to obalené úlohy samy).
 */
export function serviceFailed(id: string, name: string, err: unknown, retry?: () => Promise<unknown>) {
  const e = entry(id, name);
  const text = netError(err);
  e.lastError = text;
  // opakování už je naplánované → jen zapsat chybu (jinak by každé obnovení stránky zkracovalo rozvrh)
  if (e.timer && !e.ok) return;
  e.ok = false;
  e.failures += 1;
  e.since ??= new Date().toISOString();
  e.lastError = text;
  if (retry) e.retry = retry;
  if (e.timer) clearTimeout(e.timer);
  const minutes = RETRY_MIN[Math.min(e.failures - 1, RETRY_MIN.length - 1)];
  e.nextRetry = new Date(Date.now() + minutes * 60_000).toISOString();
  console.warn(`[obnova] ${name}: ${text} – zkusím znovu za ${minutes} min (pokus ${e.failures}).`);
  if (e.retry) {
    const run = e.retry;
    e.timer = setTimeout(() => {
      e.timer = null;
      void run().catch(() => {});
    }, minutes * 60_000);
    e.timer.unref?.();
  }
  // zjistíme, jestli nejde o výpadek internetu (do logu jen při změně stavu)
  void checkInternet().then((n) => {
    if (n.state !== 'online' && n.detail !== lastNetLog) console.warn(`[síť] ${n.detail}`);
    lastNetLog = n.state === 'online' ? '' : n.detail;
  });
}

export function servicesHealth(): ServiceHealth[] {
  return [...services.values()].map(({ retry: _r, timer: _t, ...h }) => h);
}

/** Obalí úlohu: úspěch = serviceOk, chyba = serviceFailed s opakováním té samé úlohy. */
export function guarded<T>(id: string, name: string, task: () => Promise<T>): () => Promise<T> {
  const run = async (): Promise<T> => {
    try {
      const r = await task();
      serviceOk(id, name);
      return r;
    } catch (err) {
      serviceFailed(id, name, err, run);
      throw err;
    }
  };
  return run;
}
