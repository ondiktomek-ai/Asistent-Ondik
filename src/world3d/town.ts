/**
 * Geometrie městečka pro chodící roboty: převody souřadnic, okružní cesta, stánky,
 * vchody do boxů a na radnici, výška terénu.
 */
import { PLACEMENTS, RING_RADIUS, TOWN_HALL_RADIUS, type BoxPlacement } from '../world/layout';

export type V2 = [number, number]; // [x, z] ve světě

/** Okružní cesta mezi radnicí a stánky – po ní roboti chodí kolem náměstí. */
export const ROAD_R = 6.3;
/** Stánky stojí v mezerách mezi boxy. */
export const STALL_R = 8.4;
const BUY_R = 7.15;

/** Lokální bod boxu [x, z] → svět. Box je otočený o rotationY (jeho +z míří do středu). */
export function toWorld(pl: BoxPlacement, local: [number, number, number] | V2): V2 {
  const lx = local[0];
  const lz = local.length === 3 ? local[2] : local[1];
  const c = Math.cos(pl.rotationY);
  const s = Math.sin(pl.rotationY);
  return [pl.position[0] + lx * c + lz * s, pl.position[2] - lx * s + lz * c];
}

export const polar = (angle: number, r: number): V2 => [Math.sin(angle) * r, Math.cos(angle) * r];
export const angleOf = (p: V2) => Math.atan2(p[0], p[1]);

/** Výška povrchu: radnice stojí na schodech (podlaha 0,45 m). */
export function heightAt(p: V2): number {
  const r = Math.hypot(p[0], p[1]);
  if (r < TOWN_HALL_RADIUS - 0.65) return 0.45;
  if (r < TOWN_HALL_RADIUS) return 0.45 * (1 - (r - (TOWN_HALL_RADIUS - 0.65)) / 0.65);
  return 0;
}

/** Body po okružní cestě z úhlu a1 do a2 (kratším směrem). */
export function ringPath(a1: number, a2: number): V2[] {
  let d = a2 - a1;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.28));
  return Array.from({ length: steps }, (_, i) => polar(a1 + (d * (i + 1)) / steps, ROAD_R));
}

// ---------------------------------------------------------------- vchody

/** Cesta z vnitřku boxu ven na okružní cestu (a obráceně pozpátku). */
export function boxDoorPath(pl: BoxPlacement): V2[] {
  return [toWorld(pl, [0, 1.5]), toWorld(pl, [0, 2.9]), toWorld(pl, [0, 3.9]), polar(pl.angle, ROAD_R)];
}

/** Mezery mezi sloupy radnice (10 sloupů) – tudy se chodí dovnitř. */
const HALL_GAPS = Array.from({ length: 10 }, (_, k) => ((k + 0.5) / 10) * Math.PI * 2);

export function nearestHallGap(angle: number): number {
  let best = HALL_GAPS[0];
  let bd = Infinity;
  for (const g of HALL_GAPS) {
    const d = Math.abs(Math.atan2(Math.sin(g - angle), Math.cos(g - angle)));
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

/** Cesta z radnice ven na okružní cestu přes danou mezeru mezi sloupy. */
export function hallDoorPath(gap: number): V2[] {
  return [polar(gap, 2.5), polar(gap, 4.7), polar(gap, ROAD_R)];
}

// ---------------------------------------------------------------- stánky

export interface StallDef {
  id: string;
  name: string;
  icon: string;
  awning: string;
  /** Co si tu robot koupí (ukáže se mu v ruce). */
  item: 'kafe' | 'rohlik' | 'jablko' | 'zmrzlina';
  buyLines: string[];
  afterLines: string[];
  angle: number;
  /** Střed stánku a místo, kde stojí kupující robot. */
  pos: V2;
  buy: V2;
}

const gapAngle = (k: number) => ((k + 0.5) / PLACEMENTS.length) * Math.PI * 2;

const STALL_TYPES: Omit<StallDef, 'angle' | 'pos' | 'buy'>[] = [
  { id: 'kavarna', name: 'Kavárna', icon: '☕', awning: '#8a5a3c', item: 'kafe', buyLines: ['☕ Jedno kafe, prosím!', '☕ Espresso s sebou!'], afterLines: ['Mmm, kafíčko ☕', 'Teď to půjde!'] },
  { id: 'pekarna', name: 'Pekárna', icon: '🥐', awning: '#e08a2c', item: 'rohlik', buyLines: ['🥐 Dva rohlíky, prosím!', '🥐 Jeden croissant!'], afterLines: ['Ještě teplé! 🥐', 'Mňam!'] },
  { id: 'ovoce', name: 'Ovoce', icon: '🍎', awning: '#3f9d55', item: 'jablko', buyLines: ['🍎 Kilo jablek!', '🍐 Hrušky jsou čerstvé?'], afterLines: ['Vitamíny! 🍎', 'Zdravě a s chutí.'] },
  { id: 'zmrzlina', name: 'Zmrzlina', icon: '🍦', awning: '#e86fa0', item: 'zmrzlina', buyLines: ['🍦 Vanilkovou, prosím!', '🍦 Dva kopečky!'], afterLines: ['Ta je dobrá! 🍦', 'Brrr, studená!'] },
];

/** Mezery mezi boxy, kde stojí stánky (v ostatních zůstávají záhony). */
export const STALL_GAPS = [0, 2, 4, 6];

export const STALLS: StallDef[] = STALL_TYPES.map((t, i) => {
  const angle = gapAngle(STALL_GAPS[i]);
  return { ...t, angle, pos: polar(angle, STALL_R), buy: polar(angle, BUY_R) };
});

export const FLOWER_GAPS = Array.from({ length: PLACEMENTS.length }, (_, k) => k).filter((k) => !STALL_GAPS.includes(k));
export const flowerBedAngle = gapAngle;

/** Místa na poradě: kruh kolem podstavce pro Jarvise uprostřed radnice. */
export const MEETING_CENTER: V2 = [0, 1.1];
export function meetingSpot(i: number, n: number): V2 {
  const a = (i / n) * Math.PI * 2 + Math.PI; // první (Ondik) stojí na straně u stolu
  return [MEETING_CENTER[0] + Math.sin(a) * 1.55, MEETING_CENTER[1] + Math.cos(a) * 1.55];
}

export { RING_RADIUS };
