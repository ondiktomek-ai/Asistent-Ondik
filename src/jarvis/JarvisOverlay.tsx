import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBriefing, launch, onServerPc, sendMessage, type Briefing, type BriefingSegment, type ChatAttachment, type SegmentKind } from '../api';
import { JarvisOrb, type OrbState } from './JarvisOrb';
import { BriefingStage } from './BriefingStage';
import { canAutoplay, loadAutopilot, saveAutopilot, type AutopilotSettings } from './autopilot';
import { IntroMusic, deleteIntro, fetchIntroInfo, loadIntroSettings, saveIntroSettings, uploadIntro, type IntroInfo, type IntroSettings } from './intro';
import { MIC_DENIED, Speaker, chime, czechVoices, listen, loadSettings, loadVoices, micPermission, micUnavailableReason, pickVoice, saveSettings, speakable, ttsSupported, type VoiceSettings } from './speech';

export type JarvisPhase = 'tap' | 'preparing' | 'speaking' | 'listening' | 'thinking' | 'idle' | 'error';

const KIND_LABEL: Record<SegmentKind, string> = {
  uvod: 'Úvod',
  pocasi: 'Počasí',
  svet: 'Svět',
  cesko: 'Česko',
  region: 'Region',
  program: 'Program',
  tym: 'Tým',
  otazka: 'Otázka',
};
const KIND_ICON: Record<SegmentKind, string> = { uvod: '🕰️', pocasi: '🌤️', svet: '🌍', cesko: '🇨🇿', region: '📍', program: '📅', tym: '🔧', otazka: '💬' };

