/**
 * Hlas Jarvise: převod textu na řeč přes prohlížeč (speechSynthesis) a rozpoznávání řeči (SpeechRecognition).
 * Vše je zdarma a bez klíče. Nejlepší české hlasy má Microsoft Edge (Antonín, Vlasta – „Natural“).
 */

const SETTINGS_KEY = 'jarvis-hlas';

export interface VoiceSettings {
  voiceURI: string | null;
  rate: number;
}

export function loadSettings(): VoiceSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<VoiceSettings>;
    return { voiceURI: s.voiceURI ?? null, rate: typeof s.rate === 'number' ? s.rate : 1.05 };
  } catch {
    return { voiceURI: null, rate: 1.05 };
  }
}

export function saveSettings(s: VoiceSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // bez úložiště se nastavení jen nezapamatuje
  }
}

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Hlasy se v prohlížeči načítají asynchronně – počkáme na ně (nejvýš ~2 s). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, 2000);
  });
}

/** Hodnocení hlasu pro Jarvise: čeština, neuronový („Natural/Online“), mužský (Antonín, Jakub). */
function score(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/^cs/i.test(v.lang)) s += 100;
  if (/natural|online|neural/.test(n)) s += 30;
  if (/anton[ií]n/.test(n)) s += 20;
  if (/jakub/.test(n)) s += 12;
  if (/vlasta|zuzana/.test(n)) s += 6;
  if (v.localService) s += 1;
  return s;
}

export function czechVoices(voices: SpeechSynthesisVoice[]) {
  return voices.filter((v) => /^cs/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}

export function pickVoice(voices: SpeechSynthesisVoice[], preferredURI: string | null): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const v = voices.find((x) => x.voiceURI === preferredURI);
    if (v) return v;
  }
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 100 ? best : null;
}

/** Text upravený pro čtení nahlas: bez emoji, markdownu a odkazů. */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rozdělí text na věty (Chrome umí utnout dlouhé promluvy po ~15 s, po větách je to spolehlivé). */
export function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?…]+(?:[.!?…]+["“”»)]*|$)/g;
  for (const m of text.matchAll(re)) {
    const t = m[0].trim();
    if (t) out.push(t);
  }
  return out.length ? out : [text];
}

/**
 * Mluvčí s frontou. `level` (0–1) pulzuje podle slov – animace koule z něj kreslí „hlas“.
 * Když prohlížeč nemá český hlas (nebo vůbec žádný), jede „potichu“: časuje jen titulky.
 */
export class Speaker {
  level = 0;
  speaking = false;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1.05;
  muted = false;
  private token = 0;
  private queue: Promise<void> = Promise.resolve();

  get silent() {
    return this.muted || !ttsSupported() || !this.voice;
  }

  /** Přidá text do fronty; vrací slib, který se splní, až se dořekne. onProgress dostává podíl přečteného textu 0–1. */
  say(text: string, onProgress?: (fraction: number) => void): Promise<void> {
    const token = this.token;
    const clean = speakable(text);
    const job = this.queue.then(() => (token === this.token && clean ? this.speakNow(clean, token, onProgress) : undefined));
    this.queue = job.catch(() => {});
    return job;
  }

  /** Okamžitě umlčí a zahodí frontu. */
  cancel() {
    this.token++;
    this.queue = Promise.resolve();
    this.speaking = false;
    this.level = 0;
    if (ttsSupported()) speechSynthesis.cancel();
  }

  private async speakNow(text: string, token: number, onProgress?: (f: number) => void) {
    const parts = sentences(text);
    const total = text.length;
    let doneChars = 0;
    this.speaking = true;
    onProgress?.(0);
    try {
      for (const part of parts) {
        if (token !== this.token) return;
        await this.utter(part, token, (ci) => onProgress?.(Math.min(1, (doneChars + ci) / total)));
        doneChars += part.length + 1;
        onProgress?.(Math.min(1, doneChars / total));
      }
    } finally {
      if (token === this.token) {
        this.speaking = false;
        this.level = 0;
      }
    }
  }

  private utter(text: string, token: number, onChar: (charIndex: number) => void): Promise<void> {
    // tichý režim: titulky jedou podle odhadu rychlosti řeči
    if (this.silent) {
      return new Promise((resolve) => {
        const ms = Math.max(900, (text.length * 62) / this.rate);
        const start = performance.now();
        const tick = () => {
          if (token !== this.token) return resolve();
          const t = (performance.now() - start) / ms;
          this.level = 0.35 + 0.35 * Math.abs(Math.sin(t * 40));
          onChar(Math.floor(Math.min(1, t) * text.length));
          if (t >= 1) return resolve();
          requestAnimationFrame(tick);
        };
        tick();
      });
    }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice;
      u.lang = this.voice?.lang ?? 'cs-CZ';
      u.rate = this.rate;
      u.pitch = 1;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        clearInterval(pulse);
        resolve();
      };
      // jistota: kdyby prohlížeč „zapomněl“ ohlásit konec, pokračujeme podle odhadu
      const watchdog = setTimeout(finish, (text.length * 110) / this.rate + 5000);
      // „hlas“ pro animaci: puls při každém slově + jemné vlnění mezi nimi
      let lastWord = 0;
      const pulse = setInterval(() => {
        if (token !== this.token) return finish();
        const since = performance.now() - lastWord;
        this.level = Math.max(0.25 + 0.2 * Math.random(), Math.exp(-since / 180));
      }, 50);
      u.onboundary = (e) => {
        lastWord = performance.now();
        onChar(e.charIndex);
      };
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
      // Chrome občas zůstane „pozastavený“
      if (speechSynthesis.paused) speechSynthesis.resume();
    });
  }
}

