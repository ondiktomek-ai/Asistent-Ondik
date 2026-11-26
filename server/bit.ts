/**
 * Bit – údržbář městečka. Pravidelně kontroluje, že všechno běží (API klíč, zprávy,
 * plakátky, počasí, Google Kalendář, data, server), připomíná přihlášení ke Googlu
 * a vede seznam nápadů na vylepšení městečka.
 */
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyConfigured } from './config.ts';
import { latestNews } from './news.ts';
import { digestState } from './reporter.ts';
import { getWeather } from './weather.ts';
import { googleStatus } from './google.ts';
import { DATA_DIR, readJson, writeJson } from './store.ts';
import { updateStatus, updatesEnabled } from './update.ts';

export type CheckState = 'ok' | 'warn' | 'error' | 'info';

export interface Check {
  id: string;
  name: string;
  state: CheckState;
  detail: string;
  /** Co s tím udělat (krátce). */
  hint?: string;
}

export interface Report {
  checkedAt: string;
  checks: Check[];
  /** Připomínky, které má Bit říkat a ukázat (např. přihlášení ke Googlu). */
  alerts: { id: string; text: string; action?: 'google-login' | 'update' }[];
}

const startedAt = Date.now();
const hours = (ms: number) => ms / 3_600_000;
const ago = (iso: string | null) => {
  if (!iso) return 'nikdy';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 60 ? `před ${min} min` : min < 48 * 60 ? `před ${Math.round(min / 60)} h` : `před ${Math.round(min / 1440)} dny`;
};

// ---------------------------------------------------------------- kontroly

let apiCache: { at: number; check: Check } | null = null;

async function checkApi(): Promise<Check> {
  const base = { id: 'api', name: 'Claude API' };
  if (!apiKeyConfigured()) return { ...base, state: 'error', detail: 'Chybí API klíč.', hint: 'Doplň ANTHROPIC_API_KEY do souboru .env.' };
  // Ověření klíče je zdarma, ale stačí jednou za hodinu.
  if (apiCache && Date.now() - apiCache.at < 3600_000) return apiCache.check;
  let check: Check;
  try {
    await new Anthropic().models.list({ limit: 1 });
    check = { ...base, state: 'ok', detail: 'Klíč funguje.' };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) check = { ...base, state: 'error', detail: 'Klíč je neplatný.', hint: 'Vytvoř nový klíč na console.anthropic.com a vlož ho do .env.' };
    else if (err instanceof Anthropic.APIConnectionError) check = { ...base, state: 'warn', detail: 'Nepodařilo se spojit s Claude API.', hint: 'Je počítač online?' };
    else if (err instanceof Anthropic.APIError) check = { ...base, state: 'warn', detail: `Claude API teď odpovídá chybou (${err.status ?? '?'}).`, hint: 'Většinou to brzy přejde.' };
    else check = { ...base, state: 'warn', detail: err instanceof Error ? err.message : 'Neznámá chyba.' };
  }
  apiCache = { at: Date.now(), check };
  return check;
}

async function checkNews(): Promise<Check> {
  const base = { id: 'zpravy', name: 'Zprávy (Echo)' };
  const { sources, lastPoll } = await latestNews(1);
  const bad = sources.filter((s) => s.lastCheck && !s.ok);
  const ok = sources.filter((s) => s.ok).length;
  if (!lastPoll) return { ...base, state: 'info', detail: 'Zprávy se ještě nestahovaly.' };
  if (Date.now() - Date.parse(lastPoll) > 40 * 60_000) return { ...base, state: 'warn', detail: `Naposledy staženo ${ago(lastPoll)}.`, hint: 'Restartuj městečko.' };
  if (ok === 0) return { ...base, state: 'error', detail: 'Žádný zdroj zpráv nefunguje.', hint: 'Zkontroluj připojení k internetu.' };
  if (bad.length) return { ...base, state: 'warn', detail: `Funguje ${ok} z ${sources.length} zdrojů. Nejde: ${bad.map((b) => b.name).join(', ')}.`, hint: 'Adresu zdroje lze opravit v server/news-sources.ts.' };
  return { ...base, state: 'ok', detail: `Všech ${sources.length} zdrojů funguje, staženo ${ago(lastPoll)}.` };
}

async function checkDigests(): Promise<Check> {
  const base = { id: 'plakatky', name: 'Plakátky (Echo)' };
  const d = await digestState();
  if (d.generating) return { ...base, state: 'info', detail: 'Echo právě píše plakátek.' };
  if (!d.latest) return { ...base, state: 'info', detail: 'Zatím žádný plakátek.' };
  const age = Date.now() - Date.parse(d.latest.createdAt);
  if (d.lastError) return { ...base, state: 'warn', detail: `Poslední pokus selhal: ${d.lastError}` };
  if (!d.latest.ai && apiKeyConfigured()) return { ...base, state: 'warn', detail: `Poslední plakátek je jen z titulků (${d.latest.note ?? 'bez AI'}).` };
  if (hours(age) > 1.4) return { ...base, state: 'warn', detail: `Poslední plakátek ${ago(d.latest.createdAt)}.`, hint: 'Plakátky vycházejí, jen když městečko běží.' };
  return { ...base, state: 'ok', detail: `Poslední plakátek ${ago(d.latest.createdAt)}.` };
}

