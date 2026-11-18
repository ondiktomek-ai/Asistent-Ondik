/**
 * Knihovna nábytku pro pohled shora. Všechny kusy se umisťují středem (cx, cy).
 * `back` = směr ke zdi (-1 nahoru, 1 dolů) – podle něj se natáčí monitory apod.
 */
import type { ReactNode } from 'react';

const SHADOW = 'rgba(0,0,0,0.28)';
const WOOD = '#b98a5a';
const WOOD_DARK = '#8a6440';

type Dir = -1 | 1;

/** Deterministický „náhodný“ generátor, aby se nábytek neměnil při překreslení. */
export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Shadow({ x, y, w, h, rx = 6 }: { x: number; y: number; w: number; h: number; rx?: number }) {
  return <rect x={x + 3} y={y + 4} width={w} height={h} rx={rx} fill={SHADOW} />;
}

export function Rug({ cx, cy, w, h, color, round = false }: { cx: number; cy: number; w: number; h: number; color: string; round?: boolean }) {
  if (round) {
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={color} opacity={0.55} />
        <ellipse cx={cx} cy={cy} rx={w / 2 - 7} ry={h / 2 - 7} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="6 5" />
      </g>
    );
  }
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={8} fill={color} opacity={0.55} />
      <rect x={cx - w / 2 + 7} y={cy - h / 2 + 7} width={w - 14} height={h - 14} rx={5} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="6 5" />
    </g>
  );
}

export function Chair({ cx, cy, color = '#3b4458' }: { cx: number; cy: number; color?: string }) {
  return (
    <g>
      <circle cx={cx + 2} cy={cy + 3} r={11} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={11} fill={color} />
      <circle cx={cx} cy={cy} r={7} fill="#fff" opacity={0.12} />
    </g>
  );
}

export function Desk({
  cx,
  cy,
  w = 100,
  h = 50,
  back = -1,
  screen = '#7fd1ff',
  monitors = 1,
  chair = true,
  chairColor,
}: {
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  back?: Dir;
  screen?: string;
  monitors?: number;
  chair?: boolean;
  chairColor?: string;
}) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const my = cy + back * (h / 2 - 10);
  return (
    <g>
      {chair && <Chair cx={cx} cy={cy - back * (h / 2 + 14)} color={chairColor} />}
      <Shadow x={x} y={y} w={w} h={h} />
      <rect x={x} y={y} width={w} height={h} rx={6} fill={WOOD} stroke={WOOD_DARK} strokeWidth={2} />
      {Array.from({ length: monitors }, (_, i) => {
        const mx = cx + (i - (monitors - 1) / 2) * 36;
        return (
          <g key={i}>
            <rect x={mx - 16} y={my - 5} width={32} height={10} rx={2} fill="#1d2433" />
            <rect x={mx - 14} y={my - 3} width={28} height={6} rx={1} fill={screen} className="screen-glow" />
          </g>
        );
      })}
      <rect x={cx - 15} y={cy - back * 6 - 4} width={30} height={8} rx={2} fill="#dfe4ee" />
      <circle cx={x + w - 14} cy={cy - back * 5} r={5} fill="#f4f4f4" stroke="#c9c9c9" />
      <circle cx={x + w - 14} cy={cy - back * 5} r={3} fill="#6b3f22" />
    </g>
  );
}

