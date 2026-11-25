import type { BitReport, CalEvent, Digest, SpendSummary, TeamTask } from '../api';
import type { Newsroom } from '../hooks/useNewsroom';
import { AGENT_BY_ID } from '../world/agents';
import { deg, hhmm, pragueMs } from '../format';

export interface TownItem {
  id: string;
  icon: string;
  text: string;
}

interface InfoPanelProps {
  time: Date;
  newsroom: Newsroom;
  serverOnline: boolean;
  /** Kdo zrovna pracuje (chat, plakátek) a co dělá. */
  busy: Set<string>;
  busyLabels: Record<string, string>;
  /** Co se děje v městečku (nákupy, návštěvy, porada). */
  town: TownItem[];
  /** Dnešní a zítřejší události z kalendáře (Chronos). */
  events: CalEvent[];
  calendarConnected: boolean;
  bitReport: BitReport | null;
  lastResearch: { id: string; title: string } | null;
  /** Úkoly, které si agenti právě zadali mezi sebou. */
  teamActive: TeamTask[];
  /** Odhad útraty za Claude API. */
  spend: SpendSummary | null;
  onSelect: (id: string) => void;
  onOpenPoster: () => void;
  onOpenResearch: (id: string) => void;
}

const todayYmd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });

/** Informační panel vpravo: čas a počasí, co se právě děje, co je dnes na práci, stav a plakátky. */
export function InfoPanel(p: InfoPanelProps) {
  const { time, newsroom } = p;
  const w = newsroom.weather;
  const today = w?.daily[0];
  const ymd = todayYmd(time);

  // Právě teď: kdo komu zadal úkol, kdo pracuje, život v městečku
  const name = (id: string) => AGENT_BY_ID[id]?.name ?? id;
  const handoffs = p.teamActive.map((t) => ({ id: t.to, icon: '🤝', text: `${name(t.from)} → ${name(t.to)}: ${t.task.length > 70 ? t.task.slice(0, 70) + '…' : t.task}` }));
  const delegated = new Set(p.teamActive.map((t) => t.to));
  const working = [...p.busy].filter((id) => !delegated.has(id)).map((id) => {
    const a = AGENT_BY_ID[id];
    const label = (p.busyLabels[id] ?? '💭 Přemýšlí…').replace(/^(\S+)\s+/, '');
    const icon = (p.busyLabels[id] ?? '💭').split(' ')[0];
    return { id, icon, text: `${a?.name ?? id}: ${label}` };
  });
  const now = [...handoffs, ...working, ...p.town];

  // Dnes na práci: zbývající dnešní události
  const remaining = p.events
    .filter((e) => e.start.slice(0, 10) === ymd)
    .filter((e) => e.allDay || pragueMs(e.end) > time.getTime())
    .slice(0, 6);

  const warnings = p.bitReport?.checks.filter((c) => c.state === 'warn' || c.state === 'error') ?? [];
  const nextPoster = new Date(time);
  nextPoster.setHours(nextPoster.getHours() + 1, 0, 0, 0);
  const latest: Digest | null = newsroom.digests?.latest ?? null;

  return (
    <aside className="infopanel" aria-label="Přehled">
      <header className="info-head">
        <div className="info-clock">
          <time>{time.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
          <span>{time.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        {w && (
          <button className="info-weather" onClick={() => p.onSelect('echo')} title={`${w.place}: ${w.current.text}`}>
            <span className="info-weather-icon">{w.current.icon}</span>
            <span>
              <strong>{deg(w.current.temp)}</strong>
              {today && (
                <small>
                  {Math.round(today.min)}° / {Math.round(today.max)}°
                </small>
              )}
            </span>
          </button>
        )}
      </header>

      <div className="info-body">
        <section>
          <h3>Právě teď</h3>
          {now.length ? (
            <ul className="info-list">
              {now.map((i) => (
                <li key={i.id + i.text}>
                  <button onClick={() => AGENT_BY_ID[i.id] && p.onSelect(i.id)}>
                    <span className="info-icon">{i.icon}</span>
                    <span>{i.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">V městečku je klid – všichni pracují ve svých boxech.</p>
          )}
        </section>

        <section>
          <h3>Dnes na práci</h3>
          {!p.serverOnline ? (
            <p className="hint">Kalendář uvidíš, až městečko poběží na tvém počítači.</p>
          ) : !p.calendarConnected ? (
            <button className="info-link" onClick={() => p.onSelect('chronos')}>
              📅 Propojit kalendář u Chronose
            </button>
          ) : remaining.length ? (
            <ul className="info-agenda">
              {remaining.map((e) => (
                <li key={e.id}>
                  <span className="info-time">{e.allDay ? 'celý den' : e.start.slice(11)}</span>
                  <span>{e.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Dnes už v kalendáři nic nemáš. 🎉</p>
          )}
          {p.serverOnline && <p className="info-next">🗞️ Další plakátek od Echa v {hhmm(nextPoster)}</p>}
        </section>

        {p.serverOnline && (
          <section>
            <h3>Stav městečka</h3>
            <button className={`info-status ${warnings.length ? 'warn' : 'ok'}`} onClick={() => p.onSelect('bit')}>
              {p.bitReport ? (warnings.length ? `⚠️ ${warnings.length === 1 ? warnings[0].name + ': ' + warnings[0].detail : `${warnings.length} upozornění – klikni`}` : '✓ Všechno běží') : 'Bit kontroluje…'}
            </button>
          </section>
        )}

        {p.serverOnline && p.spend && (
          <section>
            <h3>Útrata za Claude</h3>
            <button className="info-spend" onClick={() => p.onSelect('bit')} title="Odhad podle ceníku. Přesná čísla: Claude Console → Usage / Cost">
              <span>
                <small>dnes</small>
                <strong>{czk(p.spend.today.czk)}</strong>
              </span>
              <span>
                <small>tento měsíc</small>
                <strong>{czk(p.spend.month.czk)}</strong>
              </span>
              <SpendBars days={p.spend.days} />
            </button>
            {p.spend.byAgent.length > 0 && (
              <p className="info-next">
                {p.spend.byAgent
                  .slice(0, 4)
                  .map((a) => `${AGENT_BY_ID[a.id]?.icon ?? '🤖'} ${czk(a.czk)}`)
                  .join(' · ')}
              </p>
            )}
          </section>
        )}

        {(latest || p.lastResearch) && (
          <section>
            <h3>Plakátky</h3>
            {latest && (
              <button className="info-card echo" onClick={p.onOpenPoster}>
                <span>🗞️ Echo · {hhmm(latest.createdAt)}</span>
                <strong>{latest.headline}</strong>
              </button>
            )}
            {p.lastResearch && (
              <button className="info-card lexa" onClick={() => p.onOpenResearch(p.lastResearch!.id)}>
                <span>📜 Lexa · rešerše</span>
                <strong>{p.lastResearch.title}</strong>
              </button>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

const czk = (v: number) => `${v < 10 ? v.toFixed(2).replace('.', ',') : Math.round(v)} Kč`;

/** Malý sloupcový graf útraty za posledních 14 dní. */
function SpendBars({ days }: { days: { date: string; czk: number }[] }) {
  const max = Math.max(...days.map((d) => d.czk), 0.01);
  return (
    <span className="spend-bars" aria-hidden>
      {days.map((d) => (
        <i key={d.date} style={{ height: `${Math.max(6, (d.czk / max) * 100)}%` }} title={`${d.date}: ${czk(d.czk)}`} />
      ))}
    </span>
  );
}
