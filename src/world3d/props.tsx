/**
 * Jednoduchý 3D nábytek z kvádrů a válců. Souřadnice = střed spodní hrany na podlaze,
 * pokud není uvedeno jinak. Box stojí zády (z = -2.5) ke zdi, otevřený je směrem +z.
 */
import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three';

type V3 = [number, number, number];

export const WOOD = '#b98a5a';
export const WOOD_DARK = '#7a5638';
export const METAL = '#8c96a8';
export const DARK = '#1d2433';

/** Kvádr se středem v p. */
export function B({ p, s, c, e, ei = 1, o }: { p: V3; s: V3; c: string; e?: string; ei?: number; o?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} transparent={o !== undefined} opacity={o ?? 1} roughness={0.8} />
    </mesh>
  );
}

/** Válec se středem v p. */
export function C({ p, r, h, c, seg = 20, e, ei = 1 }: { p: V3; r: number | [number, number]; h: number; c: string; seg?: number; e?: string; ei?: number }) {
  const [rt, rb] = Array.isArray(r) ? r : [r, r];
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} roughness={0.7} />
    </mesh>
  );
}

export function S({ p, r, c, e, ei = 1 }: { p: V3; r: number; c: string; e?: string; ei?: number }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 16, 12]} />
      <meshStandardMaterial color={c} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} roughness={0.6} />
    </mesh>
  );
}

export function G({ p = [0, 0, 0], r = 0, children }: { p?: V3; r?: number; children: ReactNode }) {
  return (
    <group position={p} rotation={[0, r, 0]}>
      {children}
    </group>
  );
}

/** Stůl s monitory. Monitory jsou na zadní straně (-z), židle vpředu. */
export function Desk({ p, r = 0, w = 1.4, screen = '#7fd1ff', monitors = 1, chair = true }: { p: V3; r?: number; w?: number; screen?: string; monitors?: number; chair?: boolean }) {
  return (
    <G p={p} r={r}>
      <B p={[0, 0.74, 0]} s={[w, 0.06, 0.7]} c={WOOD} />
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[sx * (w / 2 - 0.06), 0.37, sz * 0.28]} s={[0.06, 0.74, 0.06]} c={WOOD_DARK} />))}
      {Array.from({ length: monitors }, (_, i) => {
        const x = (i - (monitors - 1) / 2) * 0.55;
        return (
          <G key={i} p={[x, 0.77, -0.2]}>
            <B p={[0, 0.05, 0]} s={[0.18, 0.02, 0.12]} c={DARK} />
            <B p={[0, 0.2, 0]} s={[0.04, 0.3, 0.04]} c={DARK} />
            <B p={[0, 0.38, 0]} s={[0.5, 0.3, 0.03]} c={DARK} />
            <B p={[0, 0.38, 0.024]} s={[0.46, 0.26, 0.006]} c={screen} e={screen} ei={0.9} />
          </G>
        );
      })}
      <B p={[0, 0.78, 0.12]} s={[0.42, 0.02, 0.14]} c="#dfe4ee" />
      <C p={[w / 2 - 0.15, 0.82, 0.12]} r={0.04} h={0.1} c="#f4f4f4" />
      {chair && <Chair p={[0, 0, 0.6]} />}
    </G>
  );
}

export function Chair({ p, r = 0, c = '#3b4458' }: { p: V3; r?: number; c?: string }) {
  return (
    <G p={p} r={r}>
      <C p={[0, 0.2, 0]} r={0.04} h={0.4} c={DARK} seg={8} />
      <B p={[0, 0.45, 0]} s={[0.45, 0.08, 0.45]} c={c} />
      <B p={[0, 0.75, 0.2]} s={[0.45, 0.5, 0.07]} c={c} />
    </G>
  );
}

