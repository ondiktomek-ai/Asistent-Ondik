import { useState } from 'react';
import type { AgentDef, AgentStatus } from '../world/types';
import { Robot } from './Robot';
import { Chat } from './Chat';
import type { ServerStatus } from '../api';
import type { Newsroom } from '../hooks/useNewsroom';
import { ReporterPanel } from './ReporterPanel';
import { CalendarPanel } from './CalendarPanel';
import { MaintenancePanel } from './MaintenancePanel';
import { ResearchList } from './ResearchList';
import { TeamPanel } from './TeamPanel';
import { KlikPanel } from './KlikPanel';
import type { ChatAttachment } from '../api';

/** Agenti s druhou záložkou vedle chatu. */
const SIDE_TABS: Record<string, { id: string; label: string }> = {
  ondik: { id: 'tym', label: '🧠 Paměť a tým' },
  klik: { id: 'spoustec', label: '▶️ Spouštěč' },
  echo: { id: 'zpravy', label: '📰 Zprávy a počasí' },
  chronos: { id: 'kalendar', label: '📅 Kalendář' },
  bit: { id: 'udrzba', label: '🔧 Údržba' },
  lexa: { id: 'plakatky', label: '📚 Plakátky' },
};

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
  onActivity: (agentId: string, label: string | null) => void;
  /** Výsledek přihlášení ke Googlu (po návratu z Googlu). */
  calendarNotice: { ok: boolean; text: string } | null;
  /** Požadovaná záložka (např. po návratu z Googlu otevřít Kalendář). */
  initialTab?: string | null;
  /** Přihlásit se ke Googlu (z Bitova upozornění). */
  onGoogleLogin: () => void;
  /** Otevřít plakátek z Lexiny rešerše. */
  onOpenResearch: (id: string) => void;
  /** Mění se po vytvoření nového plakátku. */
  researchRefresh: number;
}

export function AgentPanel({
  agent,
  vacant = false,
  status,
  onClose,
  onStatusChange,
  onBusyChange,
  newsroom,
  onOpenPoster,
  onActivity,
  calendarNotice,
  initialTab,
  onGoogleLogin,
  onOpenResearch,
  researchRefresh,
}: AgentPanelProps) {
  const openAttachment = (a: ChatAttachment) => {
    if (a.kind === 'lexa-poster') onOpenResearch(a.id);
  };
  // Klik začíná rovnou dlaždicemi, ostatní chatem
  const firstTab = (id?: string) => initialTab ?? (id === 'klik' ? 'spoustec' : 'chat');
  const [tab, setTab] = useState<string>(firstTab(agent?.id));
  const [tabAgent, setTabAgent] = useState<string | null>(agent?.id ?? null);
  // při přepnutí na jiného agenta začni chatem (pokud není řečeno jinak)
  if ((agent?.id ?? null) !== tabAgent) {
    setTabAgent(agent?.id ?? null);
    setTab(firstTab(agent?.id));
  }
  const sideTab = agent ? SIDE_TABS[agent.id] : undefined;
  const googleOk = !!status?.google?.connected;
  const open = !!agent || vacant;
  const connected = !!agent && !!status?.connectedAgents.includes(agent.id);
  const chatCapable = !!agent && (connected || agent.id === 'ondik');
  const serverOnline = !!status && (!status.authRequired || status.authorized);

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
                  {(() => {
                    const st = agent.id === 'chronos' ? (googleOk ? 'connected' : 'planned') : t.status;
                    return <span className={`badge badge-${st}`}>{st === 'connected' ? 'Připojeno' : agent.id === 'chronos' ? 'Nepropojeno' : 'Plánováno'}</span>;
                  })()}
                </li>
              ))}
            </ul>
          </section>
    </>
  );
  const active = !!agent && !!status?.activeAgents?.includes(agent.id);
  const agentStatus: AgentStatus | undefined = agent
    ? agent.id === 'echo' && newsroom.digests?.generating
      ? 'working'
      : agent.id === 'chronos' && !googleOk
        ? 'setup'
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

          {sideTab ? (
            <>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
                  💬 Chat
                </button>
                <button role="tab" aria-selected={tab === sideTab.id} className={tab === sideTab.id ? 'active' : ''} onClick={() => setTab(sideTab.id)}>
                  {sideTab.label}
                </button>
              </div>
              <section className="chat-section">
                {tab === 'chat' ? (
                  <Chat
                    key={agent.id}
                    agent={agent}
                    status={status}
                    onStatusChange={onStatusChange}
                    onBusyChange={(b) => onBusyChange(agent.id, b)}
                    onActivity={(l) => onActivity(agent.id, l)}
                    onOpenAttachment={openAttachment}
                  />
                ) : agent.id === 'echo' ? (
                  <ReporterPanel newsroom={newsroom} serverOnline={serverOnline} onOpenPoster={onOpenPoster} />
                ) : agent.id === 'ondik' ? (
                  <TeamPanel serverOnline={serverOnline} />
                ) : agent.id === 'klik' ? (
                  <KlikPanel serverOnline={serverOnline} />
                ) : agent.id === 'lexa' ? (
                  <ResearchList serverOnline={serverOnline} onOpen={onOpenResearch} refreshKey={researchRefresh} />
                ) : agent.id === 'bit' ? (
                  <MaintenancePanel serverOnline={serverOnline} onGoogleLogin={onGoogleLogin} />
                ) : (
                  <CalendarPanel serverOnline={serverOnline} notice={calendarNotice} onStatusChange={onStatusChange} />
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