export function Plant({ cx, cy, r = 14 }: { cx: number; cy: number; r?: number }) {
  return (
    <g className="plant">
      <circle cx={cx + 2} cy={cy + 3} r={r} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={r * 0.7} fill="#a0573a" />
      {[0, 72, 144, 216, 288].map((a) => {
        const rad = (a * Math.PI) / 180;
        return <circle key={a} cx={cx + Math.cos(rad) * r * 0.45} cy={cy + Math.sin(rad) * r * 0.45} r={r * 0.55} fill="#3fae5a" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="#5fd07a" />
    </g>
  );
}

export function Bookshelf({ cx, cy, w, h, seed = 1 }: { cx: number; cy: number; w: number; h: number; seed?: number }) {
  const rnd = seeded(seed);
  const colors = ['#e05d5d', '#4f8ef7', '#f5b83d', '#34c47c', '#a874f7', '#f2f2f2', '#22c3c9'];
  const horizontal = w >= h;
  const len = horizontal ? w - 8 : h - 8;
  const books: ReactNode[] = [];
  let p = 0;
  let i = 0;
  while (p < len - 4) {
    const t = 4 + rnd() * 5;
    const col = colors[Math.floor(rnd() * colors.length)];
    const depth = (horizontal ? h : w) - 8 - rnd() * 4;
    books.push(
      horizontal ? (
        <rect key={i} x={cx - w / 2 + 4 + p} y={cy - h / 2 + 4} width={t - 1} height={depth} fill={col} rx={1} />
      ) : (
        <rect key={i} x={cx - w / 2 + 4} y={cy - h / 2 + 4 + p} width={depth} height={t - 1} fill={col} rx={1} />
      ),
    );
    p += t;
    i++;
    if (rnd() < 0.08) p += 8;
  }
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill="#6b4a2f" />
      {books}
    </g>
  );
}

export function Cabinet({ cx, cy, w = 40, h = 30 }: { cx: number; cy: number; w?: number; h?: number }) {
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill="#8c96a8" stroke="#6d7688" strokeWidth={2} />
      <line x1={cx - w / 2 + 4} x2={cx + w / 2 - 4} y1={cy} y2={cy} stroke="#6d7688" strokeWidth={2} />
      <rect x={cx - 6} y={cy - h / 4 - 2} width={12} height={3} rx={1} fill="#dfe4ee" />
      <rect x={cx - 6} y={cy + h / 4 - 1} width={12} height={3} rx={1} fill="#dfe4ee" />
    </g>
  );
}

export function ServerRack({ cx, cy, w = 32, h = 56, seed = 1 }: { cx: number; cy: number; w?: number; h?: number; seed?: number }) {
  const rnd = seeded(seed);
  const rows = Math.floor((h - 8) / 8);
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill="#1b2130" stroke="#3a4560" strokeWidth={2} />
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <rect x={cx - w / 2 + 4} y={cy - h / 2 + 5 + r * 8} width={w - 8} height={5} rx={1} fill="#2b3348" />
          {[0, 1, 2].map((k) => (
            <circle
              key={k}
              cx={cx - w / 2 + 8 + k * 5}
              cy={cy - h / 2 + 7.5 + r * 8}
              r={1.4}
              fill={rnd() > 0.3 ? '#3dff8c' : '#ffb03d'}
              className="led"
              style={{ animationDelay: `${(rnd() * 2).toFixed(2)}s`, animationDuration: `${(0.6 + rnd() * 1.6).toFixed(2)}s` }}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/** Nástěnná tabule (whiteboard / plakát) – rámeček, obsah se vkládá jako children. */
export function Board({ cx, cy, w, h, fill = '#f4f6fb', frame = '#56607a', children }: { cx: number; cy: number; w: number; h: number; fill?: string; frame?: string; children?: ReactNode }) {
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill={fill} stroke={frame} strokeWidth={3} />
      {children}
    </g>
  );
}

export function WallCalendar({ cx, cy, w, h, accent }: { cx: number; cy: number; w: number; h: number; accent: string }) {
  const cols = 7;
  const rows = 4;
  const x0 = cx - w / 2 + 6;
  const y0 = cy - h / 2 + 14;
  const cw = (w - 12) / cols;
  const ch = (h - 18) / rows;
  const today = new Date().getDate() % (cols * rows);
  return (
    <Board cx={cx} cy={cy} w={w} h={h}>
      <rect x={cx - w / 2 + 2} y={cy - h / 2 + 2} width={w - 4} height={9} fill={accent} />
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const special = i === today ? accent : [3, 9, 17, 22].includes(i) ? '#ffd9c2' : '#e3e7f0';
        return <rect key={i} x={x0 + c * cw + 1} y={y0 + r * ch + 1} width={cw - 2} height={ch - 2} rx={1} fill={special} />;
      })}
    </Board>
  );
}

export function WallClock({ cx, cy, r = 18, time }: { cx: number; cy: number; r?: number; time: Date }) {
  const h = time.getHours() % 12;
  const m = time.getMinutes();
  const s = time.getSeconds();
  const ha = ((h + m / 60) / 12) * 360;
  const ma = ((m + s / 60) / 60) * 360;
  const sa = (s / 60) * 360;
  const hand = (angle: number, len: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x2: cx + Math.cos(rad) * len, y2: cy + Math.sin(rad) * len };
  };
  return (
    <g>
      <circle cx={cx + 2} cy={cy + 3} r={r} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#3b4458" strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => {
        const rad = (i * 30 * Math.PI) / 180;
        return <circle key={i} cx={cx + Math.cos(rad) * (r - 4)} cy={cy + Math.sin(rad) * (r - 4)} r={1} fill="#3b4458" />;
      })}
      <line x1={cx} y1={cy} {...hand(ha, r * 0.5)} stroke="#1d2433" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx} y1={cy} {...hand(ma, r * 0.75)} stroke="#1d2433" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={cx} y1={cy} {...hand(sa, r * 0.8)} stroke="#e05d5d" strokeWidth={1} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2} fill="#e05d5d" />
    </g>
  );
}

