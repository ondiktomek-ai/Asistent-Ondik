import { useState } from 'react';
import type { AgentDef, AgentStatus } from '../world/types';
import { Robot } from './Robot';
import { Chat } from './Chat';
import type { ServerStatus } from '../api';
import type { Newsroom } from '../hooks/useNewsroom';
import { ReporterPanel } from './ReporterPanel';

const STATUS_LABEL: Record<AgentStatus, string> = {
  setup: 'Čeká na nastavení',
  idle: 'Připraven',
  working: 'Pracuje',
  offline: 'Mimo provoz',
};

interface AgentPanelProps {
  agent: AgentDef | null;
  vacant?: boolean;
  status: ServerStatus | null;
  onClose: () => void;
  onStatusChange: () => void;
  onBusyChange: (agentId: string, busy: boolean) => void;
  newsroom: Newsroom;
  onOpenPoster: (id?: string) => void;
}

export function AgentPanel({ agent, vacant = false, status, onClose, onStatusChange, onBusyChange, newsroom, onOpenPoster }: AgentPanelProps) {
  const [echoTab, setEchoTab] = useState<'chat' | 'zpravy'>('chat');
  const open = !!agent || vacant;
  const connected = !!agent && !!status?.connectedAgents.includes(agent.id);
  const chatCapable = !!agent && (connected || agent.id === 'ondik');
  const serverOnline = !!status && (!status.authRequired || status.authorized);
  const isReporter = agent?.id === 'echo';
  const details = agent && (
    <>
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
    </>
  );
  const active = !!agent && !!status?.activeAgents?.includes(agent.id);
  const agentStatus: AgentStatus | undefined = agent
    ? isReporter && newsroom.digests?.generating
      ? 'working'
      : (connected && status?.ready) || active
        ? 'idle'
        : agent.status
    : undefined;
  return (
    <aside className={`panel${open ? ' open' : ''}`} aria-hidden={!open}>
      {vacant && !agent && (
        <div className="panel-inner" style={{ ['--accent' as string]: '#8f9bb5' }}>
          <button className="panel-close" onClick={onClose} aria-label="Zavřít">
            ×
          </button>
          <header className="panel-head">
            <div className="vacant-icon">＋</div>
            <div>
              <div className="panel-room">Volný box</div>
              <h2>Volná kancelář</h2>
              <div className="panel-role">Připraveno pro nového agenta</div>
            </div>
          </header>
          <p className="panel-desc">
            Zatím tu jsou jen krabice od stěhování. Až budeš potřebovat dalšího pomocníka (třeba na úkoly, cestování nebo nákupy), nastěhujeme ho
            sem.
          </p>
          <p className="hint">Stačí říct, co má nový agent dělat a s jakými nástroji pracovat.</p>
        </div>
      )}
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
              <span className={`status status-${agentStatus}`}>{STATUS_LABEL[agentStatus!]}</span>
            </div>
          </header>

          {isReporter ? (
            <>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={echoTab === 'chat'} className={echoTab === 'chat' ? 'active' : ''} onClick={() => setEchoTab('chat')}>
                  💬 Chat
                </button>
                <button role="tab" aria-selected={echoTab === 'zpravy'} className={echoTab === 'zpravy' ? 'active' : ''} onClick={() => setEchoTab('zpravy')}>
                  📰 Zprávy a počasí
                </button>
              </div>
              <section className="chat-section">
                {echoTab === 'chat' ? (
                  <Chat key={agent.id} agent={agent} status={status} onStatusChange={onStatusChange} onBusyChange={(b) => onBusyChange(agent.id, b)} />
                ) : (
                  <ReporterPanel newsroom={newsroom} serverOnline={serverOnline} onOpenPoster={onOpenPoster} />
                )}
              </section>
              <details className="about">
                <summary>O agentovi</summary>
                {details}
              </details>
            </>
          ) : chatCapable ? (
            <>
              <section className="chat-section">
                <Chat key={agent.id} agent={agent} status={status} onStatusChange={onStatusChange} onBusyChange={(b) => onBusyChange(agent.id, b)} />
              </section>
              {agent.theme === 'townhall' && (
                <div className="jarvis-card">
                  <div className="jarvis-orb" aria-hidden />
                  <div>
                    <strong>Brzy Jarvis</strong>
                    <p>Ondik se na radnici promění v Jarvise: budeš s ním mluvit hlasem a zavolá ti, když bude něco důležitého.</p>
                  </div>
                </div>
              )}
              <details className="about">
                <summary>O agentovi</summary>
                {details}
              </details>
            </>
          ) : (
            <>
              {details}
              <section>
                <h3>Zadat úkol</h3>
                <div className="chat-placeholder">
                  <input disabled placeholder="Napiš zprávu…" />
                  <button disabled>Odeslat</button>
                </div>
                <p className="hint">{agent.name} zatím není připojený. Až ho nastavíme, půjde mu psát přímo tady.</p>
              </section>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
