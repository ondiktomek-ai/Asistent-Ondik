import { useCallback, useEffect, useRef, useState } from 'react';
import { createDigest, fetchDigestState, fetchNews, fetchWeather, type DigestState, type NewsFeed, type Weather } from '../api';

export interface Newsroom {
  feed: NewsFeed | null;
  weather: Weather | null;
  weatherError: string | null;
  digests: DigestState | null;
  error: string | null;
  createNow: () => Promise<void>;
  creating: boolean;
}

/** Data zpravodaje Echa: zprávy (každou minutu), počasí (10 min), plakátky (30 s, při psaní častěji). */
export function useNewsroom(enabled: boolean): Newsroom {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [digests, setDigests] = useState<DigestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const generatingRef = useRef(false);

  const loadNews = useCallback(() => {
    fetchNews()
      .then((f) => {
        setFeed(f);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  const loadWeather = useCallback(() => {
    fetchWeather()
      .then((w) => {
        setWeather(w);
        setWeatherError(null);
      })
      .catch((e: Error) => setWeatherError(e.message));
  }, []);
  const loadDigests = useCallback(() => {
    fetchDigestState()
      .then((d) => {
        generatingRef.current = d.generating;
        setDigests(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loadNews();
    loadWeather();
    loadDigests();
    const a = setInterval(loadNews, 60_000);
    const b = setInterval(loadWeather, 10 * 60_000);
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      loadDigests();
      t = setTimeout(tick, generatingRef.current ? 4000 : 30_000);
    };
    t = setTimeout(tick, 30_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearTimeout(t);
    };
  }, [enabled, loadNews, loadWeather, loadDigests]);

  const createNow = useCallback(async () => {
    setCreating(true);
    generatingRef.current = true;
    setDigests((d) => (d ? { ...d, generating: true } : d));
    try {
      await createDigest();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plakátek se nepodařilo vytvořit.');
    } finally {
      setCreating(false);
      loadDigests();
    }
  }, [loadDigests]);

  return { feed, weather, weatherError, digests, error, createNow, creating };
}
