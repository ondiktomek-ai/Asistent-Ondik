/** Chat s Echem – zpravodajem. Odpovídá z aktuálních zpráv a počasí, které mu server přiloží. */
import { latestNews } from './news.ts';
import { getWeather } from './weather.ts';
import { digestState, REPORTER_MODEL } from './reporter.ts';
import { hhmmPrague, nowText } from './config.ts';
import { SCOPE_NAMES } from './news-sources.ts';

export const ECHO_MODEL = process.env.ECHO_CHAT_MODEL || REPORTER_MODEL;

export const ECHO_SYSTEM = `Jsi Echo, zpravodaj ve virtuálním městečku „OndiVerse“. Bydlíš a pracuješ v redakci – boxu na kraji náměstí. Hlídáš zprávy ze světa, z Česka i z regionu (Lipník nad Bečvou, Přerovsko, Olomoucký kraj) a hlásíš počasí pro Lipník nad Bečvou. Mluvíš s uživatelem česky, přátelsky a věcně.

Jak odpovídáš:
- Vycházej z podkladů, které dostáváš v systémových zprávách (nejnovější zprávy, poslední plakátek, počasí). Nic si nevymýšlej. Když v podkladech odpověď není, řekni to rovnou a nabídni, co víš.
- U zpráv uveď zdroj (např. „podle ČT24“). Anglické zprávy přelož.
- K počasí odpovídej prakticky: teplota, kdy zaprší, jak se obléct.
- Piš stručně, uživatel tě často čte na telefonu. Krátké odstavce, případně odrážky začínající „- “. Bez nadpisů a tabulek.`;

/** Podklady přiložené ke každé otázce. */
export async function echoContext(): Promise<string> {
  const parts = [`Aktuální datum a čas: ${nowText()}.`];

  try {
    const w = await getWeather();
    const next = w.hourly
      .filter((_, i) => i % 3 === 0)
      .map((h) => `${h.time.slice(11, 16)} ${Math.round(h.temp)}°C ${h.precipProb}%`)
      .join(', ');
    const days = w.daily.map((d) => `${d.date} ${d.text} ${Math.round(d.min)}–${Math.round(d.max)}°C, ${d.precip} mm`).join('; ');
    parts.push(
      `POČASÍ ${w.place}: teď ${w.current.temp}°C (pocitově ${w.current.feels}°C), ${w.current.text}, vítr ${w.current.wind} km/h. Příštích 24 h (čas teplota pravděpodobnost srážek): ${next}. Dny: ${days}.`,
    );
  } catch {
    parts.push('POČASÍ: teď se nepodařilo načíst.');
  }

  const { latest } = await digestState();
  if (latest) parts.push(`POSLEDNÍ PLAKÁTEK (${hhmmPrague(latest.createdAt)}): ${latest.headline} – ${latest.summary}`);

  const { items } = await latestNews(40);
  const dayAgo = Date.now() - 24 * 3600_000;
  const recent = items.filter((i) => Date.parse(i.published) >= dayAgo).slice(0, 30);
  parts.push(
    recent.length
      ? `NEJNOVĚJŠÍ ZPRÁVY:\n${recent.map((i) => `- [${SCOPE_NAMES[i.scope]}] ${i.source}, ${hhmmPrague(i.published)}: ${i.title}`).join('\n')}`
      : 'NEJNOVĚJŠÍ ZPRÁVY: zatím žádné.',
  );
  return parts.join('\n\n');
}
