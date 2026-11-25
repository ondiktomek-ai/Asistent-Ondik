import { useEffect } from 'react';
import type { ResearchPoster } from '../api';
import { hhmm, longDate } from '../format';

/** Plakátek z Lexiny rešerše – stejný „papírový“ styl jako Echův, ale v jejích barvách. */
export function ResearchPosterView({ poster, onClose }: { poster: ResearchPoster; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <div className="poster-backdrop" onClick={onClose}>
      <article className="poster research" onClick={(e) => e.stopPropagation()} aria-label="Plakátek z rešerše">
        <button className="poster-close" onClick={onClose} aria-label="Zavřít plakátek">
          ×
        </button>
        <header className="poster-mast">
          <div className="poster-brand">
            <span className="poster-logo">LEXA</span>
            <span>Rešerše</span>
          </div>
          <time>
            {longDate(poster.createdAt)} · {hhmm(poster.createdAt)}
          </time>
        </header>

        {poster.topic && <p className="research-topic">Zadání: {poster.topic}</p>}
        <h2 className="poster-headline">{poster.title}</h2>
        {poster.subtitle && <p className="research-subtitle">{poster.subtitle}</p>}
        <p className="poster-summary">{poster.summary}</p>

        {poster.facts.length > 0 && (
          <ul className="research-facts">
            {poster.facts.map((f, i) => (
              <li key={i}>
                <strong>{f.value}</strong>
                <span>{f.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`research-sections n${Math.min(poster.sections.length, 3)}`}>
          {poster.sections.map((sec, i) => (
            <section key={i} className="poster-col">
              <h3>{sec.heading}</h3>
              <ul>
                {sec.points.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {poster.verdict && (
          <div className="research-verdict">
            <span>Doporučení</span>
            <p>{poster.verdict}</p>
          </div>
        )}

        {poster.sources.length > 0 && (
          <footer className="research-sources">
            <h3>Zdroje</h3>
            <ol>
              {poster.sources.map((s, i) => (
                <li key={i}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>{' '}
                  <small>{host(s.url)}</small>
                </li>
              ))}
            </ol>
          </footer>
        )}
        <footer className="poster-foot">
          <span>Sepsala Lexa · Claude Haiku 5.5 · z webu</span>
          <span>Ověř si důležité údaje ve zdrojích.</span>
        </footer>
      </article>
    </div>
  );
}
