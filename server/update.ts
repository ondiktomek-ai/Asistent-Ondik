/**
 * Aktualizace městečka z GitHubu (repozitář je veřejný – žádné heslo ani token).
 * Spouštěč na ploše při každém spuštění stáhne novou verzi sám (scripts/spolecne.ps1 → Aktualizuj);
 * tady jen zjišťujeme, jestli je nová verze, a na přání spustíme aktualizaci hned.
 */
import { spawn } from 'node:child_process';
import { serviceFailed, serviceOk } from './net.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const REPO = 'ondiktomek-ai/Asistent-Ondik';
export const BRANCH = process.env.AKTUALIZACE_VETEV || 'claude/ai-agent-office-setup-2nah22';
const VERSION_FILE = path.resolve('.verze');

/** Verze (commit), kterou spouštěč naposledy nainstaloval; null = neznámá (např. ruční ZIP). */
export function localVersion(): string | null {
  try {
    return readFileSync(VERSION_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

let cache: { at: number; sha: string | null } | null = null;

/**
 * Nejnovější verze na GitHubu (ukládá se na 30 minut). Hlavně přes git rozhraní (nepočítá se do
 * limitu 60 dotazů za hodinu jako API), API GitHubu je záloha.
 */
export async function latestVersion(force = false): Promise<string | null> {
  if (!force && cache && Date.now() - cache.at < 30 * 60_000) return cache.sha;
  let lastErr: unknown = null;
  const sha =
    (await viaGit().catch((e) => {
      lastErr = e;
      return null;
    })) ??
    (await viaApi().catch((e) => {
      lastErr = e;
      return null;
    }));
  if (sha) {
    cache = { at: Date.now(), sha };
    serviceOk('github', 'Kontrola verze (GitHub)');
  } else {
    cache = null; // příště zkusit znovu, ne čekat 30 minut
    serviceFailed('github', 'Kontrola verze (GitHub)', lastErr ?? new Error('GitHub nevrátil verzi'), () => latestVersion(true));
  }
  return sha;
}

async function viaGit(): Promise<string | null> {
  const res = await fetch(`https://github.com/${REPO}.git/info/refs?service=git-upload-pack`, {
    headers: { 'User-Agent': 'git/2.45.0 (OndiVerse)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const ref = `refs/heads/${BRANCH}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`([0-9a-f]{40}) ${ref}(?:\\s|\\0|$)`).exec(text)?.[1] ?? null;
}

async function viaApi(): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`, {
    headers: { 'User-Agent': 'OndiVerse', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000),
  });
  return res.ok ? (((await res.json()) as { sha?: string }).sha ?? null) : null;
}

export const updatesEnabled = () => process.env.AKTUALIZACE !== 'ne';

export async function updateStatus() {
  const local = localVersion();
  const latest = updatesEnabled() ? await latestVersion() : null;
  return { local, latest, available: !!local && !!latest && local !== latest, canUpdateNow: process.platform === 'win32' };
}

/**
 * Spustí aktualizaci hned (jen Windows): spouštěč stáhne novou verzi, sestaví ji a restartuje server.
 * Pouští se přes Start-Process, aby nebyl „potomkem“ serveru – jinak by ho restart serveru ukončil.
 */
export function startUpdateNow(): void {
  if (process.platform !== 'win32') throw new Error('Okamžitá aktualizace jde jen na Windows – jinde stačí městečko znovu spustit.');
  const script = path.resolve('scripts', 'spustit.ps1').replace(/'/g, "''");
  const inner = `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','"${script}"','-BezOkna'`;
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', inner], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', (err) => console.warn('[aktualizace]', err.message));
  child.unref();
}
