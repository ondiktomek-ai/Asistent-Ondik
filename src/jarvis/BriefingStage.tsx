import { useEffect, useState } from 'react';
import type { Briefing, BriefingSegment } from '../api';

/**
 * „Obrazovka zpráv“: každá část hlášení má vlastní animovanou grafiku.
 * Komponenta se pro každou část vykreslí znovu (key = index), takže animace vždy začnou od začátku.
 */
export function BriefingStage({ seg, briefing, progress, now }: { seg: BriefingSegment; briefing: Briefing; progress: number; now: Date }) {
  switch (seg.kind) {
    case 'uvod':
      return <IntroStage briefing={briefing} now={now} />;
    case 'pocasi':
      return <WeatherStage briefing={briefing} />;
    case 'svet':
    case 'cesko':
    case 'region':
    case 'tym':
      return seg.items.length ? <NewsStage seg={seg} progress={progress} /> : <TextStage seg={seg} />;
    case 'program':
      return <ProgramStage briefing={briefing} />;
    default:
      return <TextStage seg={seg} />;
  }
}

const SECTION: Record<string, { label: string; sub: string }> = {
  svet: { label: 'Svět', sub: 'Hlavní zprávy ze světa' },
  cesko: { label: 'Česko', sub: 'Co se děje doma' },
  region: { label: 'Region', sub: 'Lipník nad Bečvou a okolí' },
  tym: { label: 'Tým', sub: 'Hlášení z městečka' },
};

/** Číslo, které se plynule „napočítá“. */
function useCountUp(target: number, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function IntroStage({ briefing, now }: { briefing: Briefing; now: Date }) {
  const w = briefing.weather;
  return (
    <div className="bs bs-intro">
      <div className="bs-kicker">Osobní hlášení</div>
      <time className="bs-clock">{now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
      <div className="bs-date">{now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="bs-chips">
        <span className="bs-chip">📍 Lipník nad Bečvou</span>
        {w && (
          <span className="bs-chip">
            {w.icon} {Math.round(w.temp)} °C · {w.text}
          </span>
        )}
        {briefing.events.length > 0 && <span className="bs-chip">📅 {briefing.events.length} v programu</span>}
      </div>
    </div>
  );
}

function WeatherStage({ briefing }: { briefing: Briefing }) {
  const w = briefing.weather;
  const temp = useCountUp(w?.temp ?? 0);
  if (!w) return <div className="bs bs-text">Počasí teď není k dispozici.</div>;
  const hours = w.hourly ?? [];
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps, w.min ?? 0) - 1;
  const hi = Math.max(...temps, w.max ?? 0) + 1;
  const W = 1000;
  const H = 180;
  const x = (i: number) => (hours.length > 1 ? (i / (hours.length - 1)) * W : W / 2);
  const y = (t: number) => H - 18 - ((t - lo) / Math.max(1, hi - lo)) * (H - 46);
  const line = hours.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`).join(' ');
  return (
    <div className="bs bs-weather">
      <div className="bs-kicker">Počasí · Lipník nad Bečvou</div>
      <div className="bs-weather-top">
        <span className="bs-weather-icon">{w.icon}</span>
        <span className="bs-temp">
          {Math.round(temp)}
          <small>°C</small>
        </span>
        <div className="bs-weather-text">
          <strong>{w.text}</strong>
          {w.min !== undefined && w.max !== undefined && (
            <span>
              dnes {Math.round(w.min)}° až {Math.round(w.max)}°
            </span>
          )}
          {w.tomorrow && (
            <span>
              zítra {w.tomorrow.icon} {Math.round(w.tomorrow.min)}° až {Math.round(w.tomorrow.max)}°
            </span>
          )}
        </div>
      </div>
      {hours.length > 1 && (
        <svg className="bs-chart" viewBox={`-20 0 ${W + 40} ${H}`} aria-hidden>
          <defs>
            <linearGradient id="bsFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgb(94,231,255)" stopOpacity="0.35" />
              <stop offset="1" stopColor="rgb(94,231,255)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {hours.map((h, i) => (
            <rect key={`p${i}`} className="bs-rain" x={x(i) - 6} width={12} y={H - 16 - (h.precipProb / 100) * 40} height={(h.precipProb / 100) * 40} style={{ animationDelay: `${0.6 + i * 0.05}s` }} />
          ))}
          <path className="bs-area" d={`${line} L${x(hours.length - 1)},${H - 16} L0,${H - 16} Z`} fill="url(#bsFill)" />
          <path className="bs-line" d={line} pathLength={1} />
          {hours.map((h, i) =>
            i % 3 === 0 ? (
              <g key={i} className="bs-point" style={{ animationDelay: `${0.8 + i * 0.06}s` }}>
                <circle cx={x(i)} cy={y(h.temp)} r={4} />
                <text x={x(i)} y={y(h.temp) - 10} textAnchor="middle">
                  {Math.round(h.temp)}°
                </text>
                <text x={x(i)} y={H - 2} textAnchor="middle" className="bs-hour">
                  {h.time}
                </text>
              </g>
            ) : null,
          )}
        </svg>
      )}
    </div>
  );
}

function NewsStage({ seg, progress }: { seg: BriefingSegment; progress: number }) {
  const sec = SECTION[seg.kind] ?? { label: '', sub: '' };
  // zvýrazněná zpráva podle toho, kam Jarvis při čtení došel
  const active = Math.min(seg.items.length - 1, Math.floor(progress * seg.items.length * 1.05));
  return (
    <div className={`bs bs-news bs-${seg.kind}`}>
      <div className="bs-kicker">
        {sec.label} <span>· {sec.sub}</span>
      </div>
      <ol className="bs-headlines">
        {seg.items.map((n, i) => (
          <li key={n.link || n.title} className={i === active ? 'active' : i < active ? 'done' : ''} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
            <span className="bs-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <a href={n.link} target="_blank" rel="noreferrer">
                {n.title}
              </a>
              <span className="bs-source">{n.source}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProgramStage({ briefing }: { briefing: Briefing }) {
  if (!briefing.calendarConnected)
    return (
      <div className="bs bs-text">
        <div className="bs-kicker">Program</div>
        <p>Kalendář zatím není propojený – propoj ho u Chronose.</p>
      </div>
    );
  if (!briefing.events.length)
    return (
      <div className="bs bs-text">
        <div className="bs-kicker">Program</div>
        <p className="bs-big">Volno 🎉</p>
        <p>Dnes ani zítra nic v kalendáři.</p>
      </div>
    );
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
  return (
    <div className="bs bs-program">
      <div className="bs-kicker">Program</div>
      <ol className="bs-timeline">
        {briefing.events.slice(0, 6).map((e, i) => (
          <li key={i} style={{ animationDelay: `${0.2 + i * 0.25}s` }}>
            <span className="bs-time">
              {e.allDay ? 'celý den' : e.start.slice(11, 16)}
              <small>{e.start.slice(0, 10) === today ? 'dnes' : 'zítra'}</small>
            </span>
            <span className="bs-dot" />
            <span className="bs-event">
              {e.summary}
              {e.location && <small>{e.location}</small>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TextStage({ seg }: { seg: BriefingSegment }) {
  return (
    <div className="bs bs-text">
      <p className={seg.kind === 'otazka' ? 'bs-question' : 'bs-big-text'}>{seg.text}</p>
      {seg.kind === 'otazka' && <span className="bs-mic-hint">🎙️ Odpovězte hlasem, nebo napište</span>}
    </div>
  );
}
