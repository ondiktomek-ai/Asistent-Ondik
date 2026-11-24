import { useCallback, useEffect, useState } from 'react';
import { fetchStatus, type ServerStatus } from './api';
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

      <main className="stage">
        <div className="world-wrap">
          <World3D time={time} lightMode={lightMode} selectedId={selectedId} onSelect={setSelectedId} busy={busy} />
          <div className="world-hint">Táhni = otočit · kolečko = přiblížit · klik na box = detail</div>
        </div>
        <AgentPanel
          agent={selected}
          vacant={isVacantId(selectedId)}
          status={status}
          onClose={() => setSelectedId(null)}
          onStatusChange={refreshStatus}
          onBusyChange={setAgentBusy}
        />
      </main>
    </div>
  );
}
