/** Společná nastavení serveru. */
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
