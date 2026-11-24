import { useEffect, useState } from 'react';
import type { NewsItem } from '../api';
import type { Newsroom } from '../hooks/useNewsroom';
import { SCOPE_LABEL, ago, deg } from '../format';

const NEW_MINUTES = 20;

interface TickerProps {
  newsroom: Newsroom;
  serverOnline: boolean;
  onOpenPoster: () => void;
  onOpenEcho: () => void;
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Item({ item, now }: { item: NewsItem; now: number }) {
  const fresh = now - Date.parse(item.seen) < NEW_MINUTES * 60_000;
  return (
    <li className={`tick-item scope-${item.scope}${fresh ? ' fresh' : ''}`}>
      <a href={item.link} target="_blank" rel="noreferrer">
        <span className="tick-meta">
          {fresh && <span className="tick-new">NOVÉ</span>}
          <span className="tick-scope">{SCOPE_LABEL[item.scope]}</span>
          <span>{item.source}</span>
          <span>· {ago(item.published, now)}</span>
        </span>
        <span className="tick-title">{item.title}</span>
      </a>
    </li>
  );
}

/** Pás zpráv vpravo (na telefonu dole jako běžící řádek). */
export function NewsTicker({ newsroom, serverOnline, onOpenPoster, onOpenEcho }: TickerProps) {
  const now = useNow();
  const { feed, weather, digests } = newsroom;
  const items = feed?.items.slice(0, 40) ?? [];
  const okSources = feed?.sources.filter((s) => s.ok).length ?? 0;
  // rychlost: ~5 s na zprávu, aby se dalo číst
  const duration = Math.max(40, items.length * 5);

  return (
    <>
      <aside className="ticker" aria-label="Zprávy">
        <header className="ticker-head">
          <button className="ticker-title" onClick={onOpenEcho} title="Otevřít Echa">
            <span className="ticker-dot" />
            Echo hlásí
          </button>
          {weather && (
            <span className="ticker-weather" title={`${weather.place}: ${weather.current.text}`}>
              {weather.current.icon} {deg(weather.current.temp)}
            </span>
          )}
        </header>
        {digests?.latest && (
          <button className="ticker-poster" onClick={onOpenPoster}>
            <span>🗞️ Poslední plakátek</span>
            <strong>{digests.latest.headline}</strong>
          </button>
        )}
        <div className="ticker-viewport">
          {!serverOnline ? (
            <p className="ticker-empty">Zprávy poběží, až městečko spustíš na svém počítači (ikonou na ploše).</p>
          ) : items.length === 0 ? (
            <p className="ticker-empty">{feed ? 'Echo zatím žádné zprávy nenašel. Stav zdrojů uvidíš v jeho panelu.' : 'Načítám zprávy…'}</p>
          ) : (
            <ul className="ticker-list" style={{ animationDuration: `${duration}s` }}>
              {items.map((i) => (
                <Item key={i.id} item={i} now={now} />
              ))}
              {/* druhá kopie kvůli plynulému opakování */}
              {items.map((i) => (
                <Item key={`b-${i.id}`} item={i} now={now} />
              ))}
            </ul>
          )}
        </div>
        {feed && (
          <footer className="ticker-foot">
            {feed.lastPoll ? `Aktualizováno ${ago(feed.lastPoll, now)}` : 'Čekám na první stažení'} · zdroje {okSources}/{feed.sources.length}
          </footer>
        )}
      </aside>

      {serverOnline && items.length > 0 && (
        <div className="ticker-strip" aria-hidden>
          <button className="ticker-strip-label" onClick={onOpenEcho}>
            📰
          </button>
          <div className="ticker-strip-track">
            <div className="ticker-strip-run" style={{ animationDuration: `${items.length * 6}s` }}>
              {[...items, ...items].map((i, k) => (
                <span key={k}>
                  <b>{SCOPE_LABEL[i.scope]}</b> {i.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
