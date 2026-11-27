import { serviceFailed, serviceOk } from './net.ts';
/** Počasí z Open-Meteo (zdarma, bez klíče). Výchozí místo: Lipník nad Bečvou. */

export const PLACE = {
  name: process.env.MISTO_NAZEV || 'Lipník nad Bečvou',
  lat: Number(process.env.MISTO_LAT || 49.5275),
  lon: Number(process.env.MISTO_LON || 17.5859),
};

export interface Weather {
  place: string;
  updated: string;
  current: { time: string; temp: number; feels: number; code: number; text: string; icon: string; wind: number; precip: number; isDay: boolean };
  /** Příštích 24 hodin. */
  hourly: { time: string; temp: number; precipProb: number; precip: number; code: number; icon: string }[];
  /** Dnes + 2 další dny. */
  daily: { date: string; max: number; min: number; code: number; text: string; icon: string; precip: number; precipProb: number }[];
}

/** Kódy počasí WMO → český popis a ikona. */
export function describe(code: number, isDay = true): { text: string; icon: string } {
  const t = (text: string, icon: string) => ({ text, icon });
  if (code === 0) return isDay ? t('Jasno', '☀️') : t('Jasno', '🌙');
  if (code === 1) return isDay ? t('Skoro jasno', '🌤️') : t('Skoro jasno', '🌙');
  if (code === 2) return t('Polojasno', '⛅');
  if (code === 3) return t('Zataženo', '☁️');
  if (code === 45 || code === 48) return t('Mlha', '🌫️');
  if (code >= 51 && code <= 55) return t('Mrholení', '🌦️');
  if (code === 56 || code === 57) return t('Mrznoucí mrholení', '🌧️');
  if (code === 61) return t('Slabý déšť', '🌧️');
  if (code === 63) return t('Déšť', '🌧️');
  if (code === 65) return t('Silný déšť', '🌧️');
  if (code === 66 || code === 67) return t('Mrznoucí déšť', '🌧️');
  if (code === 71) return t('Slabé sněžení', '🌨️');
  if (code === 73) return t('Sněžení', '🌨️');
  if (code === 75) return t('Silné sněžení', '❄️');
  if (code === 77) return t('Sněhová zrna', '🌨️');
  if (code >= 80 && code <= 82) return t('Přeháňky', '🌦️');
  if (code === 85 || code === 86) return t('Sněhové přeháňky', '🌨️');
  if (code === 95) return t('Bouřka', '⛈️');
  if (code === 96 || code === 99) return t('Bouřka s kroupami', '⛈️');
  return t('Neznámé', '🌡️');
}

let cache: { at: number; data: Weather } | null = null;
const CACHE_MS = 20 * 60_000;

export async function getWeather(force = false): Promise<Weather> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const params = new URLSearchParams({
    latitude: String(PLACE.lat),
    longitude: String(PLACE.lon),
    timezone: 'Europe/Prague',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    forecast_days: '3',
    forecast_hours: '24',
  });
  let j: any;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
    j = await res.json();
    serviceOk('pocasi', 'Počasí (Open-Meteo)');
  } catch (err) {
    serviceFailed('pocasi', 'Počasí (Open-Meteo)', err, () => getWeather(true));
    // poslední známé počasí je lepší než nic
    if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.data;
    throw err;
  }
  const cur = describe(j.current.weather_code, j.current.is_day === 1);
  const data: Weather = {
    place: PLACE.name,
    updated: new Date().toISOString(),
    current: {
      time: j.current.time,
      temp: j.current.temperature_2m,
      feels: j.current.apparent_temperature,
      code: j.current.weather_code,
      text: cur.text,
      icon: cur.icon,
      wind: j.current.wind_speed_10m,
      precip: j.current.precipitation,
      isDay: j.current.is_day === 1,
    },
    hourly: (j.hourly.time as string[]).map((time, i) => ({
      time,
      temp: j.hourly.temperature_2m[i],
      precipProb: j.hourly.precipitation_probability[i] ?? 0,
      precip: j.hourly.precipitation[i] ?? 0,
      code: j.hourly.weather_code[i],
      icon: describe(j.hourly.weather_code[i], j.hourly.is_day?.[i] !== 0).icon,
    })),
    daily: (j.daily.time as string[]).map((date, i) => {
      const d = describe(j.daily.weather_code[i]);
      return {
        date,
        max: j.daily.temperature_2m_max[i],
        min: j.daily.temperature_2m_min[i],
        code: j.daily.weather_code[i],
        text: d.text,
        icon: d.icon,
        precip: j.daily.precipitation_sum[i] ?? 0,
        precipProb: j.daily.precipitation_probability_max[i] ?? 0,
      };
    }),
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Krátký textový popis pro souhrn (bez AI). */
export function weatherSentence(w: Weather): string {
  const temps = w.hourly.map((h) => h.temp);
  const rain = w.hourly.filter((h) => h.precipProb >= 50);
  const parts = [`Teď ${Math.round(w.current.temp)} °C, ${w.current.text.toLowerCase()}.`];
  parts.push(`Během příštích 24 hodin ${Math.round(Math.min(...temps))} až ${Math.round(Math.max(...temps))} °C.`);
  if (rain.length) parts.push(`Srážky nejspíš kolem ${rain[0].time.slice(11, 16)}.`);
  else parts.push('Bez výraznějších srážek.');
  return parts.join(' ');
}
