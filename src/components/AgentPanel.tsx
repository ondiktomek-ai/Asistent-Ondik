import type { AgentDef, AgentStatus } from '../world/types';
import { Robot } from './Robot';

const STATUS_LABEL: Record<AgentStatus, string> = {
  setup: 'Čeká na nastavení',
  idle: 'Připraven',
  working: 'Pracuje',
  offline: 'Mimo provoz',
};

export function AgentPanel({ agent, onClose }: { agent: AgentDef | null; onClose: () => void }) {
  return (
    <aside className={`panel${agent ? ' open' : ''}`} aria-hidden={!agent}>
      {agent && (
        <div className="panel-inner" style={{ ['--accent' as string]: agent.color }}>
          <button className="panel-close" onClick={onClose} aria-label="Zavřít">
            ×
          </button>
          <header className="panel-head">
            <svg viewBox="-30 -66 60 80" className="panel-avatar" aria-hidden>
              <Robot x={0} y={0} scale={1} color={agent.color} icon={agent.icon} name={agent.name} />
            </svg>
            <div>
              <div className="panel-room">
                {agent.icon} {agent.roomName}
              </div>
              <h2>{agent.name}</h2>
              <div className="panel-role">{agent.role}</div>
              <span className={`status status-${agent.status}`}>{STATUS_LABEL[agent.status]}</span>
            </div>
          </header>

          <p className="panel-desc">{agent.description}</p>

          <section>
            <h3>Náplň práce</h3>
            <ul className="duties">
              {agent.duties.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Nástroje</h3>
            <ul className="tools">
              {agent.tools.map((t) => (
                <li key={t.name}>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.description}</span>
                  </div>
                  <span className={`badge badge-${t.status}`}>{t.status === 'connected' ? 'Připojeno' : 'Plánováno'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Zadat úkol</h3>
            <div className="chat-placeholder">
              <input disabled placeholder="Napiš zprávu…" />
              <button disabled>Odeslat</button>
            </div>
            <p className="hint">Komunikace s agenty přijde v další fázi – nejdřív je nastavíme.</p>
          </section>
        </div>
      )}
    </aside>
  );
}