async function checkWeather(): Promise<Check> {
  const base = { id: 'pocasi', name: 'Počasí' };
  try {
    const w = await getWeather();
    return { ...base, state: 'ok', detail: `${w.place}: ${Math.round(w.current.temp)} °C, ${w.current.text.toLowerCase()}.` };
  } catch (err) {
    return { ...base, state: 'warn', detail: `Počasí se nepodařilo načíst (${err instanceof Error ? err.message : 'chyba'}).` };
  }
}

async function checkGoogle(): Promise<{ check: Check; alert?: Report['alerts'][number] }> {
  const base = { id: 'google', name: 'Google Kalendář (Chronos)' };
  const g = await googleStatus();
  if (!g.configured) return { check: { ...base, state: 'info', detail: 'Zatím nenastaveno.', hint: 'Průvodce je u Chronose v záložce Kalendář.' } };
  if (!g.connected)
    return {
      check: { ...base, state: 'warn', detail: 'Odhlášeno – Chronos teď kalendář nevidí.', hint: 'Přihlas se u Chronose v záložce Kalendář.' },
      alert: { id: 'google-odhlaseno', text: 'Kalendář je odhlášený – přihlas se prosím znovu ke Googlu. 🔑', action: 'google-login' },
    };
  if (g.loginExpires) {
    const left = g.loginExpires - Date.now();
    const h = Math.max(0, Math.round(hours(left)));
    if (left < 24 * 3600_000) {
      return {
        check: { ...base, state: 'warn', detail: `Přihlášení vyprší ${h <= 1 ? 'během hodiny' : `za ${h} h`}.`, hint: 'Přihlas se znovu – stačí jedno kliknutí.' },
        alert: { id: 'google-vyprsi', text: `Přihlášení ke Googlu vyprší ${h <= 1 ? 'brzy' : `za ${h} h`} – přihlas se prosím znovu. 🔑`, action: 'google-login' },
      };
    }
    return { check: { ...base, state: 'ok', detail: `Propojeno${g.email ? ` (${g.email})` : ''}, přihlášení platí ještě ${Math.floor(left / 86_400_000)} dní.` } };
  }
  return { check: { ...base, state: 'ok', detail: `Propojeno${g.email ? ` (${g.email})` : ''}.` } };
}

async function checkData(): Promise<Check> {
  let size = 0;
  let files = 0;
  try {
    for (const f of await readdir(DATA_DIR)) {
      const s = await stat(path.join(DATA_DIR, f));
      if (s.isFile()) {
        size += s.size;
        files++;
      }
    }
  } catch {
    // složka ještě neexistuje
  }
  const mb = size / 1024 / 1024;
  return {
    id: 'data',
    name: 'Data městečka',
    state: mb > 200 ? 'warn' : 'info',
    detail: `${files} souborů, ${mb < 1 ? `${Math.round(size / 1024)} kB` : `${mb.toFixed(1)} MB`}.`,
    hint: mb > 200 ? 'Historie chatů je velká – můžeš začít novou konverzaci.' : undefined,
  };
}

function checkServer(): Check {
  const up = Date.now() - startedAt;
  const upText = up < 3600_000 ? `${Math.round(up / 60_000)} min` : up < 48 * 3600_000 ? `${Math.round(hours(up))} h` : `${Math.round(up / 86_400_000)} dní`;
  return { id: 'server', name: 'Server', state: 'info', detail: `Běží ${upText}, Node.js ${process.version}.` };
}

async function checkVersion(): Promise<{ check: Check; alert?: Report['alerts'][number] }> {
  if (!updatesEnabled()) return { check: { id: 'verze', name: 'Verze', state: 'info', detail: 'Automatické aktualizace jsou vypnuté (AKTUALIZACE=ne).' } };
  const u = await updateStatus();
  if (!u.local) return { check: { id: 'verze', name: 'Verze', state: 'info', detail: 'Verze se zjistí při příštím spuštění ikonou na ploše (pak se aktualizuje sama).' } };
  if (!u.latest) return { check: { id: 'verze', name: 'Verze', state: 'info', detail: `Verze ${u.local.slice(0, 7)} – GitHub se teď nepodařilo zkontrolovat.` } };
  if (!u.available) return { check: { id: 'verze', name: 'Verze', state: 'ok', detail: `Nejnovější verze (${u.local.slice(0, 7)}).` } };
  return {
    check: { id: 'verze', name: 'Verze', state: 'warn', detail: `Je nová verze městečka (${u.latest.slice(0, 7)}).`, hint: 'Klikni na Aktualizovat, nebo městečko zavři a otevři ikonou.' },
    alert: { id: `verze-${u.latest.slice(0, 7)}`, text: 'Je nová verze městečka – nainstaluju ji? 🚀', action: u.canUpdateNow ? 'update' : undefined },
  };
}

