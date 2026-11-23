/**
 * Rozvržení 3D městečka: kancelářské boxy agentů v kruhu, uprostřed radnice.
 * Jednotky = metry. Každý box je otevřený směrem do středu.
 */

export const VACANT_ID = 'vacant';
/** Na radnici sídlí Ondik – hlavní asistent, budoucí Jarvis. Výběr radnice = výběr Ondika. */
export const TOWN_HALL_ID = 'ondik';

/** Pořadí boxů po kruhu. `null` = volný box pro budoucího agenta. */
export const RING: (string | null)[] = [null, 'postak', 'chronos', 'lexa', 'kasa', 'bit', null];

export const RING_RADIUS = 11.5;
export const BOX = { w: 6, d: 5, h: 2.4 };
export const TOWN_HALL_RADIUS = 4.2;

export interface BoxPlacement {
  key: string;
  agentId: string | null;
  angle: number;
  position: [number, number, number];
  /** Otočení kolem osy Y tak, aby otevřená strana boxu (+z) mířila do středu. */
  rotationY: number;
}

/** ID pro výběr boxu: agent, nebo klíč volného boxu (vacant-0, vacant-6, …). */
export function placementId(p: BoxPlacement): string {
  return p.agentId ?? p.key;
}

export function isVacantId(id: string | null): boolean {
  return !!id && id.startsWith(`${VACANT_ID}-`);
}

export const PLACEMENTS: BoxPlacement[] = RING.map((agentId, i) => {
  const angle = (i / RING.length) * Math.PI * 2;
  return {
    key: agentId ?? `${VACANT_ID}-${i}`,
    agentId,
    angle,
    position: [Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS],
    rotationY: angle + Math.PI,
  };
});