/** Hlasový pokyn k vypnutí Jarvise (krátká věta jako „vypni se“, „to je vše“, „dobrou noc“). */
function isStopCommand(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[.,!?;:„“"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.split(' ').length > 6) return false;
  return /(^|\s)(vypni se|vypni|vypnout|vypnete se|ukonči|ukonči se|ukončit|zavři se|zavři|zavřít|konec|to je vše|to je všechno|to je zatím vše|nashledanou|na shledanou|dobrou noc|sbohem|jdi spát|můžeš jít)(\s|$)/.test(t);
}

const PREP_LINES = ['Probouzím systémy…', 'Kontroluji počasí v Lipníku…', 'Čtu zprávy ze světa…', 'Procházím české zprávy…', 'Dívám se do okolí Lipníku…', 'Nahlížím do kalendáře…', 'Skládám hlášení…'];

interface Props {
  serverOnline: boolean;
  onClose: () => void;
  onPhase: (phase: JarvisPhase | null, label?: string) => void;
  onOpenResearch: (id: string) => void;
  /** Otevřel ho autopilot (bez kliknutí) – když prohlížeč nedovolí zvuk, počká na klepnutí. */
  auto?: boolean;
}

interface Exchange {
  q: string;
  a: string;
}

/** Celoobrazovkový Jarvis: mluvené hlášení a hlasový rozhovor. */
export function JarvisOverlay({ serverOnline, onClose, onPhase, onOpenResearch, auto = false }: Props) {
  const speaker = useRef(new Speaker()).current;
  const mic = useRef({ level: 0 }).current;
  const music = useRef(new IntroMusic()).current;
  const [phase, setPhaseState] = useState<JarvisPhase>('preparing');
  const phaseRef = useRef<JarvisPhase>('preparing');
  const setPhase = useCallback((p: JarvisPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  // koule čte hlasitost: při poslechu z mikrofonu, jinak z hlasu
  const level = useMemo(() => ({ get level() { return phaseRef.current === 'listening' ? mic.level : Math.max(speaker.level, music.level); } }), [mic, speaker, music]);

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [segIndex, setSegIndex] = useState(-1);
  const [subtitle, setSubtitle] = useState<{ text: string; progress: number; who: 'jarvis' | 'ty' } | null>(null);
  const [interim, setInterim] = useState('');
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [posters, setPosters] = useState<ChatAttachment[]>([]);
  const [prepLine, setPrepLine] = useState(0);
  const [typed, setTyped] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>(loadSettings);
  const [intro, setIntro] = useState<IntroSettings>(loadIntroSettings);
  const introRef = useRef(intro);
  introRef.current = intro;
  const [introInfo, setIntroInfo] = useState<IntroInfo | null>(null);
  const introInfoRef = useRef<IntroInfo | null>(null);
  const [introBusy, setIntroBusy] = useState<string | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotSettings>(loadAutopilot);
  const [micDenied, setMicDeniedState] = useState(false);
  const micDeniedRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const setMicDenied = useCallback((v: boolean) => {
    micDeniedRef.current = v;
    setMicDeniedState(v);
  }, []);
  // zakázaný mikrofon poznáme hned (a ukážeme návod, místo marného poslouchání)
  useEffect(() => {
    void micPermission().then((st) => st === 'denied' && setMicDenied(true));
  }, [setMicDenied]);
  const resumeAt = useRef<{ b: Briefing; i: number } | null>(null);
  /** běží hlášení („vysílání“) – obrazovka je ve stylu zpráv */
  const [onAir, setOnAir] = useState(false);
  /** velký nápis sekce mezi částmi */
  const [titleCard, setTitleCard] = useState<{ key: number; label: string; icon: string } | null>(null);
  const closeRef = useRef<() => void>(() => {});
  const [now, setNow] = useState(() => new Date());
  const micReason = useMemo(micUnavailableReason, []);

  const run = useRef(0); // každá nová akce zneplatní tu předchozí
  const stopListen = useRef<() => void>(() => {});
  const abort = useRef<AbortController | null>(null);
  const briefingRef = useRef<Briefing | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // stav pro městečko (bublina nad Ondikem, záře na radnici)
  useEffect(() => {
    const label = phase === 'speaking' ? '🎙️ Jarvis mluví…' : phase === 'listening' ? '👂 Jarvis poslouchá…' : phase === 'thinking' || phase === 'preparing' ? '💭 Jarvis přemýšlí…' : undefined;
    onPhase(phase, label);
  }, [phase, onPhase]);
  useEffect(() => () => onPhase(null), [onPhase]);

  // ------------------------------------------------------------ zastavení všeho

  const halt = useCallback(() => {
    run.current++;
    speaker.cancel();
    stopListen.current();
    stopListen.current = () => {};
    abort.current?.abort();
    abort.current = null;
    mic.level = 0;
    setOnAir(false);
    setTitleCard(null);
  }, [speaker, mic]);

  useEffect(() => halt, [halt]);

  // ------------------------------------------------------------ poslech a rozhovor

  const startListening = useCallback(() => {
    if (micReason) {
      setError(micReason);
      setPhase('idle');
      return;
    }
    halt();
    music.fadeOut(400); // mikrofon by jinak slyšel hudbu
    const id = run.current;
    setError(null);
    setMicDenied(false);
    setInterim('');
    setToolLabel(null);
    setPhase('listening');
    chime('listen');
    stopListen.current = listen(
      {
        onInterim: (t) => id === run.current && setInterim(t),
        onFinal: (t) => {
          if (id !== run.current) return;
          setInterim('');
          void ask(t);
        },
        onNothing: (err) => {
          if (id !== run.current) return;
          setInterim('');
          if (err === MIC_DENIED) {
            setMicDenied(true);
            setHelpOpen(true);
          }
          else if (err) setError(err);
          setPhase('idle');
        },
      },
      mic,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halt, mic, micReason, setPhase]);

  const ask = useCallback(
    async (question: string) => {
      halt();
      music.fadeOut(400);
      const id = run.current;
      if (isStopCommand(question)) {
        // „vypni se“ → rozloučí se a vrátí na domovskou obrazovku
        setSubtitle({ text: 'Jak si přejete. Jsem tu, kdybyste mě potřeboval.', progress: 0, who: 'jarvis' });
        setPhase('speaking');
        await speaker.say('Jak si přejete. Jsem tu, kdybyste mě potřeboval.', (f) => id === run.current && setSubtitle({ text: 'Jak si přejete. Jsem tu, kdybyste mě potřeboval.', progress: f, who: 'jarvis' }));
        if (id === run.current) closeRef.current();
        return;
      }
      const ctrl = new AbortController();
      abort.current = ctrl;
      setError(null);
      setToolLabel(null);
      setPhase('thinking');
      setSubtitle({ text: question, progress: 1, who: 'ty' });
      setExchanges((prev) => [...prev.slice(-3), { q: question, a: '' }]);

      let answer = '';
      let spokenUpTo = 0;
      let saidWait = false;
      let speaking: Promise<void> = Promise.resolve();
      const speakChunk = (chunk: string) => {
        if (!chunk.trim()) return;
        speaking = speaker.say(chunk, (f) => {
          if (id !== run.current) return;
          if (phaseRef.current !== 'speaking') setPhase('speaking');
          setSubtitle({ text: speakable(chunk), progress: f, who: 'jarvis' });
        });
      };
      // celé věty čteme hned, jak dorazí
      const flush = (final: boolean) => {
        const rest = answer.slice(spokenUpTo);
        if (final) {
          spokenUpTo = answer.length;
          return speakChunk(rest);
        }
        const m = /^[\s\S]*[.!?…](?=\s)/.exec(rest);
        if (m) {
          spokenUpTo += m[0].length;
          speakChunk(m[0]);
        }
      };
      try {
        await sendMessage(
          'ondik',
          question,
          (delta) => {
            if (id !== run.current) return;
            answer += delta;
            setToolLabel(null);
            setExchanges((prev) => prev.map((e, i) => (i === prev.length - 1 ? { ...e, a: answer } : e)));
            flush(false);
          },
          ctrl.signal,
          (label) => {
            if (id !== run.current) return;
            setToolLabel(label);
            if (!saidWait && !answer) {
              saidWait = true;
              speakChunk('Okamžik, prosím.');
            }
          },
          (a) => id === run.current && setPosters((prev) => [...prev.filter((p) => p.id !== a.id), a]),
          { briefingId: briefingRef.current?.id },
        );
        if (id !== run.current) return;
        flush(true);
        await speaking;
        if (id !== run.current) return;
        setToolLabel(null);
        // rozhovor pokračuje: Jarvis zase poslouchá (když je ticho, přestane)
        if (!micReason && !micDeniedRef.current) startListening();
        else setPhase('idle');
      } catch (err) {
        if (id !== run.current || ctrl.signal.aborted) return;
        setToolLabel(null);
        setError(err instanceof Error ? err.message : 'Něco se pokazilo.');
        setPhase('error');
      }
    },
    [halt, speaker, setPhase, micReason, startListening],
  );

  // ------------------------------------------------------------ hlášení

  const play = useCallback(
    async (b: Briefing, from = 0) => {
      halt();
      const id = run.current;
      setError(null);
      setOnAir(true);
      // hudba hraje po celou dobu hlášení (při „Znovu“ se pustí znovu)
      if (!music.playing && introRef.current.on && introInfoRef.current) {
        await music.start(introRef.current.volume);
        if (id !== run.current) return;
      }
      for (let i = from; i < b.segments.length; i++) {
        if (id !== run.current) return;
        const seg = b.segments[i];
        // přechod mezi částmi: velký nápis sekce, hudba se na chvilku zesílí
        if (seg.kind !== 'uvod' && seg.kind !== 'otazka') {
          setTitleCard({ key: Date.now(), label: KIND_LABEL[seg.kind], icon: KIND_ICON[seg.kind] });
          if (music.playing) music.swell();
          await new Promise((r) => setTimeout(r, 950));
          if (id !== run.current) return;
          setTitleCard(null);
        }
        setSegIndex(i);
        setSubtitle({ text: seg.text, progress: 0, who: 'jarvis' });
        setPhase('speaking');
        if (music.playing) music.duck();
        await speaker.say(seg.say, (f) => id === run.current && setSubtitle({ text: seg.text, progress: f, who: 'jarvis' }));
        if (id !== run.current) return;
        if (speaker.blocked) {
          // prohlížeč nedovolil mluvit bez kliknutí – počkáme na klepnutí a pokračujeme od této části
          resumeAt.current = { b, i };
          music.stop();
          setOnAir(false);
          setPhase('tap');
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (id !== run.current) return;
      // konec hlášení: hudba dozní, Jarvis poslouchá odpověď
      music.fadeOut(2500);
      setOnAir(false);
      if (!micReason && !micDeniedRef.current) startListening();
      else setPhase('idle');
    },
    [halt, speaker, setPhase, micReason, startListening, music],
  );

  const fetchBriefing = useCallback(async () => {
    halt();
    const id = run.current;
    setPhase('preparing');
    setError(null);
    setSubtitle(null);
    setSegIndex(-1);
    // úvodní hudba hraje, zatímco se hlášení připravuje
    const withMusic = introRef.current.on && !!introInfoRef.current;
    if (withMusic) void music.start(introRef.current.volume);
    else chime('start');
    try {
      const [b, vs] = await Promise.all([createBriefing(), loadVoices()]);
      if (id !== run.current) return;
      setVoices(vs);
      briefingRef.current = b;
      setBriefing(b);
      if (music.playing) {
        // hudba hraje naplno nastavenou dobu, pak se ztlumí pod hlas
        const wait = introRef.current.seconds - music.elapsed();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
        if (id !== run.current) return;
      }
      void play(b);
    } catch (err) {
      music.fadeOut(1000);
      if (id !== run.current) return;
      setError(err instanceof Error ? err.message : 'Hlášení se nepodařilo připravit.');
      setPhase('error');
    }
  }, [halt, play, setPhase]);

  // hlas podle nastavení
  useEffect(() => {
    speaker.voice = pickVoice(voices, settings.voiceURI);
    speaker.rate = settings.rate;
    saveSettings(settings);
  }, [voices, settings, speaker]);
  useEffect(() => {
    void loadVoices().then(setVoices);
  }, []);

  // start: po otevření rovnou hlášení
  useEffect(() => {
    if (serverOnline) {
      void begin();
    } else {
      setError('Jarvis běží na tvém počítači – spusť městečko ikonou na ploše.');
      setPhase('error');
    }
    // jen při otevření
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Zahájení: zjistí úvodní hudbu a spustí hlášení (u autopilota jen, když prohlížeč dovolí zvuk). */
  const begin = useCallback(async () => {
    if (auto && !(await canAutoplay())) {
      setPhase('tap');
      return;
    }
    {
      void fetchIntroInfo()
        .catch(() => null)
        .then((info) => {
          introInfoRef.current = info;
          setIntroInfo(info);
          return info && introRef.current.on ? music.load() : false;
        })
        .then(() => fetchBriefing());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  /** Klepnutí, když prohlížeč čekal na souhlas se zvukem. */
  const tapToStart = () => {
    speaker.blocked = false;
    const r = resumeAt.current;
    resumeAt.current = null;
    if (r) void play(r.b, r.i);
    else if (briefingRef.current) void play(briefingRef.current);
    else {
      void fetchIntroInfo()
        .catch(() => null)
        .then((info) => {
          introInfoRef.current = info;
          setIntroInfo(info);
          return info && introRef.current.on ? music.load() : false;
        })
        .then(() => fetchBriefing());
    }
  };
  useEffect(() => saveAutopilot(autopilot), [autopilot]);

  useEffect(() => {
    if (phase !== 'preparing') return;
    const t = setInterval(() => setPrepLine((n) => (n + 1) % PREP_LINES.length), 1400);
    return () => clearInterval(t);
  }, [phase]);

  // klávesy: Esc = zavřít, mezerník = mluvit/přestat
  useEffect(() => () => music.stop(), [music]);
  useEffect(() => saveIntroSettings(intro), [intro]);

  const close = useCallback(() => {
    halt();
    music.stop();
    chime('end');
    onClose();
  }, [halt, onClose, music]);
  closeRef.current = close;
  const toggleMic = useCallback(() => {
    if (phaseRef.current === 'listening') {
      stopListen.current();
      return;
    }
    startListening();
  }, [startListening]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') close();
      else if (e.code === 'Space' && !typing) {
        e.preventDefault();
        toggleMic();
      }
    };
    // zachytávací fáze: klávesa dorazí k Jarvisovi dřív, než ji cokoli jiného na stránce pohltí
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, toggleMic]);

  const stop = () => {
    halt();
    music.fadeOut(500);
    setToolLabel(null);
    setPhase('idle');
  };

  // ------------------------------------------------------------ vykreslení

  const orbState: OrbState = phase === 'preparing' || phase === 'thinking' ? 'thinking' : phase === 'error' ? 'error' : phase === 'listening' ? 'listening' : phase === 'speaking' ? 'speaking' : 'idle';
  const segments = briefing?.segments ?? [];
  const current: BriefingSegment | undefined = segments[segIndex];
  const revealed = segments.slice(0, segIndex + 1);
  const newsCards = revealed.map((s, i) => ({ s, i })).filter(({ s }) => (s.kind === 'svet' || s.kind === 'cesko' || s.kind === 'region' || s.kind === 'tym') && s.items.length > 0);
  const showWeather = !!briefing?.weather && segIndex >= 0;
  const showProgram = revealed.some((s) => s.kind === 'program');
  const crawl = useMemo(() => {
    if (!briefing) return [] as { tag: string; text: string }[];
    const out: { tag: string; text: string }[] = [];
    const w = briefing.weather;
    if (w) out.push({ tag: 'POČASÍ', text: `Lipník ${Math.round(w.temp)} °C, ${w.text.toLowerCase()}` });
    for (const sg of briefing.segments) for (const n of sg.items) out.push({ tag: KIND_LABEL[sg.kind].toUpperCase(), text: n.title });
    for (const e of briefing.events.slice(0, 3)) out.push({ tag: 'PROGRAM', text: `${e.allDay ? 'celý den' : e.start.slice(11, 16)} ${e.summary}` });
    return out.length ? out : [{ tag: 'JARVIS', text: 'Městečko Ondik' }];
  }, [briefing]);
  const czech = czechVoices(voices);
  const noCzechVoice = ttsSupported() && voices.length > 0 && !czech.length;
  const statusText =
    phase === 'tap'
      ? 'Jarvis má pro vás hlášení'
      : phase === 'preparing'
      ? PREP_LINES[prepLine]
      : phase === 'listening'
        ? interim || 'Poslouchám…'
        : phase === 'thinking'
          ? (toolLabel ?? 'Přemýšlím…')
          : phase === 'speaking'
            ? toolLabel
            : phase === 'idle'
              ? micReason
                ? 'Napište mi dole, s čím pomoct.'
                : 'Stiskněte mikrofon nebo mezerník a mluvte.'
              : null;

  return (
    <div className={`jarvis jarvis-${phase}${onAir ? ' jarvis-onair' : ''}`} role="dialog" aria-modal="true" aria-label="Jarvis">
      <div className="jv-aurora" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="jarvis-scan" aria-hidden />
      <header className="jarvis-top">
        <div className="jarvis-brand">
          <span className="jarvis-brand-dot" />
          J.A.R.V.I.S.
          <small>Městečko Ondik</small>
        </div>
        {segments.length > 0 && (
          <nav className="jarvis-steps" aria-label="Části hlášení">
            {segments.map((s, i) => (
              <button
                key={i}
                className={i === segIndex ? 'active' : i < segIndex ? 'done' : ''}
                onClick={() => briefing && void play(briefing, i)}
                title={`Přehrát od: ${KIND_LABEL[s.kind]}`}
              >
                <span className="jarvis-step-label">
                  {KIND_ICON[s.kind]} {KIND_LABEL[s.kind]}
                </span>
                <span className="jarvis-step-bar">
                  <span style={{ width: `${i < segIndex ? 100 : i === segIndex ? Math.round((subtitle?.who === 'jarvis' ? subtitle.progress : 0) * 100) : 0}%` }} />
                </span>
              </button>
            ))}
          </nav>
        )}
        <div className="jarvis-top-right">
          <button className="jarvis-icon" onClick={() => setShowSettings((v) => !v)} title="Nastavení hlasu" aria-label="Nastavení hlasu">
            ⚙
          </button>
          <button className="jarvis-icon" onClick={close} title="Zavřít (Esc)" aria-label="Zavřít Jarvise">
            ✕
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="jarvis-settings">
          <label>
            Hlas
            <select value={speaker.voice?.voiceURI ?? ''} onChange={(e) => setSettings((s) => ({ ...s, voiceURI: e.target.value || null }))}>
              {!czech.length && <option value="">— český hlas nenalezen (jen titulky) —</option>}
              {czech.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rychlost {settings.rate.toFixed(2).replace('.', ',')}×
            <input type="range" min={0.8} max={1.35} step={0.05} value={settings.rate} onChange={(e) => setSettings((s) => ({ ...s, rate: Number(e.target.value) }))} />
          </label>
          <button
            onClick={() => {
              halt();
              void speaker.say('Dobrý den. Všechny systémy jsou připraveny.');
            }}
          >
            ▶ Vyzkoušet hlas
          </button>
          <div className="jarvis-intro">
            <strong>🤖 Autopilot</strong>
            <label className="jarvis-check">
              <input type="checkbox" checked={autopilot.greetOnStart} onChange={(e) => setAutopilot((a) => ({ ...a, greetOnStart: e.target.checked }))} />
              Pozdravit hlášením po spuštění městečka (nejvýš jednou za 3 h)
            </label>
            <label className="jarvis-check">
              <input type="checkbox" checked={!!autopilot.morning} onChange={(e) => setAutopilot((a) => ({ ...a, morning: e.target.checked ? '07:00' : '' }))} />
              Ranní hlášení v
              <input
                type="time"
                value={autopilot.morning}
                disabled={!autopilot.morning}
                onChange={(e) => setAutopilot((a) => ({ ...a, morning: e.target.value }))}
                aria-label="Čas ranního hlášení"
              />
            </label>
            <label className="jarvis-check">
              <input type="checkbox" checked={autopilot.speakReminders} onChange={(e) => setAutopilot((a) => ({ ...a, speakReminders: e.target.checked }))} />
              Říkat nahlas připomínky z kalendáře
            </label>
          </div>
          <div className="jarvis-intro">
            <strong>🎸 Úvodní hudba</strong>
            {introInfo ? (
              <div className="jarvis-intro-file">
                <span title={introInfo.name}>{introInfo.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    halt();
                    if (music.playing) music.fadeOut(600);
                    else void music.start(intro.volume);
                  }}
                >
                  ▶/⏹
                </button>
                <button
                  type="button"
                  onClick={() => {
                    music.reset();
                    void deleteIntro().then(() => {
                      introInfoRef.current = null;
                      setIntroInfo(null);
                    });
                  }}
                >
                  🗑
                </button>
              </div>
            ) : (
              <small>Nahraj vlastní hudbu (MP3, M4A…, do 25 MB) – zahraje na začátku hlášení. Soubor zůstane jen na tvém počítači.</small>
            )}
            <label className="jarvis-upload">
              {introBusy ?? (introInfo ? 'Nahrát jinou' : 'Nahrát hudbu')}
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setIntroBusy('Nahrávám…');
                  music.reset();
                  uploadIntro(f)
                    .then((info) => {
                      introInfoRef.current = info;
                      setIntroInfo(info);
                      setError(null);
                    })
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Nahrání se nepovedlo.'))
                    .finally(() => setIntroBusy(null));
                }}
              />
            </label>
            {introInfo && (
              <>
                <label className="jarvis-check">
                  <input type="checkbox" checked={intro.on} onChange={(e) => setIntro((s) => ({ ...s, on: e.target.checked }))} />
                  Pouštět na začátku hlášení
                </label>
                <label>
                  Naplno {intro.seconds} s, pak ztlumit pod hlas
                  <input type="range" min={3} max={30} step={1} value={intro.seconds} onChange={(e) => setIntro((s) => ({ ...s, seconds: Number(e.target.value) }))} />
                </label>
                <label>
                  Hlasitost {Math.round(intro.volume * 100)} %
                  <input type="range" min={0.1} max={1} step={0.05} value={intro.volume} onChange={(e) => setIntro((s) => ({ ...s, volume: Number(e.target.value) }))} />
                </label>
              </>
            )}
          </div>
          {(noCzechVoice || !ttsSupported()) && (
            <p>
              Prohlížeč nemá český hlas. Nejlepší jsou v <strong>Microsoft Edge</strong> (Antonín, Vlasta). Ve Windows lze přidat i hlas: Nastavení → Čas a jazyk → Řeč → Přidat hlasy →
              čeština.
            </p>
          )}
        </div>
      )}

      {onAir && briefing && current ? (
        <div className="jv-broadcast">
          <div className="jv-presenter">
            <div className="jv-presenter-orb">
              <JarvisOrb state={orbState} level={level} />
            </div>
            <div className="jv-presenter-name">
              <strong>JARVIS</strong>
              <span>osobní asistent</span>
            </div>
            <div className="jv-live">
              <i /> ŽIVĚ · {now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="jv-screen">
            <BriefingStage key={segIndex} seg={current} briefing={briefing} progress={subtitle?.who === 'jarvis' ? subtitle.progress : 0} now={now} />
            {titleCard && (
              <div className="jv-titlecard" key={titleCard.key}>
                <span className="jv-titlecard-icon">{titleCard.icon}</span>
                <span className="jv-titlecard-label">{titleCard.label}</span>
                <span className="jv-titlecard-streak" />
              </div>
            )}
          </div>
          <div className="jv-lower-third" aria-live="polite">
            <span className="jv-lower-tag">
              {KIND_ICON[current.kind]} {KIND_LABEL[current.kind]}
            </span>
            <p key={segIndex}>{subtitle && subtitle.who === 'jarvis' ? <Highlighted text={subtitle.text} progress={subtitle.progress} /> : current.text}</p>
          </div>
          <div className="jv-crawl" aria-hidden>
            <div className="jv-crawl-run" style={{ animationDuration: `${Math.max(40, crawl.length * 7)}s` }}>
              {[...crawl, ...crawl].map((c, k) => (
                <span key={k}>
                  <b>{c.tag}</b> {c.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <div className="jarvis-main">
        <aside className="jarvis-cards" aria-label="Přehled">
          {showWeather && briefing?.weather && (
            <div className={`jv-card${current?.kind === 'uvod' || current?.kind === 'pocasi' ? ' active' : ''}`}>
              <div className="jv-card-head">📍 Lipník nad Bečvou</div>
              <div className="jarvis-weather">
                <time>{now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
                <span className="jarvis-temp">
                  {briefing.weather.icon} {Math.round(briefing.weather.temp)}°
                </span>
              </div>
              <small>
                {briefing.weather.text}
                {briefing.weather.min !== undefined && briefing.weather.max !== undefined && ` · ${Math.round(briefing.weather.min)}° / ${Math.round(briefing.weather.max)}°`}
              </small>
            </div>
          )}
          {newsCards.map(({ s, i }) => (
            <div key={i} className={`jv-card${i === segIndex ? ' active' : ''}`}>
              <div className="jv-card-head">
                {KIND_ICON[s.kind]} {KIND_LABEL[s.kind]}
              </div>
              <ul>
                {s.items.map((n) => (
                  <li key={n.link || n.title}>
                    <a href={n.link} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>
                    <small>{n.source}</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {showProgram && briefing && (
            <div className={`jv-card${current?.kind === 'program' ? ' active' : ''}`}>
              <div className="jv-card-head">📅 Program</div>
              {!briefing.calendarConnected ? (
                <small>Kalendář není propojený – propoj ho u Chronose.</small>
              ) : briefing.events.length ? (
                <ul className="jarvis-events">
                  {briefing.events.slice(0, 5).map((e, k) => (
                    <li key={k}>
                      <span>{e.allDay ? 'celý den' : e.start.slice(11, 16)}</span>
                      {e.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>Dnes ani zítra nic v kalendáři.</small>
              )}
            </div>
          )}
          {posters.map((p) =>
            p.kind === 'link' ? (
              <button key={p.id} className="jv-card jarvis-poster jarvis-link" onClick={() => launch(p.url)}>
                <div className="jv-card-head">▶️ {onServerPc() ? 'Otevřeno v prohlížeči' : 'Odkaz od Klika'}</div>
                <strong>{p.title}</strong>
                <small>{onServerPc() ? 'Otevřít znovu →' : 'Klepni pro otevření →'}</small>
              </button>
            ) : (
              <button
                key={p.id}
                className="jv-card jarvis-poster"
                onClick={() => {
                  close();
                  onOpenResearch(p.id);
                }}
              >
                <div className="jv-card-head">📜 Plakátek od Lexy</div>
                <strong>{p.title}</strong>
                <small>Otevřít →</small>
              </button>
            ),
          )}
        </aside>

        <section className={`jarvis-center${helpOpen && micDenied ? ' with-help' : ''}`}>
          <div className="jv-orb">
            <JarvisOrb state={orbState} level={level} />
          </div>
          <div className="jarvis-status" aria-live="polite">
            {statusText}
          </div>
          <div className="jarvis-subtitle" aria-live="polite">
            {subtitle && (
              <p className={subtitle.who === 'ty' ? 'from-user' : ''}>
                {subtitle.who === 'ty' && <span className="jarvis-who">Vy: </span>}
                <Highlighted text={subtitle.text} progress={subtitle.who === 'ty' ? 1 : subtitle.progress} />
              </p>
            )}
          </div>
          {phase === 'tap' && (
            <button className="jarvis-tap-btn" onClick={tapToStart} autoFocus>
              ▶ Spustit hlášení
            </button>
          )}
          {error && (
            <div className="jarvis-error-box" role="alert">
              {error}
            </div>
          )}
          {micDenied && !helpOpen && (
            <button className="jarvis-help-toggle" onClick={() => setHelpOpen(true)}>
              🎙️ Mikrofon je zakázaný – jak ho povolit ▸
            </button>
          )}
          {micDenied && helpOpen && (
            <div className="jarvis-help" role="alert">
              <strong>🎙️ Mikrofon je zakázaný – takhle ho znovu povolíš:</strong>
              <ol>
                <li>
                  Nejjednodušší: ve složce městečka dvakrát klikni na <b>Povolit-mikrofon.bat</b>. Zavře okno, smaže uložená oprávnění a městečko znovu otevře – pak u
                  Jarvise klikni na mikrofon a dej <b>Povolit</b>.
                </li>
                <li>
                  Nebo v okně městečka: <b>⋯</b> vpravo nahoře → <b>Oprávnění webu</b> (případně <b>Informace o aplikaci</b>) → Mikrofon → <b>Povolit</b> a stiskni <b>F5</b>.
                </li>
                <li>Když to ani tak nejde: Windows → Nastavení → Ochrana osobních údajů → Mikrofon → zapnout přístup pro aplikace (i klasické).</li>
              </ol>
              <button
                onClick={() => {
                  setHelpOpen(false);
                  setMicDenied(false);
                  startListening();
                }}
              >
                Zkusit znovu
              </button>
              <button onClick={() => setHelpOpen(false)}>Skrýt</button>
            </div>
          )}
        </section>

        <aside className="jarvis-log" aria-label="Rozhovor">
          {exchanges.map((e, i) => (
            <div key={i} className="jarvis-exchange">
              <p className="q">
                <span>Vy</span>
                {e.q}
              </p>
              {e.a && (
                <p className="a">
                  <span>Jarvis</span>
                  {e.a}
                </p>
              )}
            </div>
          ))}
        </aside>
      </div>
      )}

      <footer className="jarvis-controls">
        <button className={`jarvis-mic${phase === 'listening' ? ' on' : ''}`} onClick={toggleMic} disabled={!!micReason} title={micReason ?? 'Mluvit (mezerník)'} aria-label="Mluvit">
          <span className="jarvis-mic-ring" />
          🎙️
        </button>
        <form
          className="jarvis-type"
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed.trim();
            if (!t) return;
            setTyped('');
            void ask(t);
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={micReason ? 'Napište Jarvisovi…' : 'Nebo napište…'} aria-label="Zpráva pro Jarvise" />
        </form>
        <div className="jarvis-buttons">
          {(phase === 'speaking' || phase === 'thinking' || phase === 'listening') && <button onClick={stop}>⏹ Stop</button>}
          {briefing && phase !== 'preparing' && <button onClick={() => void play(briefing)}>↻ Znovu</button>}
          {phase !== 'preparing' && serverOnline && <button onClick={() => void fetchBriefing()}>⚡ Nové hlášení</button>}
        </div>
      </footer>
    </div>
  );
}

/** Text titulku: přečtená část svítí, zbytek je ztlumený. */
function Highlighted({ text, progress }: { text: string; progress: number }) {
  const words = text.split(/(\s+)/);
  const upto = Math.round(progress * text.length);
  let pos = 0;
  return (
    <>
      {words.map((w, i) => {
        const start = pos;
        pos += w.length;
        return (
          <span key={i} className={start < upto ? 'said' : 'unsaid'}>
            {w}
          </span>
        );
      })}
    </>
  );
}