/** Postel – „bydlení“ robota. Hlavou ke zdi (-z). */
export function Bed({ p, r = 0, color }: { p: V3; r?: number; color: string }) {
  return (
    <G p={p} r={r}>
      <B p={[0, 0.17, 0]} s={[1.1, 0.34, 2.0]} c={WOOD_DARK} />
      <B p={[0, 0.4, 0.05]} s={[1.0, 0.14, 1.85]} c="#f2f4f8" />
      <B p={[0, 0.49, 0.35]} s={[1.04, 0.06, 1.2]} c={color} />
      <B p={[0, 0.52, -0.7]} s={[0.7, 0.1, 0.3]} c="#ffffff" />
      <B p={[0, 0.55, -1.0]} s={[1.1, 0.75, 0.08]} c={WOOD_DARK} />
    </G>
  );
}

export function Nightstand({ p, lampOn }: { p: V3; lampOn: boolean }) {
  return (
    <G p={p}>
      <B p={[0, 0.25, 0]} s={[0.45, 0.5, 0.4]} c={WOOD} />
      <C p={[0, 0.6, 0]} r={0.03} h={0.2} c={DARK} seg={8} />
      <C p={[0, 0.76, 0]} r={[0.08, 0.13]} h={0.14} c="#fff4c9" e="#ffd77a" ei={lampOn ? 1.4 : 0.05} />
    </G>
  );
}

export function Plant({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <G p={p}>
      <C p={[0, 0.18 * s, 0]} r={[0.16 * s, 0.12 * s]} h={0.36 * s} c="#a0573a" />
      <S p={[0, 0.55 * s, 0]} r={0.26 * s} c="#3fae5a" />
      <S p={[0.12 * s, 0.72 * s, 0.05 * s]} r={0.18 * s} c="#5fd07a" />
      <S p={[-0.1 * s, 0.68 * s, -0.08 * s]} r={0.16 * s} c="#4bbf68" />
    </G>
  );
}

