import { useEffect, useState } from 'react';
import type { NewsItem } from '../api';
import type { Newsroom } from '../hooks/useNewsroom';
import { SCOPE_LABEL, ago } from '../format';

const NEW_MINUTES = 20;

/** Lišta zpráv dole: jednotlivé zprávy jako bublinky, které pomalu jedou zprava doleva. */
export function NewsBar({ newsroom, serverOnline, onOpenEcho }: { newsroom: Newsroom; serverOnline: boolean; onOpenEcho: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const items = newsroom.feed?.items.slice(0, 30) ?? [];
  const pill = (i: NewsItem, k: string) => {
    const fresh = now - Date.parse(i.seen) < NEW_MINUTES * 60_000;
    return (
      <a key={k} className={`news-pill scope-${i.scope}${fresh ? ' fresh' : ''}`} href={i.link} target="_blank" rel="noreferrer" title={i.summary || i.title}>
        <span className="news-pill-dot" />
        {fresh && <span className="tick-new">NOVÉ</span>}
        <span className="news-pill-meta">
          {SCOPE_LABEL[i.scope]} · {i.source} · {ago(i.published, now)}
        </span>
        <span className="news-pill-title">{i.title}</span>
      </a>
    );
  };

  return (
    <div className="newsbar" role="region" aria-label="Zprávy">
      <button className="newsbar-label" onClick={onOpenEcho} title="Otevřít Echa">
        <span className="ticker-dot" />
        Echo
      </button>
      <div className="newsbar-track">
        {!serverOnline ? (
          <span className="newsbar-empty">Zprávy poběží, až městečko spustíš na svém počítači (ikonou na ploše).</span>
        ) : items.length === 0 ? (
          <span className="newsbar-empty">{newsroom.feed ? 'Echo zatím žádné zprávy nenašel.' : 'Načítám zprávy…'}</span>
        ) : (
          // Seznam dvakrát za sebou kvůli plynulému dokola; ~7 s na zprávu, najetím myší se zastaví.
          <div className="newsbar-run" style={{ animationDuration: `${Math.max(60, items.length * 7)}s` }}>
            {items.map((i) => pill(i, i.id))}
            {items.map((i) => pill(i, `b-${i.id}`))}
          </div>
        )}
      </div>
    </div>
  );
}
