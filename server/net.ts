/**
 * Síť a odolnost proti výpadkům:
 * - netError(): srozumitelná příčina chyby (DNS, timeout, certifikát…), ne jen „fetch failed“,
 * - checkInternet(): je počítač vůbec online? (rozliší výpadek internetu od výpadku jedné služby),
 * - recovery: po chybě zkusí službu znovu za 1, 5 a 15 minut; když nejde ani pak a internet funguje,
 *   restartuje službu (nové spojení / klient) a když ani to nepomůže, celý server,
 * - po probuzení počítače ze spánku zkusí nefunkční služby hned znovu,
 * - log do souboru data/log.txt (okno serveru po zavření zmizí, soubor zůstane).
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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
  /** chyby, kdy internet fungoval (výpadky internetu se nepočítají) */
  onlineFailures: number;
  /** služba už byla „restartována“ (nové spojení / nový klient) */
  wasReset: boolean;
}

const services = new Map<string, Entry>();
let lastNetLog = '';

function entry(id: string, name: string): Entry {
  let e = services.get(id);
  if (!e) {
    e = { id, name, ok: true, failures: 0, since: null, lastError: null, lastOk: null, nextRetry: null, retry: null, timer: null, onlineFailures: 0, wasReset: false };
    services.set(id, e);
  }
  return e;
}

/** Naplánuje další pokus za `ms` (zruší dosavadní plán). */
function schedule(e: Entry, ms: number) {
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
  e.nextRetry = new Date(Date.now() + ms).toISOString();
  if (!e.retry) return;
  const run = e.retry;
  e.timer = setTimeout(() => {
    e.timer = null;
    void run().catch(() => {});
  }, ms);
  e.timer.unref?.();
}

/** Služba funguje – zruší plánované opakování. */
export function serviceOk(id: string, name: string) {
  const e = entry(id, name);
  if (!e.ok) console.log(`[obnova] ${name} zase funguje (po ${e.failures} chybách).`);
  e.ok = true;
  e.failures = 0;
  e.onlineFailures = 0;
  e.wasReset = false;
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
  const minutes = RETRY_MIN[Math.min(e.failures - 1, RETRY_MIN.length - 1)];
  schedule(e, minutes * 60_000);
  console.warn(`[obnova] ${name}: ${text} – zkusím znovu za ${minutes} min (pokus ${e.failures}).`);
  void escalate(e, err);
}

export function servicesHealth(): ServiceHealth[] {
  return [...services.values()].map(({ retry: _r, timer: _t, onlineFailures: _o, wasReset: _w, ...h }) => h);
}

// ---------------------------------------------------------------- restart služby / serveru

/**
 * Bod 2 obnovy: když služba nejde ani po 3. opakování (1, 5, 15 min) a internet přitom funguje,
 * „restartujeme“ ji (nové spojení, nový klient). Když nepomůže ani to, restartuje se celý server
 * (spouštěč ho hned znovu spustí, okno městečka se samo připojí). Bez internetu se nerestartuje nic.
 */
const ONLINE_FAILURES_BEFORE_RESET = 4; // první chyba + 3 neúspěšná opakování
const MIN_OUTAGE_MS = 20 * 60_000; // a služba nejde aspoň 20 minut (chyby z rychlého klikání se nepočítají)
const RETRY_AFTER_RESET_MS = 60_000;
/** Exit kód, podle kterého spouštěč pozná „restartuj mě“ (scripts/server-smycka.cmd, spustit.sh). */
export const RESTART_EXIT_CODE = 75;

const resets = new Map<string, () => void | Promise<void>>();

/** Jak „restartovat“ danou službu (např. Claude API → nový klient). Nové spojení dostanou všechny služby. */
export function onServiceReset(id: string, fn: () => void | Promise<void>) {
  resets.set(id, fn);
}

/** Síťová chyba (má smysl zkoušet nové spojení), ne chyba služby jako 401/429/500. */
function isConnectionError(err: unknown): boolean {
  if (netCause(err)) return true;
  const o = err as { name?: unknown; message?: unknown; status?: unknown };
  if (typeof o?.status === 'number') return false;
  const msg = typeof o?.message === 'string' ? o.message : '';
  return o?.name === 'APIConnectionError' || o?.name === 'APIConnectionTimeoutError' || /fetch failed|Connection error|socket hang up|network/i.test(msg);
}

/** Zahodí všechna otevřená spojení fetch (po spánku počítače bývají „mrtvá“) a začne s čistými. */
export async function resetConnections() {
  const sym = Symbol.for('undici.globalDispatcher.1');
  const g = globalThis as unknown as Record<symbol, { constructor: new () => unknown; close?: () => Promise<void>; destroy?: () => Promise<void> } | undefined>;
  const old = g[sym];
  if (!old) return;
  try {
    g[sym] = new old.constructor() as never;
    // probíhající dotazy (např. dlouhá odpověď Jarvise) doběhnou, nové jdou už přes čistá spojení
    void old.close?.().catch(() => {});
  } catch (err) {
    console.warn('[obnova] nepodařilo se obnovit spojení:', err instanceof Error ? err.message : err);
  }
}