export function Rug({ p, w, d, color }: { p: V3; w: number; d: number; color: string }) {
  return (
    <mesh position={[p[0], 0.065, p[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={'#' + new Color(color).multiplyScalar(0.75).getHexString()} roughness={1} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

const BOOK_COLORS = ['#e05d5d', '#4f8ef7', '#f5b83d', '#34c47c', '#a874f7', '#f2f2f2', '#22c3c9'];

export function Bookshelf({ p, r = 0, w = 1.6, h = 1.8, seed = 1 }: { p: V3; r?: number; w?: number; h?: number; seed?: number }) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const shelves = Math.round(h / 0.45);
  const books: ReactNode[] = [];
  for (let k = 0; k < shelves; k++) {
    let x = -w / 2 + 0.06;
    let i = 0;
    while (x < w / 2 - 0.1) {
      const t = 0.05 + rnd() * 0.05;
      const bh = 0.24 + rnd() * 0.12;
      books.push(<B key={`${k}-${i}`} p={[x + t / 2, 0.05 + k * (h / shelves) + bh / 2, 0.02]} s={[t - 0.008, bh, 0.24]} c={BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]} />);
      x += t + (rnd() < 0.08 ? 0.12 : 0);
      i++;
    }
  }
  return (
    <G p={p} r={r}>
      <B p={[0, h / 2, -0.02]} s={[w, h, 0.34]} c="#5b3f28" />
      {Array.from({ length: shelves }, (_, k) => (
        <B key={k} p={[0, 0.03 + k * (h / shelves), 0.03]} s={[w - 0.04, 0.03, 0.3]} c="#7a5638" />
      ))}
      {books}
    </G>
  );
}

/** Deska na zdi (whiteboard, graf, kalendář). Obsah se kreslí do vrstvy těsně před deskou. */
export function WallBoard({ p, w, h, children, frame = '#56607a' }: { p: V3; w: number; h: number; children?: ReactNode; frame?: string }) {
  return (
    <G p={p}>
      <B p={[0, 0, 0]} s={[w + 0.08, h + 0.08, 0.04]} c={frame} />
      <B p={[0, 0, 0.035]} s={[w, h, 0.01]} c="#f4f6fb" />
      <group position={[0, 0, 0.05]}>{children}</group>
    </G>
  );
}

export function CalendarBoard({ p, accent }: { p: V3; accent: string }) {
  const today = new Date().getDate() % 28;
  return (
    <WallBoard p={p} w={1.8} h={1.1}>
      <B p={[0, 0.46, 0]} s={[1.8, 0.16, 0.01]} c={accent} />
      {Array.from({ length: 28 }, (_, i) => {
        const c = i % 7;
        const r = Math.floor(i / 7);
        const col = i === today ? accent : [3, 9, 17, 22].includes(i) ? '#ffd9c2' : '#dfe4ee';
        return <B key={i} p={[-0.78 + c * 0.26, 0.24 - r * 0.21, 0]} s={[0.22, 0.17, 0.01]} c={col} />;
      })}
    </WallBoard>
  );
}

export function WallClock({ p, time }: { p: V3; time: Date }) {
  const h = (time.getHours() % 12) + time.getMinutes() / 60;
  const m = time.getMinutes() + time.getSeconds() / 60;
  return (
    <G p={p}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.05, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <group rotation={[0, 0, -(h / 12) * Math.PI * 2]} position={[0, 0, 0.035]}>
        <B p={[0, 0.09, 0]} s={[0.04, 0.18, 0.01]} c={DARK} />
      </group>
      <group rotation={[0, 0, -(m / 60) * Math.PI * 2]} position={[0, 0, 0.04]}>
        <B p={[0, 0.12, 0]} s={[0.025, 0.25, 0.01]} c="#e05d5d" />
      </group>
    </G>
  );
}

export function BarChartBoard({ p, color }: { p: V3; color: string }) {
  const vals = [0.35, 0.5, 0.42, 0.68, 0.6, 0.85];
  return (
    <WallBoard p={p} w={1.6} h={0.9}>
      {vals.map((v, i) => (
        <B key={i} p={[-0.62 + i * 0.25, -0.38 + (v * 0.75) / 2, 0]} s={[0.17, v * 0.75, 0.01]} c={color} />
      ))}
    </WallBoard>
  );
}

export function Cabinet({ p, r = 0, h = 1.0 }: { p: V3; r?: number; h?: number }) {
  return (
    <G p={p} r={r}>
      <B p={[0, h / 2, 0]} s={[0.5, h, 0.5]} c={METAL} />
      {Array.from({ length: Math.round(h / 0.33) }, (_, i) => (
        <B key={i} p={[0, 0.17 + i * 0.33, 0.255]} s={[0.18, 0.04, 0.01]} c="#dfe4ee" />
      ))}
    </G>
  );
}

export function Safe({ p, r = 0 }: { p: V3; r?: number }) {
  const dial = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (dial.current) dial.current.rotation.z += dt * 0.6;
  });
  return (
    <G p={p} r={r}>
      <B p={[0, 0.45, 0]} s={[0.8, 0.9, 0.7]} c="#4a5163" />
      <mesh ref={dial} position={[0, 0.5, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.04, 6]} />
        <meshStandardMaterial color="#f5b83d" metalness={0.6} roughness={0.3} />
      </mesh>
      <B p={[0.3, 0.45, 0.36]} s={[0.04, 0.3, 0.03]} c="#9aa3b5" />
    </G>
  );
}

export function Coins({ p }: { p: V3 }) {
  return (
    <G p={p}>
      {[
        [0, 5],
        [0.11, 3],
        [-0.1, 4],
      ].map(([x, n], i) =>
        Array.from({ length: n }, (_, k) => <C key={`${i}-${k}`} p={[x, 0.012 + k * 0.022, i === 1 ? 0.06 : 0]} r={0.05} h={0.02} c="#f5c84d" seg={14} />),
      )}
    </G>
  );
}

export function ServerRack({ p, r = 0, seed = 1 }: { p: V3; r?: number; seed?: number }) {
  const leds = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!leds.current) return;
    leds.current.children.forEach((c, i) => {
      c.visible = Math.sin(clock.elapsedTime * (2 + ((i * 7 + seed) % 5)) + i) > -0.3;
    });
  });
  return (
    <G p={p} r={r}>
      <B p={[0, 0.95, 0]} s={[0.6, 1.9, 0.6]} c="#1b2130" />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} p={[0, 0.3 + i * 0.2, 0.31]} s={[0.5, 0.14, 0.02]} c="#2b3348" />
      ))}
      <group ref={leds}>
        {Array.from({ length: 16 }, (_, i) => (
          <B key={i} p={[-0.18 + (i % 2) * 0.07, 0.3 + Math.floor(i / 2) * 0.2, 0.33]} s={[0.03, 0.03, 0.02]} c="#3dff8c" e={(i + seed) % 5 === 0 ? '#ffb03d' : '#3dff8c'} ei={2} />
        ))}
      </group>
    </G>
  );
}