export function RoundTable({ cx, cy, r = 32, chairs = 4 }: { cx: number; cy: number; r?: number; chairs?: number }) {
  return (
    <g>
      {Array.from({ length: chairs }, (_, i) => {
        const a = (i / chairs) * Math.PI * 2 + Math.PI / 4;
        return <Chair key={i} cx={cx + Math.cos(a) * (r + 12)} cy={cy + Math.sin(a) * (r + 12)} />;
      })}
      <circle cx={cx + 3} cy={cy + 4} r={r} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={r} fill={WOOD} stroke={WOOD_DARK} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke={WOOD_DARK} strokeOpacity={0.35} />
    </g>
  );
}

export function Pigeonholes({ cx, cy, w, h, seed = 3 }: { cx: number; cy: number; w: number; h: number; seed?: number }) {
  const rnd = seeded(seed);
  const cols = Math.floor(w / 18);
  const rows = 2;
  const cw = (w - 6) / cols;
  const ch = (h - 6) / rows;
  const env = ['#ffffff', '#ffe8a3', '#cfe3ff', '#ffd1dc'];
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill="#7a5638" />
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = cx - w / 2 + 3 + c * cw;
        const y = cy - h / 2 + 3 + r * ch;
        const has = rnd() > 0.35;
        return (
          <g key={i}>
            <rect x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} fill="#4e3624" />
            {has && <rect x={x + 3} y={y + 3} width={cw - 6} height={ch - 7} rx={1} fill={env[Math.floor(rnd() * env.length)]} />}
          </g>
        );
      })}
    </g>
  );
}

/** Pásový dopravník s putujícími obálkami. */
export function Conveyor({ cx, cy, w, h = 22, id }: { cx: number; cy: number; w: number; h?: number; id: string }) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return (
    <g>
      <defs>
        <clipPath id={`conv-${id}`}>
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} />
        </clipPath>
      </defs>
      <Shadow x={x} y={y} w={w} h={h} rx={4} />
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#3a4152" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} fill="#22262f" />
      <g clipPath={`url(#conv-${id})`}>
        <g className="conveyor-belt" style={{ ['--belt' as string]: `${w}px` }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i} transform={`translate(${x - w + i * (w / 3)}, ${cy - 5})`}>
              <rect width={16} height={10} rx={1} fill={i % 2 ? '#ffe8a3' : '#fff'} />
              <path d="M0 0 L8 6 L16 0" fill="none" stroke="#b4b9c6" strokeWidth={1} />
            </g>
          ))}
        </g>
      </g>
    </g>
  );
}