// ---------------------------------------------------------------- rozpoznávání řeči

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Proč mikrofon nejde (nebo null, když jde). */
export function micUnavailableReason(): string | null {
  if (!recognitionCtor()) return 'Tenhle prohlížeč neumí rozpoznávat řeč – použij Edge nebo Chrome na počítači.';
  if (!window.isSecureContext) return 'Mikrofon funguje jen na počítači nebo přes zabezpečenou adresu (https, např. Tailscale). Tady můžeš psát.';
  return null;
}

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'Prohlížeč nepovolil mikrofon. Povol ho kliknutím na ikonu zámku vedle adresy.',
  'service-not-allowed': 'Prohlížeč nepovolil rozpoznávání řeči.',
  'audio-capture': 'Nenašel jsem mikrofon. Je připojený?',
  network: 'Rozpoznávání řeči potřebuje internet a teď se nepovedlo.',
  'language-not-supported': 'Prohlížeč neumí rozpoznávat češtinu.',
};

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** Konec bez výsledku (ticho) nebo chyba (s hláškou). */
  onNothing: (error?: string) => void;
}

/** Jednou poslechne, co uživatel řekne. Vrací funkci pro zastavení. `level` (0–1) je hlasitost mikrofonu. */
export function listen(h: ListenHandlers, meter: { level: number }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    h.onNothing(micUnavailableReason() ?? undefined);
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = 'cs-CZ';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';
  let ended = false;
  let stopMeter: () => void = () => {};

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    h.onInterim((final + interim).trim());
  };
  let error: string | undefined;
  rec.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') error = MIC_ERRORS[e.error] ?? `Rozpoznávání řeči selhalo (${e.error}).`;
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    stopMeter();
    meter.level = 0;
    const text = final.trim();
    if (text) h.onFinal(text);
    else h.onNothing(error);
  };

  // hlasitost mikrofonu pro animaci (nepovinné – když nejde, koule jen jemně dýchá)
  if (navigator.mediaDevices?.getUserMedia) {
    let cancelled = false;
    stopMeter = () => {
      cancelled = true;
    };
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const iv = setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) ** 2;
          meter.level = Math.min(1, Math.sqrt(sum / buf.length) / 28);
        }, 50);
        stopMeter = () => {
          clearInterval(iv);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
        };
      })
      .catch(() => {});
  }

  try {
    rec.start();
  } catch {
    ended = true;
    stopMeter();
    h.onNothing('Mikrofon je zrovna zaneprázdněný, zkus to znovu.');
  }
  return () => {
    try {
      rec.stop();
    } catch {
      // už neběží
    }
  };
}

// ---------------------------------------------------------------- zvukové efekty

/** Krátký „náběh systému“ – syntetizovaný, bez souborů. */
export function chime(kind: 'start' | 'listen' | 'end') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const notes = kind === 'start' ? [523, 784, 1047] : kind === 'listen' ? [880, 1175] : [784, 523];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const s = t0 + i * 0.09;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.06, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(s);
      o.stop(s + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // zvuk není nutný
  }
}