export function Workbench({ p, r = 0 }: { p: V3; r?: number }) {
  return (
    <G p={p} r={r}>
      <B p={[0, 0.85, 0]} s={[1.6, 0.08, 0.7]} c="#7a8396" />
      {[-0.72, 0.72].map((x) => (
        <B key={x} p={[x, 0.42, 0]} s={[0.08, 0.84, 0.6]} c="#555d6f" />
      ))}
      <B p={[-0.3, 0.92, 0]} s={[0.4, 0.05, 0.06]} c="#d3d8e2" />
      <B p={[0.1, 0.92, 0.1]} s={[0.12, 0.06, 0.06]} c="#e05d5d" />
      <B p={[0.5, 0.97, -0.1]} s={[0.4, 0.16, 0.3]} c="#22c3c9" />
      <B p={[0, 1.4, -0.33]} s={[1.5, 0.9, 0.04]} c="#4b5263" />
    </G>
  );
}

export function Globe({ p }: { p: V3 }) {
  const g = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.4;
  });
  return (
    <G p={p}>
      <C p={[0, 0.03, 0]} r={0.1} h={0.05} c={WOOD_DARK} />
      <C p={[0, 0.12, 0]} r={0.015} h={0.16} c={WOOD_DARK} seg={6} />
      <mesh ref={g} position={[0, 0.3, 0]} castShadow>
        <sphereGeometry args={[0.16, 18, 14]} />
        <meshStandardMaterial color="#4f8ef7" roughness={0.5} />
      </mesh>
    </G>
  );
}

export function Armchair({ p, r = 0, color }: { p: V3; r?: number; color: string }) {
  return (
    <G p={p} r={r}>
      <B p={[0, 0.22, 0]} s={[0.8, 0.44, 0.8]} c={color} />
      <B p={[0, 0.6, -0.32]} s={[0.8, 0.5, 0.16]} c={color} />
      {[-0.36, 0.36].map((x) => (
        <B key={x} p={[x, 0.5, 0]} s={[0.12, 0.25, 0.8]} c={color} />
      ))}
    </G>
  );
}

export function FloorLamp({ p, on }: { p: V3; on: boolean }) {
  return (
    <G p={p}>
      <C p={[0, 0.02, 0]} r={0.15} h={0.04} c={DARK} />
      <C p={[0, 0.75, 0]} r={0.02} h={1.5} c={DARK} seg={8} />
      <C p={[0, 1.55, 0]} r={[0.14, 0.24]} h={0.25} c="#fff4c9" e="#ffd77a" ei={on ? 1.6 : 0.1} />
    </G>
  );
}

