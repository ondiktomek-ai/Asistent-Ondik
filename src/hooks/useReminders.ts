import { useCallback, useEffect, useState } from 'react';
import { fetchAgenda, type CalEvent } from '../api';
import { pragueMs } from '../format';

export interface Reminder {
  id: string;
  summary: string;
  start: string;
  minutes: number;
  location?: string;
}

const LEAD_MINUTES = 10;
const KEY = 'chronos-pripomenuto';

/** „2026-11-25T14:30“ (pražský čas) → ms, ať je prohlížeč v jakékoli zóně. */
const localMs = pragueMs;

function remembered(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function remember(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // bez úložiště se připomínka může ukázat znovu – nevadí
  }
}

/** Hlídá kalendář a 10 minut před událostí vrátí připomínku. */
export function useReminders(enabled: boolean) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [active, setActive] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    const load = () =>
      fetchAgenda(2)
        .then((a) => setEvents(a.events))
        .catch(() => {});
    load();
    const t = setInterval(load, 2 * 60_000);
    return () => clearInterval(t);
  }, [enabled]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const done = remembered();
      const due = events
        .filter((e) => !e.allDay)
        .map((e) => ({ e, ms: localMs(e.start) }))
        .filter(({ e, ms }) => ms > now && ms - now <= LEAD_MINUTES * 60_000 && !done.has(`${e.id}@${e.start}`));
      if (due.length) {
        due.forEach(({ e }) => done.add(`${e.id}@${e.start}`));
        remember(done);
        setActive((prev) => [
          ...prev,
          ...due.map(({ e, ms }) => ({ id: e.id, summary: e.summary, start: e.start, minutes: Math.max(1, Math.round((ms - now) / 60_000)), location: e.location })),
        ]);
      }
      // připomínky zmizí, když událost začne
      setActive((prev) => prev.filter((r) => localMs(r.start) > now - 60_000));
    };
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [events]);

  const dismiss = useCallback((id: string) => setActive((prev) => prev.filter((r) => r.id !== id)), []);
  return { reminders: active, dismiss };
}