export function MailBag({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <ellipse cx={cx + 3} cy={cy + 4} rx={18} ry={14} fill={SHADOW} />
      <ellipse cx={cx} cy={cy} rx={18} ry={14} fill="#a87b4f" />
      <ellipse cx={cx} cy={cy - 4} rx={10} ry={5} fill="#7d5835" />
      <rect x={cx - 7} y={cy - 9} width={14} height={8} rx={1} fill="#fff" transform={`rotate(-12 ${cx} ${cy})`} />
      <rect x={cx - 3} y={cy - 11} width={14} height={8} rx={1} fill="#ffe8a3" transform={`rotate(10 ${cx} ${cy})`} />
    </g>
  );
}

export function Safe({ cx, cy, s = 44 }: { cx: number; cy: number; s?: number }) {
  return (
    <g>
      <Shadow x={cx - s / 2} y={cy - s / 2} w={s} h={s} rx={4} />
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={4} fill="#4a5163" stroke="#2c3140" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={s * 0.25} fill="#2c3140" stroke="#9aa3b5" strokeWidth={2} />
      <line x1={cx} y1={cy} x2={cx + s * 0.18} y2={cy - s * 0.1} stroke="#f5b83d" strokeWidth={2} strokeLinecap="round" />
      <rect x={cx + s / 2 - 8} y={cy - 8} width={4} height={16} rx={1} fill="#9aa3b5" />
    </g>
  );
}

export function Coins({ cx, cy }: { cx: number; cy: number }) {
  const stacks = [
    { dx: 0, n: 5 },
    { dx: 13, n: 3 },
    { dx: -11, n: 4 },
  ];
  return (
    <g>
      {stacks.map((s, i) => (
        <g key={i}>
          {Array.from({ length: s.n }, (_, k) => (
            <ellipse key={k} cx={cx + s.dx} cy={cy + (i === 1 ? 6 : 0) - k * 2.5} rx={6} ry={3} fill="#f5c84d" stroke="#c99a1d" strokeWidth={0.8} />
          ))}
        </g>
      ))}
    </g>
  );
}

export function BarChart({ cx, cy, w, h, color }: { cx: number; cy: number; w: number; h: number; color: string }) {
  const vals = [0.35, 0.5, 0.42, 0.68, 0.6, 0.82];
  const bw = (w - 20) / vals.length;
  return (
    <Board cx={cx} cy={cy} w={w} h={h}>
      {vals.map((v, i) => (
        <rect key={i} x={cx - w / 2 + 10 + i * bw + 2} y={cy + h / 2 - 6 - v * (h - 14)} width={bw - 4} height={v * (h - 14)} rx={1} fill={color} opacity={0.6 + i * 0.07} />
      ))}
      <polyline
        points={vals.map((v, i) => `${cx - w / 2 + 10 + i * bw + bw / 2},${cy + h / 2 - 10 - v * (h - 14)}`).join(' ')}
        fill="none"
        stroke="#e05d5d"
        strokeWidth={1.5}
      />
    </Board>
  );
}

export function Globe({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx + 2} cy={cy + 3} r={14} fill={SHADOW} />
      <circle cx={cx} cy={cy} r={14} fill="#4f8ef7" stroke={WOOD_DARK} strokeWidth={3} />
      <path d={`M${cx - 8} ${cy - 6} q5 -4 8 1 t6 3 q-2 6 -7 4 t-7 -8z`} fill="#3fae5a" />
      <path d={`M${cx + 2} ${cy + 5} q4 -1 6 3 q-3 4 -6 2z`} fill="#3fae5a" />
    </g>
  );
}

export function Armchair({ cx, cy, color = '#a874f7' }: { cx: number; cy: number; color?: string }) {
  return (
    <g>
      <rect x={cx - 20 + 3} y={cy - 18 + 4} width={40} height={36} rx={10} fill={SHADOW} />
      <rect x={cx - 20} y={cy - 18} width={40} height={36} rx={10} fill={color} />
      <rect x={cx - 13} y={cy - 8} width={26} height={22} rx={6} fill="#fff" opacity={0.18} />
    </g>
  );
}

