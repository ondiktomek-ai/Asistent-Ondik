import type { Point, Rect } from './types';

/** Rozměry světa (souřadnice SVG viewBoxu). */
export const WORLD = { width: 1200, height: 820 };

/** Vnější zdi budovy. */
export const BUILDING: Rect = { x: 30, y: 30, w: 1140, h: 760 };

/** Hlavní chodba s recepcí. */
export const HALLWAY: Rect = { x: 40, y: 310, w: 1120, h: 200 };

export type DoorSide = 'top' | 'bottom';

export interface RoomLayout extends Rect {
  /** `null` = volná kancelář připravená pro nového agenta. */
  agentId: string | null;
  /** Na které straně kanceláře jsou dveře do chodby. */
  door: DoorSide;
}

const TOP_Y = 40;
const BOTTOM_Y = 520;
const ROOM_H = 260;
const COLS = [
  { x: 40, w: 366 },
  { x: 416, w: 368 },
  { x: 794, w: 366 },
];

export const ROOMS: RoomLayout[] = [
  { agentId: 'postak', ...COLS[0], y: TOP_Y, h: ROOM_H, door: 'bottom' },
  { agentId: 'chronos', ...COLS[1], y: TOP_Y, h: ROOM_H, door: 'bottom' },
  { agentId: 'lexa', ...COLS[2], y: TOP_Y, h: ROOM_H, door: 'bottom' },
  { agentId: 'kasa', ...COLS[0], y: BOTTOM_Y, h: ROOM_H, door: 'top' },
  { agentId: null, ...COLS[1], y: BOTTOM_Y, h: ROOM_H, door: 'top' },
  { agentId: 'bit', ...COLS[2], y: BOTTOM_Y, h: ROOM_H, door: 'top' },
];

export const DOOR_WIDTH = 60;

export const VACANT_ID = 'vacant';

/** Unikátní klíč místnosti (i pro volné kanceláře). */
export function roomKey(room: RoomLayout): string {
  return room.agentId ?? `${VACANT_ID}-${room.x}-${room.y}`;
}

/** Střed dveří (na rozhraní kancelář / chodba). */
export function doorCenter(room: RoomLayout): Point {
  return {
    x: room.x + room.w / 2,
    y: room.door === 'bottom' ? room.y + room.h + 5 : room.y - 5,
  };
}

/** Místa, kam chodí Ondik – recepce, salonek a dveře všech kanceláří. */
export const RECEPTION_SPOTS: Point[] = [
  { x: 600, y: 398 },
  { x: 600, y: 398 },
  ...ROOMS.map((r) => {
    const d = doorCenter(r);
    return { x: d.x, y: r.door === 'bottom' ? HALLWAY.y + 28 : HALLWAY.y + HALLWAY.h - 18 };
  }),
  { x: 175, y: 430 },
  { x: 92, y: 478 },
  { x: 860, y: 445 },
];
