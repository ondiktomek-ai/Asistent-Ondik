import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBriefing, sendMessage, type Briefing, type BriefingSegment, type ChatAttachment, type SegmentKind } from '../api';
import { JarvisOrb, type OrbState } from './JarvisOrb';
import { Speaker, chime, czechVoices, listen, loadSettings, loadVoices, micUnavailableReason, pickVoice, saveSettings, speakable, ttsSupported, type VoiceSettings } from './speech';

export type JarvisPhase = 'preparing' | 'speaking' | 'listening' | 'thinking' | 'idle' | 'error';

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

const PREP_LINES = ['Probouzím systémy…', 'Kontroluji počasí v Lipníku…', 'Čtu zprávy ze světa…', 'Procházím české zprávy…', 'Dívám se do okolí Lipníku…', 'Nahlížím do kalendáře…', 'Skládám hlášení…'];

interface Props {
  serverOnline: boolean;
  onClose: () => void;
  onPhase: (phase: JarvisPhase | null, label?: string) => void;
  onOpenResearch: (id: string) => void;
}

interface Exchange {
  q: string;
  a: string;
}

/** Celoobrazovkový Jarvis: mluvené hlášení a hlasový rozhovor. */
export function JarvisOverlay({ serverOnline, onClose, onPhase, onOpenResearch }: Props) {
  const speaker = useRef(new Speaker()).current;
  const mic = useRef({ level: 0 }).current;
  const [phase, setPhaseState] = useState<JarvisPhase>('preparing');
  const phaseRef = useRef<JarvisPhase>('preparing');
  const setPhase = useCallback((p: JarvisPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  // koule čte hlasitost: při poslechu z mikrofonu, jinak z hlasu
  const level = useMemo(() => ({ get level() { return phaseRef.current === 'listening' ? mic.level : speaker.level; } }), [mic, speaker]);

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
    const id = run.current;
    setError(null);
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
          if (err) setError(err);
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
      const id = run.current;
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
        if (!micReason) startListening();
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
      for (let i = from; i < b.segments.length; i++) {
        if (id !== run.current) return;
        const seg = b.segments[i];
        setSegIndex(i);
        setSubtitle({ text: seg.text, progress: 0, who: 'jarvis' });
        setPhase('speaking');
        await speaker.say(seg.say, (f) => id === run.current && setSubtitle({ text: seg.text, progress: f, who: 'jarvis' }));
        if (id !== run.current) return;
        await new Promise((r) => setTimeout(r, 280));
      }
      if (id !== run.current) return;
      if (!micReason) startListening();
      else setPhase('idle');
    },
    [halt, speaker, setPhase, micReason, startListening],
  );

  const fetchBriefing = useCallback(async () => {
    halt();
    const id = run.current;
    setPhase('preparing');
    setError(null);
    setSubtitle(null);
    setSegIndex(-1);
    chime('start');
    try {
      const [b, vs] = await Promise.all([createBriefing(), loadVoices()]);
      if (id !== run.current) return;
      setVoices(vs);
      briefingRef.current = b;
      setBriefing(b);
      void play(b);
    } catch (err) {
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
    if (serverOnline) void fetchBriefing();
    else {
      setError('Jarvis běží na tvém počítači – spusť městečko ikonou na ploše.');
      setPhase('error');
    }
    // jen při otevření
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'preparing') return;
    const t = setInterval(() => setPrepLine((n) => (n + 1) % PREP_LINES.length), 1400);
    return () => clearInterval(t);
  }, [phase]);

  // klávesy: Esc = zavřít, mezerník = mluvit/přestat
  const close = useCallback(() => {
    halt();
    chime('end');
    onClose();
  }, [halt, onClose]);
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, toggleMic]);

  const stop = () => {
    halt();
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
  const czech = czechVoices(voices);
  const noCzechVoice = ttsSupported() && voices.length > 0 && !czech.length;
  const statusText =
    phase === 'preparing'
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
    <div className={`jarvis jarvis-${phase}`} role="dialog" aria-modal="true" aria-label="Jarvis">
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
                <span>{KIND_ICON[s.kind]}</span>
                {KIND_LABEL[s.kind]}
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
          {(noCzechVoice || !ttsSupported()) && (
            <p>
              Prohlížeč nemá český hlas. Nejlepší jsou v <strong>Microsoft Edge</strong> (Antonín, Vlasta). Ve Windows lze přidat i hlas: Nastavení → Čas a jazyk → Řeč → Přidat hlasy →
              čeština.
            </p>
          )}
        </div>
      )}

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
          {posters.map((p) => (
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
          ))}
        </aside>

        <section className="jarvis-center">
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
          {error && (
            <div className="jarvis-error" role="alert">
              {error}
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