export function Pigeonholes({ p, w = 2.2, seed = 3 }: { p: V3; w?: number; seed?: number }) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cols = 7;
  const rows = 3;
  const cw = w / cols;
  const env = ['#ffffff', '#ffe8a3', '#cfe3ff', '#ffd1dc'];
  return (
    <G p={p}>
      <B p={[0, 0.6, 0]} s={[w, 1.2, 0.4]} c="#7a5638" />
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = -w / 2 + cw / 2 + c * cw;
        const y = 0.22 + r * 0.38;
        return (
          <group key={i}>
            <B p={[x, y, 0.1]} s={[cw - 0.05, 0.3, 0.22]} c="#4e3624" />
            {rnd() > 0.35 && <B p={[x, y - 0.04, 0.16]} s={[cw - 0.12, 0.2, 0.04]} c={env[Math.floor(rnd() * env.length)]} />}
          </group>
        );
      })}
    </G>
  );
}

export function MailBag({ p }: { p: V3 }) {
  return (
    <G p={p}>
      <S p={[0, 0.28, 0]} r={0.32} c="#a87b4f" />
      <B p={[-0.05, 0.6, 0]} s={[0.26, 0.18, 0.03]} c="#ffffff" />
      <B p={[0.08, 0.62, 0.05]} s={[0.26, 0.18, 0.03]} c="#ffe8a3" />
    </G>
  );
}

export function RoundTable({ p, color }: { p: V3; color?: string }) {
  return (
    <G p={p}>
      <C p={[0, 0.72, 0]} r={0.55} h={0.05} c={color ?? WOOD} seg={28} />
      <C p={[0, 0.36, 0]} r={0.06} h={0.72} c={WOOD_DARK} seg={10} />
      <C p={[0, 0.02, 0]} r={0.3} h={0.04} c={WOOD_DARK} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return <Chair key={i} p={[Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85]} r={a + Math.PI} />;
      })}
    </G>
  );
}

export function Sofa({ p, r = 0, w = 1.8, color }: { p: V3; r?: number; w?: number; color: string }) {
  return (
    <G p={p} r={r}>
      <B p={[0, 0.22, 0]} s={[w, 0.44, 0.8]} c={color} />
      <B p={[0, 0.6, -0.32]} s={[w, 0.45, 0.16]} c={color} />
      {[-1, 1].map((sx) => (
        <B key={sx} p={[sx * (w / 2 - 0.06), 0.48, 0]} s={[0.12, 0.22, 0.8]} c={color} />
      ))}
      <B p={[-w / 4, 0.48, 0.02]} s={[w / 2 - 0.2, 0.08, 0.6]} c="#ffffff" o={0.15} />
    </G>
  );
}

export function CoffeeMachine({ p }: { p: V3 }) {
  return (
    <G p={p}>
      <B p={[0, 0.22, 0]} s={[0.32, 0.44, 0.3]} c="#2c3140" />
      <B p={[0, 0.12, 0.12]} s={[0.12, 0.1, 0.08]} c="#f4f4f4" />
      <B p={[0.08, 0.36, 0.152]} s={[0.04, 0.04, 0.01]} c="#3dff8c" e="#3dff8c" ei={2} />
    </G>
  );
}

export function MovingBoxes({ p }: { p: V3 }) {
  return (
    <G p={p}>
      <B p={[0, 0.3, 0]} s={[0.7, 0.6, 0.6]} c="#b58b5c" />
      <B p={[0, 0.3, 0.31]} s={[0.12, 0.6, 0.02]} c="#e8d3a8" />
      <B p={[0.75, 0.22, 0.1]} s={[0.55, 0.44, 0.5]} c="#a87d50" />
      <B p={[0.1, 0.78, 0.02]} s={[0.5, 0.36, 0.45]} c="#c29766" />
    </G>
  );
}

// ---------------------------------------------------------------- redakce (Echo)

