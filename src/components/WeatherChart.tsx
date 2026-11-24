import { useRef, useState, type PointerEvent } from 'react';
import type { Weather } from '../api';
import { localHour } from '../format';

/**
 * Vývoj počasí na 24 hodin: nahoře teplota (čára), pod ní pravděpodobnost srážek (sloupce).
 * Dvě různé veličiny = dva grafy se společnou časovou osou (žádná druhá osa y).
 * Najetím myší (nebo prstem) se ukáže přesná hodnota pro danou hodinu.
 */
export function WeatherChart({ hourly }: { hourly: Weather['hourly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  if (hourly.length < 2) return null;

  const W = 640;
  const PAD_L = 34;
  const PAD_R = 14;
  const T_TOP = 14;
  const T_H = 110;
  const GAP = 30;
  const P_TOP = T_TOP + T_H + GAP;
  const P_H = 54;
  const H = P_TOP + P_H + 22;

  const n = hourly.length;
  const step = (W - PAD_L - PAD_R) / n;
  const cx = (i: number) => PAD_L + step * (i + 0.5);

  // teplota – „hezké“ hranice osy
  const temps = hourly.map((h) => h.temp);
  const span = Math.max(...temps) - Math.min(...temps);
  const tick = span > 14 ? 5 : span > 6 ? 2 : 1;
  const lo = Math.floor((Math.min(...temps) - 0.5) / tick) * tick;
  const hi = Math.ceil((Math.max(...temps) + 0.5) / tick) * tick;
  const ty = (t: number) => T_TOP + T_H - ((t - lo) / (hi - lo)) * T_H;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += tick) ticks.push(Math.round(v * 10) / 10);
  const labelTicks = ticks.length > 5 ? ticks.filter((_, i) => i % 2 === 0) : ticks;

  const line = hourly.map((h, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${ty(h.temp).toFixed(1)}`).join(' ');
  const area = `${line} L${cx(n - 1).toFixed(1)},${T_TOP + T_H} L${cx(0).toFixed(1)},${T_TOP + T_H} Z`;

  // srážky 0–100 %
  const py = (p: number) => P_TOP + P_H - (p / 100) * P_H;
  const barW = Math.max(2, step - 2); // 2px mezera mezi sloupci
  const bar = (i: number, p: number) => {
    const x = cx(i) - barW / 2;
    const y = py(p);
    const h = P_TOP + P_H - y;
    if (h < 0.5) return '';
    const r = Math.min(4, barW / 2, h);
    return `M${x},${P_TOP + P_H} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${P_TOP + P_H} Z`;
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.floor((x - PAD_L) / step))));
  };

  const last = n - 1;
  const h = hover !== null ? hourly[hover] : null;
  const tipLeft = hover !== null ? (cx(hover) / W) * 100 : 0;

  return (
    <div className="wchart" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Teplota a pravděpodobnost srážek na 24 hodin" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <text x={PAD_L} y={T_TOP - 4} className="wchart-title">
          Teplota (°C)
        </text>
        {ticks.map((t) => (
          <line key={t} x1={PAD_L} x2={W - PAD_R} y1={ty(t)} y2={ty(t)} className={t === 0 ? 'wchart-zero' : 'wchart-grid'} />
        ))}
        {labelTicks.map((t) => (
          <text key={t} x={PAD_L - 6} y={ty(t) + 3.5} className="wchart-axis" textAnchor="end">
            {t}
          </text>
        ))}
        <path d={area} className="wchart-area" />
        <path d={line} className="wchart-line" />
        <circle cx={cx(last)} cy={ty(hourly[last].temp)} r={4} className="wchart-end" />
        <circle cx={cx(0)} cy={ty(hourly[0].temp)} r={4} className="wchart-end" />

        <text x={PAD_L} y={P_TOP - 6} className="wchart-title">
          Pravděpodobnost srážek (%)
        </text>
        <line x1={PAD_L} x2={W - PAD_R} y1={py(50)} y2={py(50)} className="wchart-grid" />
        <text x={PAD_L - 6} y={py(100) + 3.5} className="wchart-axis" textAnchor="end">
          100
        </text>
        <text x={PAD_L - 6} y={py(0) + 3.5} className="wchart-axis" textAnchor="end">
          0
        </text>
        {hourly.map((hr, i) => (
          <path key={i} d={bar(i, hr.precipProb)} className="wchart-bar" />
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={P_TOP + P_H} y2={P_TOP + P_H} className="wchart-baseline" />

        {hourly.map((hr, i) =>
          i % 3 === 0 ? (
            <text key={i} x={cx(i)} y={H - 6} className="wchart-axis" textAnchor="middle">
              {localHour(hr.time)}
            </text>
          ) : null,
        )}

        {hover !== null && h && (
          <g pointerEvents="none">
            <line x1={cx(hover)} x2={cx(hover)} y1={T_TOP} y2={P_TOP + P_H} className="wchart-cross" />
            <circle cx={cx(hover)} cy={ty(h.temp)} r={5} className="wchart-dot" />
          </g>
        )}
        <rect x={PAD_L} y={0} width={W - PAD_L - PAD_R} height={H} fill="transparent" />
      </svg>
      {h && (
        <div className="wchart-tip" style={{ left: `${tipLeft}%` }}>
          <strong>
            {localHour(h.time)} {h.icon}
          </strong>
          <span>{Math.round(h.temp * 10) / 10} °C</span>
          <span>
            srážky {h.precipProb} %{h.precip > 0 ? ` · ${h.precip} mm` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
