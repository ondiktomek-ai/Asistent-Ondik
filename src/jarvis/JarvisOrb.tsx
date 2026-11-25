import { useEffect, useRef } from 'react';

export type OrbState = 'thinking' | 'speaking' | 'listening' | 'idle' | 'error';

const COLORS: Record<OrbState, [number, number, number]> = {
  speaking: [79, 216, 255],
  thinking: [138, 160, 255],
  listening: [110, 255, 196],
  idle: [79, 190, 235],
  error: [255, 120, 110],
};

/**
 * „Reaktor“ Jarvise: jádro, prstence a kruhové spektrum, které reaguje na hlas (level 0–1).
 * Kreslí se do canvasu, barvy se plynule prolínají podle stavu.
 */
export function JarvisOrb({ state, level }: { state: OrbState; level: { level: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      w = r.width;
      h = r.height;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const BARS = 96;
    const bars = new Float32Array(BARS);
    const particles = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.5, s: (Math.random() - 0.5) * 0.25, z: Math.random() }));
    let col = [...COLORS[stateRef.current]];
    let smooth = 0;
    let t = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (reduced ? 0.35 : 1);
      last = now;
      t += dt;
      const st = stateRef.current;
      const target = COLORS[st];
      col = col.map((c, i) => c + (target[i] - c) * Math.min(1, dt * 4));
      const rgb = (a: number) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
      const lv = st === 'speaking' || st === 'listening' ? level.level : 0;
      smooth += (lv - smooth) * Math.min(1, dt * 12);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.3;
      ctx.clearRect(0, 0, w, h);

      // záře v pozadí
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.1);
      glow.addColorStop(0, rgb(0.28 + smooth * 0.25));
      glow.addColorStop(0.45, rgb(0.08));
      glow.addColorStop(1, rgb(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // částice na oběžné dráze
      for (const p of particles) {
        p.a += p.s * dt * (st === 'thinking' ? 3 : 1);
        const rr = R * (1.15 + p.r * 0.9);
        const x = cx + Math.cos(p.a) * rr;
        const y = cy + Math.sin(p.a) * rr * 0.92;
        ctx.fillStyle = rgb(0.15 + p.z * 0.45);
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + p.z * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // kruhové spektrum (hlas)
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2;
        const noise = 0.5 + 0.5 * Math.sin(a * 5 + t * 6) * Math.sin(a * 3 - t * 4.3) + 0.25 * Math.sin(a * 11 + t * 9);
        const want = st === 'thinking' ? 0.12 + 0.1 * Math.sin(a * 2 + t * 5) : 0.05 + smooth * (0.35 + 0.65 * Math.abs(noise));
        bars[i] += (want - bars[i]) * Math.min(1, dt * 14);
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, R * 0.018);
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const r0 = R * 1.02;
        const r1 = r0 + R * 0.55 * bars[i];
        ctx.strokeStyle = rgb(0.35 + bars[i] * 0.9);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }

      // prstence „reaktoru“
      const spin = st === 'thinking' ? 2.6 : 0.6;
      const rings: [number, number, number, number, number][] = [
        // poloměr, tloušťka, rychlost, počet úseků, mezera
        [0.92, 0.035, 0.35 * spin, 3, 0.35],
        [0.8, 0.015, -0.6 * spin, 12, 0.12],
        [0.7, 0.05, 0.9 * spin, 2, 0.9],
      ];
      for (const [rf, lw, sp, n, gap] of rings) {
        ctx.lineWidth = R * lw;
        ctx.strokeStyle = rgb(0.75);
        const seg = (Math.PI * 2) / n;
        for (let i = 0; i < n; i++) {
          const a0 = i * seg + t * sp;
          ctx.beginPath();
          ctx.arc(cx, cy, R * rf, a0, a0 + seg * (1 - gap));
          ctx.stroke();
        }
      }
      // jemné rysky
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb(0.3);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 - t * 0.15;
        const r0 = R * 0.6;
        const r1 = R * (i % 5 === 0 ? 0.55 : 0.575);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }

      // jádro
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.6);
      const core = R * (0.36 + smooth * 0.12 + breathe * 0.02);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, rgb(0.9));
      g.addColorStop(1, rgb(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, core, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [level]);

  return <canvas ref={canvas} className="jv-orb-canvas" aria-hidden />;
}
