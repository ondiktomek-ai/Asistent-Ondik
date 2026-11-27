/**
 * Klik – spouštěč: dlaždice s oblíbenými weby (YouTube, Spotify, Google…) a jejich otevírání.
 * Na počítači se odkaz otevře v uživatelově výchozím prohlížeči (kde je přihlášený),
 * na telefonu ho otevře telefon sám.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './store.ts';
import { nowText } from './config.ts';
import { DEFAULT_TILES, type Tile } from '../src/world/tiles.ts';

export { DEFAULT_TILES, type Tile };

export const KLIK_MODEL = process.env.KLIK_MODEL || 'claude-haiku-5-5';

const FILE = 'spoustec.json';

export async function listTiles(): Promise<Tile[]> {
  return readJson<Tile[]>(FILE, DEFAULT_TILES);
}

/** Jen http(s) adresy – nic jiného (soubory, programy) se otevírat nesmí. */
export function safeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim().match(/^[a-z]+:/i) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error('Tohle není platná webová adresa.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Otevřít jde jen webová adresa (http/https).');
  return u.toString();
}

export async function addTile(input: { name?: string; url?: string; search?: string; icon?: string; color?: string }): Promise<Tile> {
  const name = String(input.name ?? '').trim().slice(0, 40);
  if (!name) throw new Error('Chybí název.');
  const url = safeUrl(String(input.url ?? ''));
  const tiles = await listTiles();
  const tile: Tile = {
    id: randomUUID().slice(0, 8),
    name,
    url,
    ...(input.search ? { search: safeUrl(String(input.search)) } : {}),
    icon: String(input.icon ?? '').trim().slice(0, 2) || name[0].toUpperCase(),
    color: /^#[0-9a-f]{6}$/i.test(String(input.color)) ? String(input.color) : '#8a7dff',
  };
  await writeJson(FILE, [...tiles, tile].slice(0, 40));
  return tile;
}

export async function deleteTile(id: string): Promise<void> {
  await writeJson(FILE, (await listTiles()).filter((t) => t.id !== id));
}

export async function resetTiles(): Promise<Tile[]> {
  await writeJson(FILE, DEFAULT_TILES);
  return DEFAULT_TILES;
}

/** Otevře adresu ve výchozím prohlížeči počítače, na kterém běží server. Bez shellu (žádné problémy s & v adrese). */
export function openOnPc(url: string): void {
  const safe = safeUrl(url);
  const [cmd, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', safe]] : process.platform === 'darwin' ? ['open', [safe]] : ['xdg-open', [safe]];
  const child = spawn(cmd, args as string[], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (err) => console.warn('Odkaz se nepodařilo otevřít:', err.message));
  child.unref();
}

/** Najde dlaždici podle id nebo názvu a sestaví adresu (s hledáním, když je zadané). */
export async function resolveLink(target: string, query?: string): Promise<{ url: string; title: string }> {
  const t = target.trim();
  const tiles = await listTiles();
  const tile = tiles.find((x) => x.id.toLowerCase() === t.toLowerCase() || x.name.toLowerCase() === t.toLowerCase());
  const q = query?.trim();
  if (tile) {
    if (q && tile.search) return { url: tile.search + encodeURIComponent(q), title: `${tile.name}: ${q}` };
    return { url: tile.url, title: tile.name };
  }
  const url = safeUrl(t);
  return { url, title: new URL(url).hostname.replace(/^www\./, '') };
}

// ---------------------------------------------------------------- nástroj pro agenty (Klik, Ondik/Jarvis)

export const OPEN_LINK = 'open_link';

export const OPEN_LINK_TOOL: Anthropic.Beta.BetaTool = {
  name: OPEN_LINK,
  description:
    'Otevře uživateli web nebo aplikaci v prohlížeči: dlaždici ze spouštěče (youtube, spotify, google, …) – volitelně rovnou s hledáním – nebo libovolnou webovou adresu. Na počítači se otevře v jeho prohlížeči, na telefonu dostane tlačítko.',
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'id nebo název dlaždice (např. „youtube“, „spotify“, „google“), nebo celá adresa https://…' },
      query: { type: 'string', description: 'Co na dané službě rovnou vyhledat (nepovinné), např. „lofi hip hop“' },
    },
    required: ['target'],
    additionalProperties: false,
  },
};

export async function runOpenLink(input: Record<string, unknown>): Promise<{ url: string; title: string }> {
  return resolveLink(String(input.target ?? ''), typeof input.query === 'string' ? input.query : undefined);
}

export async function tilesText(): Promise<string> {
  const tiles = await listTiles();
  return `Spouštěč (open_link): ${tiles.map((t) => `${t.id} = ${t.name}${t.search ? ' (umí hledat)' : ''}`).join(', ')}.`;
}

export const KLIK_SYSTEM = `Jsi Klik, robot ve virtuálním městečku „OndiVerse“. Bydlíš v boxu, který vypadá jako malé kino (plátno, repráky, gauč). Mluvíš česky, krátce a vesele.

Tvoje práce: na přání uživateli otevřeš web nebo aplikaci v prohlížeči – YouTube, Spotify, Google, Instagram, Gmail, Mapy a další dlaždice ze spouštěče. Použij nástroj open_link: když chce něco konkrétního („pusť lofi na YouTube“, „najdi na Spotify Kabát“, „vygoogli recept na svíčkovou“), vyplň i query, ať se to rovnou vyhledá.
- Po otevření odpověz jednou krátkou větou (např. „Hotovo, YouTube s lofi hudbou je otevřený.“).
- Otevírej jen to, o co si uživatel řekl. Když nevíš, kterou službu myslí, zeptej se.
- Nové dlaždice si uživatel přidá ve tvém panelu (záložka Spouštěč).`;

export async function klikContext(): Promise<string> {
  return `Aktuální datum a čas: ${nowText()}.\n${await tilesText()}`;
}

export const KLIK_TOOL_LABELS: Record<string, string> = { [OPEN_LINK]: '▶️ Otevírám…' };
