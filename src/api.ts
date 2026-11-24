/** Klient pro server kanceláře (server/index.ts). */

export interface ServerStatus {
  ready: boolean;
  model: string;
  authRequired: boolean;
  authorized: boolean;
  connectedAgents: string[];
  activeAgents?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
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
export async function sendMessage(agentId: string, text: string, onDelta: (t: string) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api/chat/${agentId}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text }),
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