let last: Report | null = null;
let running: Promise<Report> | null = null;

export async function runChecks(): Promise<Report> {
  running ??= (async () => {
    const [api, news, digests, weather, google, data, version] = await Promise.all([checkApi(), checkNews(), checkDigests(), checkWeather(), checkGoogle(), checkData(), checkVersion()]);
    last = {
      checkedAt: new Date().toISOString(),
      checks: [api, google.check, news, digests, weather, data, version.check, checkServer()],
      alerts: [google.alert, version.alert].filter((a): a is NonNullable<typeof a> => !!a),
    };
    return last;
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function getReport(refresh = false): Promise<Report> {
  if (!refresh && last && Date.now() - Date.parse(last.checkedAt) < 5 * 60_000) return last;
  return runChecks();
}

export function startMaintenance() {
  setTimeout(() => void runChecks().catch(() => {}), 20_000);
  setInterval(() => void runChecks().catch(() => {}), 15 * 60_000);
}

// ---------------------------------------------------------------- nápady na vylepšení

export type IdeaStatus = 'novy' | 'planovany' | 'hotovo' | 'zamitnuty';
export type IdeaPriority = 'vysoka' | 'stredni' | 'nizka';

export interface Idea {
  id: string;
  title: string;
  detail: string;
  from: 'ty' | 'bit';
  status: IdeaStatus;
  priority: IdeaPriority;
  createdAt: string;
  updatedAt: string;
}

const IDEAS = 'napady.json';
const STATUSES: IdeaStatus[] = ['novy', 'planovany', 'hotovo', 'zamitnuty'];
const PRIORITIES: IdeaPriority[] = ['vysoka', 'stredni', 'nizka'];

export async function listIdeas(): Promise<Idea[]> {
  const list = await readJson<Idea[]>(IDEAS, []);
  const order = (i: Idea) => STATUSES.indexOf(i.status) * 10 + PRIORITIES.indexOf(i.priority);
  return list.sort((a, b) => order(a) - order(b) || b.createdAt.localeCompare(a.createdAt));
}

export async function addIdea(input: { title: string; detail?: string; from?: 'ty' | 'bit'; priority?: string }): Promise<Idea> {
  const title = String(input.title ?? '').trim().slice(0, 140);
  if (!title) throw new Error('Nápad potřebuje název.');
  const now = new Date().toISOString();
  const idea: Idea = {
    id: randomUUID().slice(0, 8),
    title,
    detail: String(input.detail ?? '').trim().slice(0, 1500),
    from: input.from === 'bit' ? 'bit' : 'ty',
    status: 'novy',
    priority: PRIORITIES.includes(input.priority as IdeaPriority) ? (input.priority as IdeaPriority) : 'stredni',
    createdAt: now,
    updatedAt: now,
  };
  const list = await readJson<Idea[]>(IDEAS, []);
  list.push(idea);
  await writeJson(IDEAS, list);
  return idea;
}

export async function updateIdea(id: string, patch: { title?: string; detail?: string; status?: string; priority?: string }): Promise<Idea> {
  const list = await readJson<Idea[]>(IDEAS, []);
  const idea = list.find((i) => i.id === id);
  if (!idea) throw new Error(`Nápad ${id} neexistuje.`);
  if (patch.title !== undefined) idea.title = String(patch.title).trim().slice(0, 140) || idea.title;
  if (patch.detail !== undefined) idea.detail = String(patch.detail).trim().slice(0, 1500);
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status as IdeaStatus)) throw new Error(`Neznámý stav „${patch.status}“ (možné: ${STATUSES.join(', ')}).`);
    idea.status = patch.status as IdeaStatus;
  }
  if (patch.priority !== undefined) {
    if (!PRIORITIES.includes(patch.priority as IdeaPriority)) throw new Error(`Neznámá priorita „${patch.priority}“ (možné: ${PRIORITIES.join(', ')}).`);
    idea.priority = patch.priority as IdeaPriority;
  }
  idea.updatedAt = new Date().toISOString();
  await writeJson(IDEAS, list);
  return idea;
}

export async function deleteIdea(id: string): Promise<void> {
  const list = await readJson<Idea[]>(IDEAS, []);
  await writeJson(
    IDEAS,
    list.filter((i) => i.id !== id),
  );
}
