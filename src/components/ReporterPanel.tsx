import type { Newsroom } from '../hooks/useNewsroom';
import { SCOPE_LABEL, ago, dayName, deg, hhmm } from '../format';

interface ReporterPanelProps {
  newsroom: Newsroom;
  serverOnline: boolean;
  onOpenPoster: (id?: string) => void;
}

/** Panel zpravodaje Echa: počasí, plakátky a stav zdrojů. */
export function ReporterPanel({ newsroom, serverOnline, onOpenPoster }: ReporterPanelProps) {
  const { weather, weatherError, digests, feed, createNow, creating, error } = newsroom;

  if (!serverOnline) {
    return (
      <div className="chat-note">
        <strong>Echo pracuje na tvém počítači.</strong>
        <p>Zprávy, počasí a plakátky uvidíš, až městečko spustíš ikonou na ploše.</p>
      </div>
    );
  }

  const busy = creating || !!digests?.generating;
  const now = Date.now();

  return (
    <div className="reporter">
      <section className="rep-weather">
        <h3>Počasí · {weather?.place ?? 'Lipník nad Bečvou'}</h3>
        {weather ? (
          <>
            <div className="rep-now">
              <span className="rep-now-icon">{weather.current.icon}</span>
              <div>
                <strong>{deg(weather.current.temp)}</strong>
                <span>
                  {weather.current.text} · pocitově {deg(weather.current.feels)}
                </span>
              </div>
            </div>
            <ul className="rep-days">
              {weather.daily.map((d) => (
                <li key={d.date}>
                  <span>{dayName(d.date)}</span>
                  <span>{d.icon}</span>
                  <span>
                    {Math.round(d.min)}° / {Math.round(d.max)}°
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint">{weatherError ?? 'Načítám počasí…'}</p>
        )}
      </section>

      <section>
        <h3>Plakátky</h3>
        <div className="rep-actions">
          <button className="rep-btn primary" disabled={!digests?.latest} onClick={() => onOpenPoster()}>
            🗞️ Otevřít poslední
          </button>
          <button className="rep-btn" disabled={busy} onClick={() => void createNow()}>
            {busy ? '📰 Píšu…' : '✍️ Napsat teď'}
          </button>
        </div>
        {(error || digests?.lastError) && <div className="chat-error">{digests?.lastError ?? error}</div>}
        <p className="hint">Nový plakátek vychází každou celou hodinu, dokud městečko běží.</p>
        {digests && digests.history.length > 0 && (
          <ul className="rep-history">
            {digests.history.slice(0, 12).map((h) => (
              <li key={h.id}>
                <button onClick={() => onOpenPoster(h.id)}>
                  <time>{hhmm(h.createdAt)}</time>
                  <span>{h.headline}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Stav zdrojů</h3>
        {feed ? (
          <ul className="rep-sources">
            {feed.sources.map((s) => (
              <li key={s.id} className={s.ok ? 'ok' : 'bad'} title={s.lastError ?? ''}>
                <span className="rep-src-state" aria-label={s.ok ? 'funguje' : 'nefunguje'}>
                  {s.ok ? '✓' : '✗'}
                </span>
                <span className="rep-src-name">
                  {s.name} <small>{SCOPE_LABEL[s.scope]}</small>
                </span>
                <span className="rep-src-info">{s.ok ? `${s.items} zpráv` : s.lastCheck ? s.lastError : 'zatím nezkoušeno'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Načítám…</p>
        )}
        {feed?.lastPoll && <p className="hint">Naposledy staženo {ago(feed.lastPoll, now)}.</p>}
      </section>
    </div>
  );
}
