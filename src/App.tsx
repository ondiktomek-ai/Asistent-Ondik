import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBitStatus,
  fetchTeam,
  startUpdate,
  onServerPc,
  fetchUsage,
  type SpendSummary,
  type TeamTask,
  fetchDigest,
  fetchResearchPoster,
  fetchResearchPosters,
  fetchStatus,
  startGoogleAuth,
  type BitAlert,
  type BitReport,
  type Digest,
  type ResearchPoster,
  type ServerStatus,
} from './api';
import { useNewsroom } from './hooks/useNewsroom';
import { useReminders } from './hooks/useReminders';
import { NewsBar } from './components/NewsBar';
import { InfoPanel, type TownItem } from './components/InfoPanel';
import { JarvisOverlay, type JarvisPhase } from './jarvis/JarvisOverlay';
import { loadAutopilot, takeMorningBriefing, takeStartGreeting } from './jarvis/autopilot';
import { Speaker, loadSettings as loadVoiceSettings, loadVoices, pickVoice } from './jarvis/speech';
import { ResearchPosterView } from './components/ResearchPosterView';
import { DigestPoster } from './components/DigestPoster';
import { AGENTS, AGENT_BY_ID } from './world/agents';
import { isVacantId } from './world/layout';
import { World3D } from './world3d/World3D';
import { AgentPanel } from './components/AgentPanel';
import { useClock, type LightMode } from './hooks/useClock';

const LIGHT_MODES: { id: LightMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'day', label: '☀️ Den' },
  { id: 'night', label: '🌙 Noc' },
];

