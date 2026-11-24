import { useEffect } from 'react';
import type { Digest, DigestEntry } from '../api';
import { dayName, deg, hhmm, longDate } from '../format';
import { WeatherChart } from './WeatherChart';

/** „claude-haiku-5-5“ → „Claude Haiku 5.5“ */
function modelLabel(id: string) {
  return 'Claude ' + id.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^\w/, (c) => c.toUpperCase());
}

function Section({ title, entries, empty }: { title: string; entries: DigestEntry[]; empty: string }) {
  return (
    <section className="poster-col">
      <h3>{title}</h3>
      {entries.length ? (
        <ol>
          {entries.map((e, i) => (
            <li key={i}>
              {e.link ? (
                <a href={e.link} target="_blank" rel="noreferrer">
                  {e.text}
                </a>
              ) : (
                e.text
              )}
              {e.source && <small>{e.source}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="poster-empty">{empty}</p>
      )}
    </section>
  );
}

/** Hodinový plakátek Echa – souhrn zpráv a vývoj počasí. */
export function DigestPoster({ digest, onClose }: { digest: Digest; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const w = digest.weather;
  const next = new Date(digest.createdAt);
  next.setHours(next.getHours() + 1, 0, 0, 0);

  return (
    <div className="poster-backdrop" onClick={onClose}>
      <article className="poster" onClick={(e) => e.stopPropagation()} aria-label="Hodinový plakátek">
        <button className="poster-close" onClick={onClose} aria-label="Zavřít plakátek">
          ×
        </button>
        <header className="poster-mast">
          <div className="poster-brand">
            <span className="poster-logo">ECHO</span>
            <span>Hodinový plakátek · {w?.place ?? 'Lipník nad Bečvou'}</span>
          </div>
          <time>
            {longDate(digest.createdAt)} · {hhmm(digest.createdAt)}
          </time>
        </header>

        <h2 className="poster-headline">{digest.headline}</h2>
        <p className="poster-summary">{digest.summary}</p>

        <div className="poster-cols">
          <Section title="Svět" entries={digest.world} empty="Ve světě nic zásadního." />
          <Section title="Česko" entries={digest.czech} empty="Doma klid." />
          <Section title="Lipník a okolí" entries={digest.region} empty="Z regionu nic nového." />
        </div>

        <section className="poster-weather">
          <h3>Počasí</h3>
          {w ? (
            <div className="poster-weather-grid">
              <div className="poster-now">
                <span className="poster-now-icon">{w.current.icon}</span>
                <div>
                  <strong>{deg(w.current.temp)}</strong>
                  <span>{w.current.text}</span>
                  <small>
                    pocitově {deg(w.current.feels)} · vítr {Math.round(w.current.wind)} km/h
                  </small>
                </div>
              </div>
              <p className="poster-weather-text">{digest.weatherText}</p>
              <div className="poster-chart">
                <WeatherChart hourly={w.hourly} />
              </div>
              <ul className="poster-days">
                {w.daily.map((d) => (
                  <li key={d.date}>
                    <span className="poster-day-name">{dayName(d.date)}</span>
                    <span className="poster-day-icon">{d.icon}</span>
                    <span className="poster-day-temp">
                      {Math.round(d.min)}° / <strong>{Math.round(d.max)}°</strong>
                    </span>
                    <small>
                      {d.text}
                      {d.precip > 0 ? ` · ${d.precip} mm` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="poster-empty">{digest.weatherText}</p>
          )}
        </section>

        <footer className="poster-foot">
          <span>
            Sepsal Echo{digest.ai && digest.model ? ` · ${modelLabel(digest.model)}` : ''} · {digest.newsCount} zpráv
          </span>
          {digest.note && <span className="poster-note">{digest.note}</span>}
          <span>Další plakátek v {hhmm(next)}</span>
        </footer>
      </article>
    </div>
  );
}
