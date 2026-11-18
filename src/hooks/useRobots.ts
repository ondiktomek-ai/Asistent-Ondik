import { useEffect, useRef, useState } from 'react';
import type { Point } from '../world/types';

export interface RobotPlan {
  id: string;
  spots: Point[];
  lines: string[];
}

export interface RobotState {
  id: string;
  x: number;
  y: number;
  facing: 1 | -1;
  walking: boolean;
  bubble: string | null;
}

interface Internal extends RobotState {
  target: Point;
  spotIdx: number;
  wait: number;
  bubbleLeft: number;
  nextBubble: number;
}

const SPEED = 55; // px/s
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Jednoduchá simulace: každý robot chodí mezi svými místy, zastaví se a občas něco řekne. */
export function useRobots(plans: RobotPlan[]): RobotState[] {
  const stateRef = useRef<Internal[] | null>(null);
  if (stateRef.current === null) {
    stateRef.current = plans.map((p) => {
      const idx = Math.floor(Math.random() * p.spots.length);
      const s = p.spots[idx];
      return {
        id: p.id,
        x: s.x,
        y: s.y,
        facing: 1,
        walking: false,
        bubble: null,
        target: s,
        spotIdx: idx,
        wait: rand(0.5, 4),
        bubbleLeft: 0,
        nextBubble: rand(2, 12),
      };
    });
  }
  const [, setFrame] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const planById = new Map(plans.map((p) => [p.id, p]));

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const r of stateRef.current!) {
        const plan = planById.get(r.id)!;
        // řeč
        if (r.bubbleLeft > 0) {
          r.bubbleLeft -= dt;
          if (r.bubbleLeft <= 0) r.bubble = null;
        } else {
          r.nextBubble -= dt;
          if (r.nextBubble <= 0 && plan.lines.length) {
            r.bubble = plan.lines[Math.floor(Math.random() * plan.lines.length)];
            r.bubbleLeft = 3.5;
            r.nextBubble = rand(10, 25);
          }
        }
        if (reduced) continue;
        // pohyb
        if (r.wait > 0) {
          r.wait -= dt;
          if (r.wait <= 0 && plan.spots.length > 1) {
            let idx = r.spotIdx;
            while (idx === r.spotIdx) idx = Math.floor(Math.random() * plan.spots.length);
            r.spotIdx = idx;
            r.target = plan.spots[idx];
          }
          continue;
        }
        const dx = r.target.x - r.x;
        const dy = r.target.y - r.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) {
          r.x = r.target.x;
          r.y = r.target.y;
          r.walking = false;
          r.wait = rand(2, 7);
          continue;
        }
        const d = Math.min(dist, SPEED * dt);
        r.x += (dx / dist) * d;
        r.y += (dy / dist) * d;
        r.walking = true;
        if (Math.abs(dx) > 2) r.facing = dx > 0 ? 1 : -1;
      }
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [plans]);

  return stateRef.current;
}
