import { useEffect, useState } from 'react';

export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export type LightMode = 'auto' | 'day' | 'night';

/** Míra tmy 0 (den) až 1 (noc) podle hodiny. */
export function darknessFor(date: Date, mode: LightMode): number {
  if (mode === 'day') return 0;
  if (mode === 'night') return 1;
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3;
  if (h >= 6 && h < 7) return 1 - (h - 6);
  return 1;
}