/** Stěna televizí – každá obrazovka pomalu mění barvu, jako by běželo zpravodajství. */
export function TvWall({ p, cols = 3, rows = 2, colors }: { p: V3; cols?: number; rows?: number; colors: string[] }) {
  const screens = useRef<Group>(null);
  useFrame(({ clock }) => {
    screens.current?.children.forEach((m, i) => {
      const mat = (m as Mesh).material as MeshStandardMaterial;
      mat.emissiveIntensity = 0.55 + 0.35 * Math.sin(clock.elapsedTime * (0.7 + i * 0.23) + i);
    });
  });
  const w = 0.62;
  const h = 0.4;
  return (
    <G p={p}>
      <B p={[0, 0, 0]} s={[cols * (w + 0.06) + 0.06, rows * (h + 0.06) + 0.06, 0.06]} c="#151922" />
      <group ref={screens}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const col = colors[i % colors.length];
          return (
            <mesh key={i} position={[(c - (cols - 1) / 2) * (w + 0.06), ((rows - 1) / 2 - r) * (h + 0.06), 0.04]}>
              <boxGeometry args={[w, h, 0.02]} />
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.8} />
            </mesh>
          );
        })}
      </group>
    </G>
  );
}

/** Svítící pás s běžícími „písmenky“ (zpravodajský ticker). */
export function LedTicker({ p, w = 5.6, color = '#ff5a5f' }: { p: V3; w?: number; color?: string }) {
  const dots = useRef<Group>(null);
  const n = 28;
  useFrame(({ clock }) => {
    dots.current?.children.forEach((d, i) => {
      const x = ((((i / n) * w + clock.elapsedTime * 0.6) % w) + w) % w - w / 2;
      d.position.x = x;
      d.scale.x = 0.5 + ((i * 7) % 5) * 0.35;
    });
  });
  return (
    <G p={p}>
      <B p={[0, 0, 0]} s={[w + 0.1, 0.2, 0.06]} c="#0e1117" />
      <group ref={dots} position={[0, 0, 0.04]}>
        {Array.from({ length: n }, (_, i) => (
          <mesh key={i}>
            <boxGeometry args={[0.1, 0.07, 0.02]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
          </mesh>
        ))}
      </group>
    </G>
  );
}

export function Microphone({ p }: { p: V3 }) {
  return (
    <G p={p}>
      <C p={[0, 0.01, 0]} r={0.07} h={0.02} c={DARK} />
      <C p={[0, 0.14, 0]} r={0.012} h={0.26} c="#9aa3b5" seg={6} />
      <S p={[0, 0.3, 0.02]} r={0.05} c="#2c3140" />
    </G>
  );
}

export function Newspapers({ p, r = 0 }: { p: V3; r?: number }) {
  return (
    <G p={p} r={r}>
      {Array.from({ length: 6 }, (_, i) => (
        <B key={i} p={[(i % 2) * 0.03, 0.025 + i * 0.04, (i % 3) * 0.02]} s={[0.5, 0.035, 0.36]} c={i % 2 ? '#f2efe6' : '#e6e1d3'} />
      ))}
      <B p={[0.03, 0.27, 0.02]} s={[0.36, 0.005, 0.08]} c="#1d2433" />
    </G>
  );
}

/** Meteostanice: stožár, budka s teploměrem a točící se větroměr. */
export function WeatherStation({ p }: { p: V3 }) {
  const cups = useRef<Group>(null);
  useFrame((_, dt) => {
    if (cups.current) cups.current.rotation.y += dt * 3;
  });
  return (
    <G p={p}>
      <C p={[0, 0.05, 0]} r={0.18} h={0.1} c="#9aa3b5" />
      <C p={[0, 0.85, 0]} r={0.03} h={1.6} c="#d3d8e2" seg={8} />
      <B p={[0, 1.05, 0.1]} s={[0.3, 0.32, 0.22]} c="#f4f6fb" />
      <B p={[0, 1.05, 0.215]} s={[0.04, 0.22, 0.01]} c="#e05d5d" e="#e05d5d" ei={0.6} />
      <group ref={cups} position={[0, 1.7, 0]}>
        {[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2;
          return (
            <group key={k} rotation={[0, a, 0]}>
              <B p={[0.14, 0, 0]} s={[0.28, 0.02, 0.02]} c="#9aa3b5" />
              <S p={[0.28, 0, 0]} r={0.05} c="#e8505b" />
            </group>
          );
        })}
      </group>
    </G>
  );
}

