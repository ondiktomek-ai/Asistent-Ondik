import { useEffect, useState } from 'react';
import { AGENTS, AGENT_BY_ID } from './world/agents';
import { VACANT_ID } from './world/layout';
import { World } from './components/World';
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
          <span className="logo">🏢</span>
          <div>
            <h1>Kancelář Ondik</h1>
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
          <time className="clock">{time.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      </header>

      <main className="stage">
        <div className="world-wrap">
          <World time={time} lightMode={lightMode} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <AgentPanel agent={selected} vacant={selectedId === VACANT_ID} onClose={() => setSelectedId(null)} />
      </main>
    </div>
  );
}
