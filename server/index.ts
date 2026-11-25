import './env.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import Anthropic from '@anthropic-ai/sdk';
import { CHAT_AGENTS, MODEL, apiKeyConfigured, chatWithAgent, clearHistory, getHistory, isBusy } from './ondik.ts';
import { digestState, generateDigest, getDigest, latestNews, startReporter } from './reporter.ts';
import { getWeather } from './weather.ts';
import { authUrl, disconnect as googleDisconnect, finishAuth, googleStatus, saveClient } from './google.ts';
import { agenda } from './calendar.ts';
import { deletePoster, getPoster, listPosters } from './lexa.ts';
import { addIdea, deleteIdea, getReport, listIdeas, startMaintenance, updateIdea } from './bit.ts';

const PORT = Number(process.env.PORT ?? 8787);
const PASSWORD = process.env.OFFICE_PASSWORD ?? '';
// Bez hesla poslouchá server jen na tomto počítači; s heslem i v síti (např. přes Tailscale).
const HOST = process.env.HOST ?? (PASSWORD ? '0.0.0.0' : '127.0.0.1');
const DIST = path.resolve('dist');
const CONNECTED_AGENTS = new Set(Object.keys(CHAT_AGENTS));
/** Kam Google po přihlášení vrací prohlížeč (klient typu „Desktop app“ povoluje loopback adresu). */
const GOOGLE_REDIRECT = `http://127.0.0.1:${PORT}/api/google/callback`;
/** Agenti, kteří pracují sami (bez chatu). */
const ACTIVE_AGENTS = ['echo', 'bit', 'lexa'];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage): boolean {
  if (!PASSWORD) return true;
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(PASSWORD);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Zpráva je příliš dlouhá.');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Neplatný API klíč – zkontroluj ANTHROPIC_API_KEY v souboru .env.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'API klíč nemá k tomuto modelu přístup.';
  if (err instanceof Anthropic.RateLimitError) return 'Příliš mnoho požadavků najednou, zkus to za chvilku.';
  if (err instanceof Anthropic.BadRequestError) {
    return /credit balance/i.test(err.message) ? 'Na účtu Anthropic došel kredit.' : `Chybný požadavek: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) return 'Nepodařilo se spojit s Claude API. Je počítač online?';
  if (err instanceof Anthropic.APIError) return `Chyba Claude API (${err.status}).`;
  return err instanceof Error ? err.message : 'Neznámá chyba.';
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/api/status') {
    return json(res, 200, {
      ready: apiKeyConfigured(),
      model: MODEL,
      authRequired: Boolean(PASSWORD),
      authorized: authorized(req),
      connectedAgents: [...CONNECTED_AGENTS],
      google: await googleStatus().then((g) => ({ configured: g.configured, connected: g.connected })),
      activeAgents: ACTIVE_AGENTS,
    });
  }
  // Návrat z přihlášení Googlu – prohlížeč sem přijde přesměrováním (bez hesla městečka),
  // proto ho chrání jednorázový náhodný „state“ vygenerovaný serverem.
  if (url.pathname === '/api/google/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') ?? '';
    let target = '/?kalendar=ok';
    try {
      if (!code) throw new Error(url.searchParams.get('error') === 'access_denied' ? 'Přístup ke kalendáři jsi nepovolil.' : 'Google nevrátil přihlašovací kód.');
      await finishAuth(code, state, GOOGLE_REDIRECT);
    } catch (err) {
      target = `/?kalendar=chyba&zprava=${encodeURIComponent(errorMessage(err))}`;
    }
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (!authorized(req)) return json(res, 401, { error: 'Špatné heslo.' });

  // --- Google Kalendář (Chronos) ---
  if (url.pathname === '/api/google/status') return json(res, 200, await googleStatus());
  if (url.pathname === '/api/google/client' && req.method === 'POST') {
    try {
      const body = (await readBody(req)) as { clientId?: string; clientSecret?: string };
      await saveClient(String(body.clientId ?? ''), String(body.clientSecret ?? ''));
      return json(res, 200, await googleStatus());
    } catch (err) {
      return json(res, 400, { error: errorMessage(err) });
    }
  }
  if (url.pathname === '/api/google/start' && req.method === 'POST') {
    const host = (req.headers.host ?? '').split(':')[0];
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      return json(res, 400, { error: 'Propojení s Googlem udělej přímo na počítači, kde městečko běží (ne z telefonu).' });
    }
    try {
      return json(res, 200, { url: await authUrl(GOOGLE_REDIRECT) });
    } catch (err) {
      return json(res, 400, { error: errorMessage(err) });
    }
  }
  if (url.pathname === '/api/google/disconnect' && req.method === 'POST') {
    await googleDisconnect();
    return json(res, 200, await googleStatus());
  }
  if (url.pathname === '/api/calendar/agenda') {
    const g = await googleStatus();
    if (!g.connected) return json(res, 200, { connected: false, events: [] });
    try {
      const days = Math.min(31, Math.max(1, Number(url.searchParams.get('days') ?? 7)));
      return json(res, 200, { connected: true, email: g.email, events: await agenda(days) });
    } catch (err) {
      return json(res, 502, { error: errorMessage(err) });
    }
  }

  // --- Lexa: plakátky z rešerší ---
  if (url.pathname === '/api/lexa/posters') return json(res, 200, { posters: await listPosters() });
  const lp = url.pathname.match(/^\/api\/lexa\/posters\/([a-z0-9-]+)$/);
  if (lp) {
    if (req.method === 'DELETE') {
      await deletePoster(lp[1]);
      return json(res, 200, { ok: true });
    }
    const p = await getPoster(lp[1]);
    return p ? json(res, 200, p) : json(res, 404, { error: 'Plakátek nenalezen.' });
  }

  // --- Bit: údržba a nápady ---
  if (url.pathname === '/api/bit/status') return json(res, 200, await getReport(url.searchParams.has('ted')));
  if (url.pathname === '/api/bit/ideas') {
    if (req.method === 'POST') {
      try {
        const body = (await readBody(req)) as { title?: string; detail?: string; priority?: string };
        return json(res, 200, await addIdea({ title: String(body.title ?? ''), detail: body.detail, priority: body.priority, from: 'ty' }));
      } catch (err) {
        return json(res, 400, { error: errorMessage(err) });
      }
    }
    return json(res, 200, { ideas: await listIdeas() });
  }
  const im = url.pathname.match(/^\/api\/bit\/ideas\/([a-z0-9-]+)$/);
  if (im) {
    try {
      if (req.method === 'DELETE') {
        await deleteIdea(im[1]);
        return json(res, 200, { ok: true });
      }
      const body = (await readBody(req)) as { title?: string; detail?: string; status?: string; priority?: string };
      return json(res, 200, await updateIdea(im[1], body));
    } catch (err) {
      return json(res, 400, { error: errorMessage(err) });
    }
  }

  // --- Echo: zprávy, počasí, plakátky ---
  if (url.pathname === '/api/news') return json(res, 200, await latestNews(Number(url.searchParams.get('limit') ?? 80)));
  if (url.pathname === '/api/weather') {
    try {
      return json(res, 200, await getWeather());
    } catch (err) {
      return json(res, 502, { error: `Počasí se nepodařilo načíst: ${errorMessage(err)}` });
    }
  }
  if (url.pathname === '/api/digest') {
    if (req.method === 'POST') {
      try {
        return json(res, 200, await generateDigest());
      } catch (err) {
        return json(res, 409, { error: errorMessage(err) });
      }
    }
    return json(res, 200, await digestState());
  }
  const dm = url.pathname.match(/^\/api\/digest\/([a-f0-9-]+)$/);
  if (dm) {
    const d = await getDigest(dm[1]);
    return d ? json(res, 200, d) : json(res, 404, { error: 'Plakátek nenalezen.' });
  }

  const m = url.pathname.match(/^\/api\/chat\/([a-z0-9-]+)$/);
  if (!m) return json(res, 404, { error: 'Neznámá adresa.' });
  const agentId = m[1];
  if (!CONNECTED_AGENTS.has(agentId)) return json(res, 403, { error: 'Tento agent zatím není nastavený.' });

  if (req.method === 'GET') return json(res, 200, { messages: await getHistory(agentId), busy: isBusy(agentId) });
  if (req.method === 'DELETE') {
    if (isBusy(agentId)) return json(res, 409, { error: 'Počkej, až agent doodpovídá.' });
    await clearHistory(agentId);
    return json(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Nepodporovaná metoda.' });

  if (!apiKeyConfigured()) return json(res, 503, { error: 'Chybí ANTHROPIC_API_KEY v souboru .env.' });
  let text: string;
  try {
    const body = (await readBody(req)) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch (err) {
    return json(res, 400, { error: errorMessage(err) });
  }
  if (!text) return json(res, 400, { error: 'Prázdná zpráva.' });
  if (isBusy(agentId)) return json(res, 409, { error: `${CHAT_AGENTS[agentId].name} ještě odpovídá na předchozí zprávu.` });

  // Odpověď streamujeme jako Server-Sent Events.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  try {
    await chatWithAgent(agentId, text, { onText: (t) => send('delta', { text: t }), onTool: (label) => send('tool', { label }),
      onAttachment: (a) => send('attachment', a),
      signal: abort.signal,
    });
    send('done', {});
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('[chat]', err);
      send('error', { message: errorMessage(err) });
    }
  }
  res.end();
}

async function serveStatic(res: ServerResponse, url: URL) {
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) return json(res, 403, { error: 'Zakázáno.' });
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(DIST, 'index.html'); // SPA fallback
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Kancelář ještě není postavená – spusť nejdřív „npm run build“.');
  }
}

/** IPv4 adresy počítače v síti (Wi-Fi, kabel, Tailscale). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Chyba serveru.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  if (process.env.ZPRAVY !== 'vypnuto') startReporter();
  startMaintenance();
  console.log(`🏙️  Městečko Ondik běží na http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!apiKeyConfigured()) console.warn('⚠️  Chybí ANTHROPIC_API_KEY – doplň ho do souboru .env (viz .env.example).');
  if (!PASSWORD) console.log('ℹ️  Bez OFFICE_PASSWORD je městečko dostupné jen z tohoto počítače. Pro přístup z telefonu nastav heslo.');
  else {
    console.log(`📱 Přístup ze sítě je zapnutý (port ${PORT}), chráněný heslem. V telefonu otevři:`);
    for (const addr of lanAddresses()) console.log(`     http://${addr}:${PORT}`);
    console.log('     (doma na stejné Wi-Fi; odkudkoli přes Tailscale – adresa začíná 100.)');
  }
});