// ---------------------------------------------------------------- kino (Klik)

/** Velké plátno na zdi: obraz pomalu mění barvy, uprostřed tlačítko „přehrát“ a běžící lišta. */
export function BigScreen({ p, w = 2.6, h = 1.3, colors }: { p: V3; w?: number; h?: number; colors: string[] }) {
  const screen = useRef<Mesh>(null);
  const bar = useRef<Mesh>(null);
  const tmp = useRef(new Color());
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25;
    const i = Math.floor(t) % colors.length;
    const mix = t - Math.floor(t);
    const mat = screen.current?.material as MeshStandardMaterial | undefined;
    if (mat) {
      tmp.current.set(colors[i]).lerp(new Color(colors[(i + 1) % colors.length]), mix);
      mat.color.copy(tmp.current);
      mat.emissive.copy(tmp.current);
    }
    if (bar.current) bar.current.scale.x = Math.max(0.02, (clock.elapsedTime * 0.05) % 1);
  });
  return (
    <G p={p}>
      <B p={[0, 0, 0]} s={[w + 0.12, h + 0.12, 0.06]} c="#0c0f16" />
      <mesh ref={screen} position={[0, 0, 0.035]}>
        <boxGeometry args={[w, h, 0.01]} />
        <meshStandardMaterial color={colors[0]} emissive={colors[0]} emissiveIntensity={0.55} />
      </mesh>
      {/* tlačítko přehrát */}
      <mesh position={[0, 0.05, 0.045]}>
        <circleGeometry args={[0.2, 28]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0.025, 0.05, 0.05]}>
        <circleGeometry args={[0.11, 3]} />
        <meshStandardMaterial color="#ff2b2b" emissive="#ff2b2b" emissiveIntensity={0.8} />
      </mesh>
      {/* průběh videa */}
      <B p={[0, -h / 2 + 0.1, 0.045]} s={[w - 0.3, 0.025, 0.005]} c="#ffffff" o={0.35} />
      <group position={[-(w - 0.3) / 2, -h / 2 + 0.1, 0.05]}>
        <mesh ref={bar} position={[(w - 0.3) / 2, 0, 0]}>
          <boxGeometry args={[w - 0.3, 0.03, 0.005]} />
          <meshStandardMaterial color="#ff2b2b" emissive="#ff2b2b" emissiveIntensity={1} />
        </mesh>
      </group>
    </G>
  );
}

/** Reprobedna – membrány jemně „pulzují“ do rytmu. */
export function Speaker({ p, r = 0 }: { p: V3; r?: number }) {
  const cones = useRef<Group>(null);
  useFrame(({ clock }) => {
    const beat = 1 + 0.08 * Math.max(0, Math.sin(clock.elapsedTime * 8.4));
    cones.current?.children.forEach((c) => c.scale.setScalar(beat));
  });
  return (
    <G p={p} r={r}>
      <B p={[0, 0.5, 0]} s={[0.42, 1.0, 0.36]} c="#1a1f2b" />
      <group ref={cones}>
        <mesh position={[0, 0.7, 0.185]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 0.02, 20]} />
          <meshStandardMaterial color="#3a4256" />
        </mesh>
        <mesh position={[0, 0.35, 0.185]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.16, 0.02, 24]} />
          <meshStandardMaterial color="#3a4256" />
        </mesh>
      </group>
    </G>
  );
}

/** Kyblík popcornu. */
export function Popcorn({ p }: { p: V3 }) {
  return (
    <G p={p}>
      <C p={[0, 0.09, 0]} r={[0.09, 0.065]} h={0.18} c="#e8505b" seg={12} />
      {[
        [0, 0.2, 0],
        [0.04, 0.21, 0.03],
        [-0.04, 0.2, -0.02],
        [0.02, 0.23, -0.04],
      ].map((q, i) => (
        <S key={i} p={q as V3} r={0.035} c="#fff3c4" />
      ))}
    </G>
  );
}