export default function App() {
  const time = useClock();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightMode, setLightMode] = useState<LightMode>('auto');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const refreshStatus = useCallback(() => {
    void fetchStatus().then(setStatus);
  }, []);
  useEffect(refreshStatus, [refreshStatus]);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const setAgentBusy = useCallback((agentId: string, isBusy: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (isBusy) next.add(agentId);
      else next.delete(agentId);
      return next;
    });
  }, []);
  const selected = selectedId ? (AGENT_BY_ID[selectedId] ?? null) : null;

  // --- Porada na radnici ---
  const [meetingId, setMeetingId] = useState(0);
  const [meetingActive, setMeetingActive] = useState(false);
  const startMeeting = () => {
    if (meetingActive) return;
    setSelectedId(null);
    setMeetingActive(true);
    setMeetingId((n) => n + 1);
  };
  const endMeeting = useCallback(() => setMeetingActive(false), []);

  // --- Jarvis: hlasové hlášení a rozhovor ---
  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [jarvisState, setJarvisState] = useState<{ phase: JarvisPhase; label?: string } | null>(null);
  const onJarvisPhase = useCallback((phase: JarvisPhase | null, label?: string) => setJarvisState(phase ? { phase, label } : null), []);
  const [jarvisAuto, setJarvisAuto] = useState(false);
  const openJarvis = useCallback((auto = false) => {
    setSelectedId(null);
    setJarvisAuto(auto);
    setJarvisOpen(true);
  }, []);
  // rychlé zadání úkolu odkudkoli (informační panel) → Ondik
  const [command, setCommand] = useState<{ id: number; text: string } | null>(null);
  const sendCommand = useCallback((text: string) => {
    setSelectedId('ondik');
    setCommand({ id: Date.now(), text });
  }, []);

  // --- Echo: zprávy, počasí, plakátky ---
  const serverOnline = !!status && (!status.authRequired || status.authorized);
  const newsroom = useNewsroom(serverOnline);
  // --- Tým: kdo komu zadal úkol, útrata ---
  const [teamActive, setTeamActive] = useState<TeamTask[]>([]);
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const anyBusy = busy.size > 0 || teamActive.length > 0;
  useEffect(() => {
    if (!serverOnline) return;
    // rychleji, když někdo pracuje (ať je vidět, kdo komu zadal úkol)
    const load = () =>
      fetchTeam()
        .then((r) => setTeamActive(r.active))
        .catch(() => {});
    load();
    const t = setInterval(load, anyBusy ? 2500 : 15_000);
    return () => clearInterval(t);
  }, [serverOnline, anyBusy]);
  useEffect(() => {
    if (!serverOnline) return;
    const load = () =>
      fetchUsage()
        .then(setSpend)
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [serverOnline, busy.size, teamActive.length]);

  const allBusy = useMemo(() => {
    const s = new Set(busy);
    if (newsroom.digests?.generating) s.add('echo');
    teamActive.forEach((t) => s.add(t.to));
    if (jarvisState?.label) s.add('ondik');
    return s;
  }, [busy, newsroom.digests?.generating, teamActive, jarvisState]);
  // co agent právě dělá v chatu (např. „Dívám se do kalendáře…“) – ukáže se v bublině nad robotem
  const [activity, setActivity] = useState<Record<string, string>>({});
  const onActivity = useCallback((agentId: string, label: string | null) => {
    setActivity((prev) => {
      const next = { ...prev };
      if (label) next[agentId] = label;
      else delete next[agentId];
      return next;
    });
  }, []);
  const busyLabels = useMemo<Record<string, string>>(() => {
    const labels: Record<string, string> = { ...activity };
    if (newsroom.digests?.generating) labels.echo = '📰 Píšu plakátek…';
    for (const t of teamActive) labels[t.to] ??= `🤝 Úkol od: ${AGENT_BY_ID[t.from]?.name ?? t.from}`;
    if (jarvisState?.label) labels.ondik ??= jarvisState.label;
    return labels;
  }, [activity, newsroom.digests?.generating, teamActive, jarvisState]);

  // --- Chronos: návrat z přihlášení Googlu (?kalendar=ok / chyba) ---
  const [calendarNotice, setCalendarNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [initialTab, setInitialTab] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get('kalendar');
    if (!k) return;
    setCalendarNotice(
      k === 'ok'
        ? { ok: true, text: '✓ Google Kalendář je propojený. Chronos teď vidí tvůj kalendář – zkus mu napsat „Co mám zítra?“.' }
        : { ok: false, text: params.get('zprava') ?? 'Propojení s Googlem se nepovedlo.' },
    );
    setInitialTab('kalendar');
    setSelectedId('chronos');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (selectedId !== 'chronos' && initialTab) {
      setInitialTab(null);
      setCalendarNotice(null);
    }
  }, [selectedId, initialTab]);

  // --- Bit: upozornění (např. přihlášení ke Googlu) ---
  const [bitAlerts, setBitAlerts] = useState<BitAlert[]>([]);
  const [bitReport, setBitReport] = useState<BitReport | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('bit-odlozeno') ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (!serverOnline) return;
    const load = () =>
      fetchBitStatus()
        .then((r) => {
          setBitAlerts(r.alerts);
          setBitReport(r);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [serverOnline, calendarNotice]);
  const visibleAlerts = bitAlerts.filter((a) => !(snoozed[a.id] > Date.now()));
  const snooze = (id: string) => {
    const next = { ...snoozed, [id]: Date.now() + 6 * 3600_000 };
    setSnoozed(next);
    try {
      localStorage.setItem('bit-odlozeno', JSON.stringify(next));
    } catch {
      // nevadí
    }
  };
  const googleLogin = useCallback(() => {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const openPanel = () => {
      setInitialTab('kalendar');
      setSelectedId('chronos');
    };
    if (!local) return openPanel();
    startGoogleAuth()
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch(openPanel);
  }, []);
  const robotNotes = useMemo(() => {
    const notes: Record<string, string> = {};
    if (bitAlerts.length) notes.bit = bitAlerts[0].text;
    return notes;
  }, [bitAlerts]);

  // --- Chronos: připomínky 10 minut před událostí ---
  const { reminders, dismiss, events } = useReminders(serverOnline && !!status?.google?.connected);

  // --- Aktualizace: spouštěč stáhne novou verzi, server se restartuje a stránka se sama obnoví ---
  const [updating, setUpdating] = useState<string | null>(null);
  const runUpdate = useCallback(() => {
    const before = status?.version ?? null;
    setUpdating('Stahuji novou verzi z GitHubu…');
    startUpdate()
      .then(() => {
        const started = Date.now();
        let wasDown = false;
        const t = setInterval(() => {
          void fetchStatus().then((st) => {
            if (!st) {
              wasDown = true;
              setUpdating('Sestavuji a restartuji městečko… (může to trvat pár minut)');
              return;
            }
            if ((st.version && st.version !== before) || (wasDown && st.version)) {
              clearInterval(t);
              setUpdating('Hotovo – načítám novou verzi…');
              setTimeout(() => window.location.reload(), 800);
            } else if (Date.now() - started > 10 * 60_000) {
              clearInterval(t);
              setUpdating(null);
            }
          });
        }, 3000);
      })
      .catch((err: unknown) => {
        setUpdating(null);
        alert(err instanceof Error ? err.message : 'Aktualizace se nepodařila.');
      });
  }, [status?.version]);

  // --- Autopilot: Jarvis sám pozdraví po spuštění a ráno přednese hlášení ---
  const jarvisOpenRef = useRef(jarvisOpen);
  jarvisOpenRef.current = jarvisOpen;
  const ready = serverOnline && !!status?.ready;
  useEffect(() => {
    // jen na počítači s městečkem – na telefonu by Jarvis vyskakoval při každém otevření
    if (!ready || !onServerPc()) return;
    // chvilku počkáme, ať se městečko načte
    const first = setTimeout(() => {
      if (!jarvisOpenRef.current && takeStartGreeting()) openJarvis(true);
    }, 2500);
    const t = setInterval(() => {
      if (!jarvisOpenRef.current && takeMorningBriefing()) openJarvis(true);
    }, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ready, openJarvis]);

  // připomínky z kalendáře Jarvis řekne nahlas
  const reminderVoice = useRef<Speaker | null>(null);
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    const fresh = reminders.filter((r) => !spoken.current.has(r.id + r.start));
    if (!fresh.length) return;
    fresh.forEach((r) => spoken.current.add(r.id + r.start));
    if (!loadAutopilot().speakReminders || jarvisOpenRef.current) return;
    void (async () => {
      const sp = (reminderVoice.current ??= new Speaker());
      const vs = loadVoiceSettings();
      sp.voice = pickVoice(await loadVoices(), vs.voiceURI);
      sp.rate = vs.rate;
      for (const r of fresh) await sp.say(`Pane, za ${r.minutes} ${r.minutes === 1 ? 'minutu' : r.minutes < 5 ? 'minuty' : 'minut'} vás čeká ${r.summary}.`);
    })();
  }, [reminders]);

  // --- Lexa: plakátky z rešerší ---
  const [research, setResearch] = useState<ResearchPoster | null>(null);
  const [researchRefresh, setResearchRefresh] = useState(0);
  const [lastResearch, setLastResearch] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!serverOnline) return;
    fetchResearchPosters()
      .then((r) => setLastResearch(r.posters[0] ? { id: r.posters[0].id, title: r.posters[0].title } : null))
      .catch(() => {});
  }, [serverOnline, researchRefresh]);
  const openResearch = useCallback((id: string) => {
    void fetchResearchPoster(id)
      .then((p) => {
        setResearch(p);
        setResearchRefresh((n) => n + 1);
      })
      .catch(() => {});
  }, []);

  // --- co se děje v městečku (pro informační panel) ---
  const [town, setTown] = useState<TownItem[]>([]);

  const [poster, setPoster] = useState<Digest | null>(null);
  const autoClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePoster = useCallback(() => {
    if (autoClose.current) clearTimeout(autoClose.current);
    setPoster(null);
  }, []);
  const openPoster = useCallback(
    (id?: string) => {
      if (autoClose.current) clearTimeout(autoClose.current);
      if (!id || id === newsroom.digests?.latest?.id) setPoster(newsroom.digests?.latest ?? null);
      else void fetchDigest(id).then(setPoster).catch(() => {});
    },
    [newsroom.digests?.latest],
  );
  // Nový hodinový plakátek se sám ukáže (a po 3 minutách zase schová).
  const latest = newsroom.digests?.latest;
  useEffect(() => {
    if (!latest) return;
    const KEY = 'echo-posledni-plakatek';
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(KEY);
    } catch {
      // bez úložiště prostě ukážeme
    }
    if (seen === latest.id || Date.now() - Date.parse(latest.createdAt) > 70 * 60_000) return;
    try {
      localStorage.setItem(KEY, latest.id);
    } catch {
      // nevadí
    }
    setPoster(latest);
    if (autoClose.current) clearTimeout(autoClose.current);
    autoClose.current = setTimeout(() => setPoster(null), 3 * 60_000);
  }, [latest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (typing || e.ctrlKey || e.metaKey || e.altKey || jarvisOpenRef.current) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        openJarvis();
      } else if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.info-command input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openJarvis]);

  return (
    <div className="app">
      <header className="hud">
        <div className="brand">
          <span className="logo">🏙️</span>
          <div>
            <h1>Městečko Ondik</h1>
            <span className="subtitle">Tvůj tým AI agentů</span>
          </div>
        </div>
        <nav className="roster" aria-label="Agenti">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              className={`chip${selectedId === a.id ? ' active' : ''}`}
              style={{ ['--accent' as string]: a.color }}
              onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}
            >
              <span className="dot" />
              {a.name}
            </button>
          ))}
        </nav>
        <div className="hud-right">
          <button className={`jarvis-btn${jarvisOpen ? ' on' : ''}`} onClick={() => openJarvis()} title="Jarvis: mluvené hlášení a hlasový rozhovor">
            <span className="jarvis-btn-orb" aria-hidden />
            Jarvis
          </button>
          <button className="meeting-btn" onClick={startMeeting} disabled={meetingActive} title="Všichni roboti se sejdou na radnici">
            {meetingActive ? '🏛️ Porada probíhá…' : '🏛️ Svolat poradu'}
          </button>
          <div className="segmented" role="group" aria-label="Osvětlení">
            {LIGHT_MODES.map((m) => (
              <button key={m.id} className={lightMode === m.id ? 'active' : ''} onClick={() => setLightMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <button
            className="icon-btn"
            onClick={toggleFullscreen}
            title={fullscreen ? 'Ukončit celou obrazovku (Esc)' : 'Celá obrazovka'}
            aria-label={fullscreen ? 'Ukončit celou obrazovku' : 'Celá obrazovka'}
          >
            {fullscreen ? '🗗' : '⛶'}
          </button>
          <time className="clock">{time.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      </header>

      <main className={`stage${selected || isVacantId(selectedId) ? ' panel-open' : ''}`}>
        <div className="world-wrap">
          <World3D time={time} lightMode={lightMode} selectedId={selectedId} onSelect={setSelectedId}
            busy={allBusy}
            busyLabels={busyLabels}
            meetingId={meetingId}
            meetingActive={meetingActive}
            onMeetingEnd={endMeeting}
            robotNotes={robotNotes}
            onTownSummary={setTown}
            jarvis={!!jarvisState && jarvisState.phase !== 'idle' && jarvisState.phase !== 'error'}
          />
          <div className="world-hint">Táhni = otočit · kolečko = přiblížit · klik na box = detail</div>
          {research && <ResearchPosterView poster={research} onClose={() => setResearch(null)} />}
          <NewsBar newsroom={newsroom} serverOnline={serverOnline} onOpenEcho={() => setSelectedId('echo')} />
          {poster && !jarvisOpen && <DigestPoster digest={poster} onClose={closePoster} />}
          {(reminders.length > 0 || visibleAlerts.length > 0) && (
            <div className="reminders" role="status">
              {visibleAlerts.map((a) => (
                <div key={a.id} className="reminder bit-alert">
                  <span className="reminder-icon">🔧</span>
                  <button className="reminder-body" onClick={() => setSelectedId('bit')}>
                    <strong>Bit: {a.text}</strong>
                    <span>Klikni pro podrobnosti</span>
                  </button>
                  {a.action === 'google-login' && (
                    <button className="reminder-action" onClick={googleLogin}>
                      Přihlásit
                    </button>
                  )}
                  {a.action === 'update' && (
                    <button className="reminder-action" onClick={runUpdate}>
                      Aktualizovat
                    </button>
                  )}
                  <button className="reminder-close" onClick={() => snooze(a.id)} aria-label="Připomenout později" title="Připomenout za 6 hodin">
                    ×
                  </button>
                </div>
              ))}
              {reminders.map((r) => (
                <div key={r.id} className="reminder">
                  <span className="reminder-icon">⏰</span>
                  <button className="reminder-body" onClick={() => setSelectedId('chronos')}>
                    <strong>
                      Za {r.minutes} min: {r.summary}
                    </strong>
                    <span>
                      {r.start.slice(11, 16)}
                      {r.location ? ` · ${r.location}` : ''}
                    </span>
                  </button>
                  <button className="reminder-close" onClick={() => dismiss(r.id)} aria-label="Zavřít připomínku">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <InfoPanel
          time={time}
          newsroom={newsroom}
          serverOnline={serverOnline}
          busy={allBusy}
          busyLabels={busyLabels}
          town={town}
          events={events}
          calendarConnected={!!status?.google?.connected}
          bitReport={bitReport}
          lastResearch={lastResearch}
          onCommand={serverOnline ? sendCommand : undefined}
          teamActive={teamActive}
          spend={spend}
          onSelect={setSelectedId}
          onOpenPoster={() => openPoster()}
          onOpenResearch={openResearch}
        />
        <AgentPanel
          agent={selected}
          vacant={isVacantId(selectedId)}
          status={status}
          onClose={() => setSelectedId(null)}
          onStatusChange={refreshStatus}
          onBusyChange={setAgentBusy}
          newsroom={newsroom}
          onOpenPoster={openPoster}
          onActivity={onActivity}
          calendarNotice={selectedId === 'chronos' ? calendarNotice : null}
          initialTab={selectedId === 'chronos' ? initialTab : null}
          onGoogleLogin={googleLogin}
          onOpenResearch={openResearch}
          researchRefresh={researchRefresh}
          command={selectedId === 'ondik' ? command : null}
          onCommandSent={() => setCommand(null)}
        />
      </main>
      {updating && (
        <div className="updating" role="status">
          <div className="updating-box">
            <span className="updating-spin" aria-hidden />
            <strong>Aktualizuji městečko</strong>
            <p>{updating}</p>
          </div>
        </div>
      )}
      {jarvisOpen && (
        <JarvisOverlay
          auto={jarvisAuto}
          serverOnline={serverOnline}
          onClose={() => setJarvisOpen(false)}
          onPhase={onJarvisPhase}
          onOpenResearch={openResearch}
        />
      )}
    </div>
  );
}
