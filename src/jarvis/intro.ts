/**
 * Úvodní hudba Jarvise: vlastní MP3 uživatele (uložená na jeho počítači), která hraje na začátku hlášení.
 * Umí plynule ztlumit do pozadí a dozvučet; `level` (0–1) je hlasitost pro animaci koule.
 */
import { getToken } from '../api';

const KEY = 'jarvis-uvod';

export interface IntroSettings {
  on: boolean;
  /** kolik sekund hraje hudba naplno, než Jarvis začne mluvit */
  seconds: number;
  volume: number;
}

export function loadIntroSettings(): IntroSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<IntroSettings>;
    return { on: s.on ?? true, seconds: typeof s.seconds === 'number' ? s.seconds : 8, volume: typeof s.volume === 'number' ? s.volume : 0.8 };
  } catch {
    return { on: true, seconds: 8, volume: 0.8 };
  }
}

export function saveIntroSettings(s: IntroSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // nevadí
  }
}

export interface IntroInfo {
  name: string;
  size: number;
  type: string;
}

const auth = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export async function fetchIntroInfo(): Promise<IntroInfo | null> {
  const res = await fetch('/api/jarvis/intro/info', { headers: auth() });
  if (!res.ok) return null;
  return ((await res.json()) as { intro: IntroInfo | null }).intro;
}

export async function uploadIntro(file: File): Promise<IntroInfo> {
  const res = await fetch(`/api/jarvis/intro?name=${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    headers: { ...auth(), 'Content-Type': file.type || 'audio/mpeg' },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as { intro?: IntroInfo; error?: string };
  if (!res.ok || !data.intro) throw new Error(data.error ?? 'Nahrání se nepovedlo.');
  return data.intro;
}

export async function deleteIntro(): Promise<void> {
  await fetch('/api/jarvis/intro', { method: 'DELETE', headers: auth() });
}

export class IntroMusic {
  level = 0;
  private url: string | null = null;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private fade: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  volume = 0.8;

  /** Stáhne soubor ze serveru (jednou); vrací false, když žádný není. */
  async load(): Promise<boolean> {
    if (this.url) return true;
    try {
      const res = await fetch('/api/jarvis/intro', { headers: auth() });
      if (!res.ok) return false;
      this.url = URL.createObjectURL(await res.blob());
      return true;
    } catch {
      return false;
    }
  }

  /** Po nahrání nového souboru zapomene starý. */
  reset() {
    this.stop();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  get playing() {
    return !!this.audio && !this.audio.paused;
  }

  /** Jak dlouho už hudba hraje (s). */
  elapsed() {
    return this.playing ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async start(volume = this.volume): Promise<boolean> {
    if (!(await this.load()) || !this.url) return false;
    this.stop();
    const a = new Audio(this.url);
    a.volume = volume;
    this.volume = volume;
    this.audio = a;
    try {
      // měřič hlasitosti pro kouli (nepovinný)
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const src = ctx.createMediaElementSource(a);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        an.connect(ctx.destination);
        this.ctx = ctx;
        const buf = new Uint8Array(an.fftSize);
        this.meter = setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) ** 2;
          this.level = Math.min(1, (Math.sqrt(sum / buf.length) / 40) * (a.volume / Math.max(0.05, this.volume)));
        }, 50);
      }
      await a.play();
      this.startedAt = performance.now();
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  /** Plynule změní hlasitost (na `to` za `ms`); při 0 hudbu zastaví. */
  ramp(to: number, ms: number) {
    const a = this.audio;
    if (!a) return;
    if (this.fade) clearInterval(this.fade);
    const from = a.volume;
    const start = performance.now();
    this.fade = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / Math.max(1, ms));
      a.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        if (this.fade) clearInterval(this.fade);
        this.fade = null;
        if (to <= 0) this.stop();
      }
    }, 40);
  }

  /** Ztlumí do pozadí (pod Jarvisův hlas). */
  duck() {
    this.ramp(this.volume * 0.18, 1200);
  }

  fadeOut(ms = 2500) {
    if (this.audio) this.ramp(0, ms);
  }

  stop() {
    if (this.fade) clearInterval(this.fade);
    if (this.meter) clearInterval(this.meter);
    this.fade = null;
    this.meter = null;
    this.level = 0;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
