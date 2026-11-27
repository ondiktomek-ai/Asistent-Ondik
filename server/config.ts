/** Společná nastavení serveru. */
import Anthropic from '@anthropic-ai/sdk';

let claudeClient: Anthropic | null = null;
/**
 * Klient Claude API pro celý server. Timeout 60 s na začátek odpovědi (dlouhé streamované
 * odpovědi neusekne – hlídá jen čekání na spojení a hlavičky), 2 rychlá opakování při výpadku spojení.
 * Výchozí nastavení knihovny by čekalo až 10 minut.
 */
export function claude(): Anthropic {
  claudeClient ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return claudeClient;
}

/** Zahodí klienta (nové spojení) – „restart“ služby po výpadku. */
export function resetClaude() {
  claudeClient = null;
}
export function apiKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Datum a čas v české zóně, např. „úterý 24. listopadu 2026 21:07“. */
export function nowText(d = new Date()): string {
  return d.toLocaleString('cs-CZ', {
    timeZone: process.env.TZ_DISPLAY ?? 'Europe/Prague',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function hhmmPrague(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
}
