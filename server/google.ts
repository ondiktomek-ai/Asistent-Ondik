/**
 * Přihlášení přes Google (OAuth 2.0, typ klienta „Desktop app“) a volání Google API.
 * Vše běží jen u tebe na počítači: přihlašovací údaje aplikace i tokeny jsou v data/.
 * Bez dalších knihoven – jen fetch na oficiální adresy Googlu.
 */
import { randomBytes } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson } from './store.ts';

const CLIENT_FILE = 'google-client.json';
const TOKEN_FILE = 'google-token.json';

/** Čtení i zápis událostí + čtení kalendáře (kvůli volným termínům). */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'];

interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

interface GoogleToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string | null;
  scope: string;
}

async function loadClient(): Promise<GoogleClient | null> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  const c = await readJson<GoogleClient | null>(CLIENT_FILE, null);
  return c?.clientId && c?.clientSecret ? c : null;
}

let token: GoogleToken | null | undefined;
async function loadToken(): Promise<GoogleToken | null> {
  if (token === undefined) token = await readJson<GoogleToken | null>(TOKEN_FILE, null);
  return token;
}

async function saveSecret(name: string, value: unknown) {
  await writeJson(name, value);
  try {
    await chmod(path.join(DATA_DIR, name), 0o600);
  } catch {
    // na Windows práva nejdou nastavit stejně – soubor je stejně jen ve tvém profilu
  }
}

export async function saveClient(clientId: string, clientSecret: string) {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) throw new Error('Client ID má končit na „.apps.googleusercontent.com“.');
  if (secret.length < 10) throw new Error('Client secret vypadá moc krátce – zkopíruj ho celý.');
  await saveSecret(CLIENT_FILE, { clientId: id, clientSecret: secret });
}

export async function googleStatus() {
  const [client, tok] = await Promise.all([loadClient(), loadToken()]);
  return { configured: !!client, connected: !!tok?.refresh_token, email: tok?.email ?? null };
}

// ---------------------------------------------------------------- OAuth

const pendingStates = new Map<string, number>();

export async function authUrl(redirectUri: string): Promise<string> {
  const client = await loadClient();
  if (!client) throw new Error('Nejdřív vlož Client ID a Client secret.');
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60_000);
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json()) as Record<string, any>;
  if (!res.ok) throw new Error(`Google: ${j.error_description || j.error || res.status}`);
  return j;
}

export async function finishAuth(code: string, state: string, redirectUri: string) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (!exp || exp < Date.now()) throw new Error('Přihlášení vypršelo nebo nepochází z městečka. Zkus to znovu.');
  const client = await loadClient();
  if (!client) throw new Error('Chybí Client ID a secret.');
  const j = await tokenRequest({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!j.refresh_token) throw new Error('Google nevrátil trvalé přihlášení. Odeber městečku přístup v účtu Google a zkus to znovu.');
  token = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, email: null, scope: j.scope ?? '' };
  await saveSecret(TOKEN_FILE, token);
  // e-mail účtu = ID hlavního kalendáře
  try {
    const cal = (await googleApi('/calendar/v3/calendars/primary')) as { id?: string };
    token.email = cal.id ?? null;
    await saveSecret(TOKEN_FILE, token);
  } catch {
    // nevadí, e-mail je jen pro zobrazení
  }
}

async function accessToken(force = false): Promise<string> {
  const tok = await loadToken();
  if (!tok) throw new NotConnectedError();
  if (!force && tok.expires_at - Date.now() > 60_000) return tok.access_token;
  const client = await loadClient();
  if (!client) throw new NotConnectedError();
  try {
    const j = await tokenRequest({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    });
    tok.access_token = j.access_token;
    tok.expires_at = Date.now() + (j.expires_in ?? 3600) * 1000;
    if (j.refresh_token) tok.refresh_token = j.refresh_token;
    await saveSecret(TOKEN_FILE, tok);
    return tok.access_token;
  } catch (err) {
    if (err instanceof Error && /invalid_grant|expired|revoked/i.test(err.message)) {
      throw new Error('Přihlášení ke Googlu vypršelo. V panelu Chronose se prosím přihlas znovu.');
    }
    throw err;
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super('Google Kalendář zatím není propojený.');
  }
}

/** Volání Google API (cesta za https://www.googleapis.com). Při vypršení tokenu ho jednou obnoví. */
export async function googleApi(pathAndQuery: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  const call = async (tok: string) =>
    fetch(`https://www.googleapis.com${pathAndQuery}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${tok}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  let res = await call(await accessToken());
  if (res.status === 401) res = await call(await accessToken(true));
  if (res.status === 204) return null;
  const j = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new Error(`Google Kalendář: ${j.error?.message ?? `HTTP ${res.status}`}`);
  return j;
}

export async function disconnect() {
  const tok = await loadToken();
  if (tok?.refresh_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok.refresh_token)}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    } catch {
      // i bez odvolání token smažeme
    }
  }
  token = null;
  await writeJson(TOKEN_FILE, null);
}