async function escalate(e: Entry, err: unknown) {
  // zjistíme, jestli nejde o výpadek internetu (do logu jen při změně stavu)
  const n = await checkInternet(true).catch(() => internet);
  if (n.state !== 'online' && n.detail !== lastNetLog) console.warn(`[síť] ${n.detail}`);
  lastNetLog = n.state === 'online' ? '' : n.detail;

  if (n.state !== 'online') {
    // počítač je bez internetu → nic nerestartujeme, jen čekáme a zkoušíme
    e.onlineFailures = 0;
    return;
  }
  if (!isConnectionError(err)) return; // chyba služby samotné (klíč, kredit, 500) – restart nepomůže
  e.onlineFailures += 1;
  const outage = e.since ? Date.now() - Date.parse(e.since) : 0;
  if (e.onlineFailures < ONLINE_FAILURES_BEFORE_RESET || outage < MIN_OUTAGE_MS) return;

  if (!e.wasReset) {
    e.wasReset = true;
    console.warn(`[obnova] ${e.name} nejde ani po ${e.onlineFailures - 1} opakováních, internet přitom funguje → restartuji službu (nové spojení).`);
    await resetConnections();
    try {
      await resets.get(e.id)?.();
    } catch (resetErr) {
      console.warn(`[obnova] restart služby ${e.name} selhal:`, resetErr instanceof Error ? resetErr.message : resetErr);
    }
    schedule(e, RETRY_AFTER_RESET_MS);
    return;
  }
  requestServerRestart(`${e.name} nejde ani po restartu služby (${netError(err)})`);
}

// ---------------------------------------------------------------- restart serveru

const RESTART_FILE = path.join(DATA_DIR, 'restarty.json');
const STARTED_AT = Date.now();
const MIN_UPTIME_MS = 10 * 60_000;
const RESTART_GAP_MS = 60 * 60_000; // nejvýš jednou za hodinu
const RESTARTS_PER_DAY = 3;

let shutdownHook: (() => Promise<void>) | null = null;
let restarting = false;

/** Co udělat před restartem (zavřít HTTP server…). */
export function onBeforeRestart(fn: () => Promise<void>) {
  shutdownHook = fn;
}

/** Běží server pod spouštěčem, který ho po restartu znovu spustí? */
export const restartSupported = () => process.env.MESTECKO_SMYCKA === '1';

function recentRestarts(): number[] {
  try {
    const list = JSON.parse(readFileSync(RESTART_FILE, 'utf8')) as unknown;
    return Array.isArray(list) ? list.filter((t): t is number => typeof t === 'number' && Date.now() - t < 24 * 3600_000) : [];
  } catch {
    return [];
  }
}

export function requestServerRestart(reason: string) {
  if (restarting) return;
  if (!restartSupported()) {
    console.warn(`[obnova] ${reason} – server by se měl restartovat, ale neběží přes spouštěč (ikonu), tak jen dál zkouším.`);
    return;
  }
  if (Date.now() - STARTED_AT < MIN_UPTIME_MS) {
    console.warn(`[obnova] ${reason} – server běží teprve chvíli, restart odkládám a dál zkouším.`);
    return;
  }
  const recent = recentRestarts();
  if (recent.length >= RESTARTS_PER_DAY || recent.some((t) => Date.now() - t < RESTART_GAP_MS)) {
    console.warn(`[obnova] ${reason} – server už se nedávno restartoval (${recent.length}× za 24 h), další restart nedělám a dál zkouším.`);
    return;
  }
  restarting = true;
  try {
    writeFileSync(RESTART_FILE, JSON.stringify([...recent, Date.now()]), 'utf8');
  } catch {
    // bez záznamu to nevadí – omezení restartů je jen pojistka
  }
  console.warn(`[obnova] ${reason} → restartuji celý server.`);
  const exit = () => process.exit(RESTART_EXIT_CODE);
  setTimeout(exit, 5000).unref(); // kdyby se zavírání zaseklo
  void (shutdownHook?.() ?? Promise.resolve()).catch(() => {}).finally(exit);
}

// ---------------------------------------------------------------- probuzení ze spánku

/**
 * Když se počítač probudí ze spánku, Wi-Fi naskočí za pár sekund – nečekáme na naplánovaný pokus
 * (až 15 min), ale nefunkční služby zkusíme hned s čistými spojeními.
 */
export function watchSleep() {
  let last = Date.now();
  const t = setInterval(() => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (gap < 2 * 60_000) return;
    console.log(`[obnova] počítač se probudil (spal ${Math.round(gap / 60_000)} min) – obnovuji spojení.`);
    void resetConnections();
    for (const e of services.values()) if (!e.ok && e.retry) schedule(e, 20_000);
  }, 30_000);
  t.unref();
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