export function FloorLamp({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={34} fill="url(#lampGlow)" className="lamp-glow" />
      <circle cx={cx} cy={cy} r={10} fill="#fff4c9" stroke="#d8c27a" strokeWidth={2} />
    </g>
  );
}

export function Workbench({ cx, cy, w, h }: { cx: number; cy: number; w: number; h: number }) {
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={3} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} fill="#7a8396" stroke="#555d6f" strokeWidth={2} />
      {/* klíč */}
      <g transform={`translate(${cx - w / 2 + 22}, ${cy}) rotate(-30)`}>
        <rect x={-12} y={-2} width={24} height={4} rx={2} fill="#d3d8e2" />
        <circle cx={12} cy={0} r={5} fill="#d3d8e2" />
        <circle cx={14} cy={0} r={2.5} fill="#7a8396" />
      </g>
      {/* šroubovák */}
      <g transform={`translate(${cx}, ${cy - 3}) rotate(15)`}>
        <rect x={-14} y={-3} width={12} height={6} rx={2} fill="#e05d5d" />
        <rect x={-2} y={-1} width={16} height={2} fill="#d3d8e2" />
      </g>
      {/* krabička se součástkami */}
      <rect x={cx + w / 2 - 38} y={cy - h / 2 + 6} width={28} height={h - 12} rx={2} fill="#22c3c9" opacity={0.85} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={cx + w / 2 - 31 + i * 7} cy={cy} r={2} fill="#fff" />
      ))}
    </g>
  );
}

export function Sofa({ cx, cy, w = 90, color = '#4f5d7a', vertical = false }: { cx: number; cy: number; w?: number; color?: string; vertical?: boolean }) {
  const W = vertical ? 34 : w;
  const H = vertical ? w : 34;
  return (
    <g>
      <rect x={cx - W / 2 + 3} y={cy - H / 2 + 4} width={W} height={H} rx={10} fill={SHADOW} />
      <rect x={cx - W / 2} y={cy - H / 2} width={W} height={H} rx={10} fill={color} />
      {vertical ? (
        <>
          <rect x={cx - W / 2 + 8} y={cy - H / 2 + 6} width={W - 12} height={H / 2 - 8} rx={6} fill="#fff" opacity={0.14} />
          <rect x={cx - W / 2 + 8} y={cy + 2} width={W - 12} height={H / 2 - 8} rx={6} fill="#fff" opacity={0.14} />
        </>
      ) : (
        <>
          <rect x={cx - W / 2 + 6} y={cy - H / 2 + 8} width={W / 2 - 8} height={H - 12} rx={6} fill="#fff" opacity={0.14} />
          <rect x={cx + 2} y={cy - H / 2 + 8} width={W / 2 - 8} height={H - 12} rx={6} fill="#fff" opacity={0.14} />
        </>
      )}
    </g>
  );
}

export function CoffeeMachine({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <Shadow x={cx - 16} y={cy - 14} w={32} h={28} rx={4} />
      <rect x={cx - 16} y={cy - 14} width={32} height={28} rx={4} fill="#2c3140" stroke="#151922" strokeWidth={2} />
      <circle cx={cx - 6} cy={cy - 4} r={3} fill="#e05d5d" />
      <circle cx={cx + 4} cy={cy - 4} r={3} fill="#3dff8c" className="led" />
      <rect x={cx - 6} y={cy + 3} width={12} height={7} rx={2} fill="#f4f4f4" />
      <g className="steam">
        <path d={`M${cx - 3} ${cy - 18} q3 -5 0 -10 q-3 -5 0 -10`} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
        <path d={`M${cx + 4} ${cy - 18} q3 -5 0 -10 q-3 -5 0 -10`} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  );
}

export function SmallTable({ cx, cy, w = 50, h = 34 }: { cx: number; cy: number; w?: number; h?: number }) {
  return (
    <g>
      <Shadow x={cx - w / 2} y={cy - h / 2} w={w} h={h} rx={5} />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={5} fill={WOOD} stroke={WOOD_DARK} strokeWidth={2} />
    </g>
  );
}
