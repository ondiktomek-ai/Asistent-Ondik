/** Klient pro server kanceláře (server/index.ts). */

export interface ServerStatus {
  ready: boolean;
  model: string;
  authRequired: boolean;
  authorized: boolean;
  connectedAgents: string[];
  activeAgents?: string[];
  google?: { configured: boolean; connected: boolean };
}

export type ChatAttachment = { kind: 'lexa-poster'; id: string; title: string } | { kind: 'link'; id: string; title: string; url: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  attachments?: ChatAttachment[];
}

const TOKEN_KEY = 'kancelar-heslo';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // úložiště nemusí být dostupné (anonymní okno)
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: headers(init.headers as Record<string, string>) });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new ApiError(res.status, 'Server kanceláře neodpovídá.');
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Chyba ${res.status}`);
  return body as T;
}

export async function fetchStatus(): Promise<ServerStatus | null> {
  try {
    return await request<ServerStatus>('/api/status');
  } catch {
    return null;
  }
}

export function fetchHistory(agentId: string) {
  return request<{ messages: ChatMessage[]; busy: boolean }>(`/api/chat/${agentId}`);
}

export function clearHistory(agentId: string) {
  return request<{ ok: true }>(`/api/chat/${agentId}`, { method: 'DELETE' });
}

/** Pošle zprávu a průběžně volá onDelta s kousky odpovědi. */
export async function sendMessage(
  agentId: string,
  text: string,
  onDelta: (t: string) => void,
  signal?: AbortSignal,
  onTool?: (label: string) => void,
  onAttachment?: (a: ChatAttachment) => void,
  /** hlasový rozhovor s Jarvisem (krátké odpovědi k přečtení nahlas) */
  voice?: { briefingId?: string },
): Promise<void> {
  const res = await fetch(`/api/chat/${agentId}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(voice ? { text, voice: true, briefingId: voice.briefingId } : { text }),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Chyba ${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || data === undefined) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') onDelta(payload.text);
      else if (event === 'tool') onTool?.(payload.label);
      else if (event === 'attachment') onAttachment?.(payload as ChatAttachment);
      else if (event === 'error') throw new ApiError(500, payload.message);
      else if (event === 'done') return;
    }
  }
}

// ---------------------------------------------------------------- Echo (zprávy, počasí, plakátky)

export type NewsScope = 'svet' | 'cesko' | 'region';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  sourceId: string;
  scope: NewsScope;
  published: string;
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

export interface NewsFeed {
  items: NewsItem[];
  sources: SourceStatus[];
  lastPoll: string | null;
}

export interface Weather {
  place: string;
  updated: string;
  current: { time: string; temp: number; feels: number; code: number; text: string; icon: string; wind: number; precip: number; isDay: boolean };
  hourly: { time: string; temp: number; precipProb: number; precip: number; code: number; icon: string }[];
  daily: { date: string; max: number; min: number; code: number; text: string; icon: string; precip: number; precipProb: number }[];
}

export interface DigestEntry {
  text: string;
  source: string;
  link?: string;
}

export interface Digest {
  id: string;
  createdAt: string;
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

export interface DigestState {
  latest: Digest | null;
  history: { id: string; createdAt: string; headline: string; ai: boolean }[];
  generating: boolean;
  lastError: string | null;
  model: string;
}

export const fetchNews = (limit = 80) => request<NewsFeed>(`/api/news?limit=${limit}`);
export const fetchWeather = () => request<Weather>('/api/weather');
export const fetchDigestState = () => request<DigestState>('/api/digest');
export const fetchDigest = (id: string) => request<Digest>(`/api/digest/${id}`);
export const createDigest = () => request<Digest>('/api/digest', { method: 'POST' });

// ---------------------------------------------------------------- Google Kalendář (Chronos)

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  link?: string;
}

