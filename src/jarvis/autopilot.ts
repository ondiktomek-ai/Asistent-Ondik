/**
 * Autopilot: co městečko dělá samo, bez klikání.
 * - Jarvis tě pozdraví hlášením, když městečko spustíš (nejvýš jednou za pár hodin),
 * - ráno v nastavený čas sám přednese hlášení,
 * - připomínky z kalendáře řekne nahlas.
 */

const KEY = 'autopilot';
const LAST_GREET = 'autopilot-pozdrav';
const LAST_MORNING = 'autopilot-rano';

export interface AutopilotSettings {
  greetOnStart: boolean;
  /** „HH:MM“, prázdné = vypnuto */
  morning: string;
  speakReminders: boolean;
}

const DEFAULTS: AutopilotSettings = { greetOnStart: true, morning: '07:00', speakReminders: true };
/** Po kolika hodinách smí Jarvis při spuštění pozdravit znovu. */
const GREET_EVERY_H = 3;

export function loadAutopilot(): AutopilotSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AutopilotSettings>;
    return {
      greetOnStart: s.greetOnStart ?? DEFAULTS.greetOnStart,
      morning: typeof s.morning === 'string' && /^(\d{2}:\d{2})?$/.test(s.morning) ? s.morning : DEFAULTS.morning,
      speakReminders: s.speakReminders ?? DEFAULTS.speakReminders,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveAutopilot(s: AutopilotSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // nevadí
  }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // nevadí
  }
};

const pragueNow = () => {
  const d = new Date();
  return {
    ymd: d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' }),
    hm: d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).padStart(5, '0'),
  };
};

/** Má Jarvis pozdravit při spuštění? (a rovnou si to poznamená) */
export function takeStartGreeting(): boolean {
  const s = loadAutopilot();
  if (!s.greetOnStart) return false;
  const last = Number(read(LAST_GREET)) || 0;
  if (Date.now() - last < GREET_EVERY_H * 3600_000) return false;
  write(LAST_GREET, String(Date.now()));
  return true;
}

/** Je čas na ranní hlášení? Vrátí true jednou denně v nastavenou minutu (nebo do 30 min po ní). */
export function takeMorningBriefing(): boolean {
  const s = loadAutopilot();
  if (!s.morning) return false;
  const { ymd, hm } = pragueNow();
  if (read(LAST_MORNING) === ymd) return false;
  const [h, m] = s.morning.split(':').map(Number);
  const [nh, nm] = hm.split(':').map(Number);
  const diff = nh * 60 + nm - (h * 60 + m);
  if (diff < 0 || diff > 30) return false;
  write(LAST_MORNING, ymd);
  // ranní hlášení zároveň počítá jako pozdrav (ať hned nato nepřijde další)
  write(LAST_GREET, String(Date.now()));
  return true;
}

/** Smí stránka sama spustit zvuk? (Bez kliknutí to prohlížeč obvykle nedovolí; spouštěč to povoluje.) */
export async function canAutoplay(): Promise<boolean> {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua?.hasBeenActive) return true;
  try {
    // 0,1 s ticha
    const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=');
    a.volume = 0;
    await a.play();
    a.pause();
    return true;
  } catch {
    return false;
  }
}