export const fetchGoogleStatus = () => request<GoogleStatus>('/api/google/status');
export const saveGoogleClient = (clientId: string, clientSecret: string) =>
  request<GoogleStatus>('/api/google/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
export const startGoogleAuth = () => request<{ url: string }>('/api/google/start', { method: 'POST' });
export const disconnectGoogle = () => request<GoogleStatus>('/api/google/disconnect', { method: 'POST' });
export const fetchAgenda = (days = 7) => request<{ connected: boolean; email?: string; events: CalEvent[] }>(`/api/calendar/agenda?days=${days}`);

// ---------------------------------------------------------------- Bit (údržba a nápady)

export type CheckState = 'ok' | 'warn' | 'error' | 'info';

export interface BitCheck {
  id: string;
  name: string;
  state: CheckState;
  detail: string;
  hint?: string;
}

export interface BitAlert {
  id: string;
  text: string;
  action?: 'google-login';
}

export interface BitReport {
  checkedAt: string;
  checks: BitCheck[];
  alerts: BitAlert[];
}

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

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const fetchBitStatus = (now = false) => request<BitReport>(`/api/bit/status${now ? '?ted' : ''}`);
export const fetchIdeas = () => request<{ ideas: Idea[] }>('/api/bit/ideas');
export const addIdeaApi = (title: string, detail: string) => request<Idea>('/api/bit/ideas', jsonInit('POST', { title, detail }));
export const updateIdeaApi = (id: string, patch: Partial<Pick<Idea, 'status' | 'priority' | 'title' | 'detail'>>) => request<Idea>(`/api/bit/ideas/${id}`, jsonInit('PATCH', patch));
export const deleteIdeaApi = (id: string) => request<{ ok: true }>(`/api/bit/ideas/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------- Lexa (plakátky z rešerší)

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

export const fetchResearchPosters = () => request<{ posters: { id: string; createdAt: string; title: string; topic: string }[] }>('/api/lexa/posters');
export const fetchResearchPoster = (id: string) => request<ResearchPoster>(`/api/lexa/posters/${id}`);
export const deleteResearchPoster = (id: string) => request<{ ok: true }>(`/api/lexa/posters/${id}`, { method: 'DELETE' });

// --- Tým: útrata, společná paměť, spolupráce ---

export interface SpendSummary {
  today: { usd: number; czk: number; calls: number };
  month: { usd: number; czk: number; calls: number };
  byAgent: { id: string; usd: number; czk: number; calls: number; searches: number }[];
  days: { date: string; czk: number }[];
  rate: number;
}

export type MemoryKind = 'uzivatel' | 'preference' | 'projekt' | 'ukol' | 'jine';

export interface MemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  by: string;
  at: string;
}

export interface TeamTask {
  id: string;
  from: string;
  to: string;
  task: string;
  state: 'bezi' | 'hotovo' | 'chyba';
  result?: string;
  at: string;
  doneAt?: string;
}

export const fetchUsage = () => request<SpendSummary>('/api/usage');
export const fetchTeam = (all = false) => request<{ active: TeamTask[]; log: TeamTask[] }>(`/api/team${all ? '?vse' : ''}`);
export const fetchMemory = () => request<{ items: MemoryItem[] }>('/api/memory');
export const addMemoryApi = (text: string, kind: MemoryKind) => request<MemoryItem>('/api/memory', jsonInit('POST', { text, kind }));
export const deleteMemoryApi = (id: string) => request<{ ok: boolean }>(`/api/memory/${id}`, { method: 'DELETE' });

// --- Jarvis ---

export type SegmentKind = 'uvod' | 'pocasi' | 'svet' | 'cesko' | 'region' | 'program' | 'tym' | 'otazka';

export interface BriefingSegment {
  kind: SegmentKind;
  text: string;
  say: string;
  items: { title: string; source: string; link: string }[];
}

export interface Briefing {
  id: string;
  createdAt: string;
  segments: BriefingSegment[];
  weather: { temp: number; text: string; icon: string; min?: number; max?: number } | null;
  events: { start: string; summary: string; allDay: boolean; location?: string }[];
  calendarConnected: boolean;
}

export const createBriefing = () => request<Briefing>('/api/jarvis/briefing', { method: 'POST' });

// --- Klik: spouštěč ---

import type { Tile } from './world/tiles';
export type { Tile };

export const fetchTiles = () => request<{ tiles: Tile[] }>('/api/klik/tiles');
export const addTileApi = (t: { name: string; url: string; search?: string; icon?: string; color?: string }) => request<Tile>('/api/klik/tiles', jsonInit('POST', t));
export const deleteTileApi = (id: string) => request<{ ok: true }>(`/api/klik/tiles/${id}`, { method: 'DELETE' });
export const resetTilesApi = () => request<{ tiles: Tile[] }>('/api/klik/reset', { method: 'POST' });

/** Městečko je otevřené přímo na počítači, kde běží server (ne z telefonu). */
export const onServerPc = () => ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);

/**
 * Otevře web: na počítači ve výchozím prohlížeči (kde je uživatel přihlášený) přes server,
 * na telefonu rovnou v telefonu. Volat přímo z kliknutí (kvůli blokování vyskakovacích oken).
 */
export function launch(url: string): void {
  if (!onServerPc()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  request<{ ok: true }>('/api/klik/open', jsonInit('POST', { url })).catch(() => window.open(url, '_blank', 'noopener'));
}
