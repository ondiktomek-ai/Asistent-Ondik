import { useCallback, useEffect, useState } from 'react';
import { addMemoryApi, deleteMemoryApi, fetchMemory, fetchTeam, type MemoryItem, type MemoryKind, type TeamTask } from '../api';
import { AGENT_BY_ID } from '../world/agents';
import { ago } from '../format';

const KINDS: { id: MemoryKind; label: string }[] = [
  { id: 'uzivatel', label: '👤 O mně' },
  { id: 'preference', label: '⭐ Preference' },
  { id: 'projekt', label: '🛠️ Projekt' },
  { id: 'ukol', label: '📌 Úkol' },
  { id: 'jine', label: '📎 Jiné' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<MemoryKind, string>;

const who = (id: string) => (id === 'ty' ? 'ty' : (AGENT_BY_ID[id]?.name ?? id));
const icon = (id: string) => AGENT_BY_ID[id]?.icon ?? '🤖';

/** Ondikův panel: společná paměť týmu a deník spolupráce. */
export function TeamPanel({ serverOnline }: { serverOnline: boolean }) {
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [log, setLog] = useState<TeamTask[]>([]);
  const [active, setActive] = useState<TeamTask[]>([]);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<MemoryKind>('uzivatel');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMemory()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    fetchTeam(true)
      .then((r) => {
        setLog(r.log);
        setActive(r.active);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!serverOnline) return;
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [serverOnline, load]);

  if (!serverOnline) {
    return (
      <div className="chat-note">
        <strong>Paměť týmu je na tvém počítači.</strong>
        <p>Uvidíš ji, až městečko spustíš ikonou na ploše.</p>
      </div>
    );
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    addMemoryApi(text.trim(), kind)
      .then(() => {
        setText('');
        load();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Nepodařilo se uložit.'));
  };

  return (
    <div className="team-panel">
      <section>
        <h3>🧠 Společná paměť</h3>
        <p className="hint">Tohle si pamatuje celý tým – každý agent to vidí u každé otázky. Agenti sem zapisují sami, ty můžeš přidat nebo smazat.</p>
        <form className="memory-add" onSubmit={add}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Např. „V pondělí chodím na trénink v 18:00“" maxLength={500} />
          <select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} aria-label="Druh">
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!text.trim()}>
            Uložit
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {!items ? (
          <p className="hint">Načítám…</p>
        ) : !items.length ? (
          <p className="hint">Zatím prázdná. Řekni Ondikovi něco o sobě („Pamatuj si, že…“) a zapíše si to.</p>
        ) : (
          <ul className="memory-list">
            {items.map((m) => (
              <li key={m.id}>
                <div>
                  <span className="memory-kind">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <p>{m.text}</p>
                  <small>
                    zapsal {who(m.by)} · {ago(m.at)}
                  </small>
                </div>
                <button className="research-del" title="Zapomenout" onClick={() => void deleteMemoryApi(m.id).then(load)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>🤝 Spolupráce týmu</h3>
        {!active.length && !log.length && <p className="hint">Zatím si nikdo nic nezadal. Zkus Ondikovi napsat třeba „Najdi mi tento týden volný večer a Lexa ať k němu najde tip na výlet“.</p>}
        <ul className="team-log">
          {[...active, ...log].map((t) => (
            <li key={t.id} className={`team-task ${t.state}`}>
              <div className="team-task-head">
                <span>
                  {icon(t.from)} {who(t.from)} → {icon(t.to)} {who(t.to)}
                </span>
                <small>{t.state === 'bezi' ? '⏳ pracuje…' : `${t.state === 'chyba' ? '⚠️ ' : ''}${ago(t.doneAt ?? t.at)}`}</small>
              </div>
              <p className="team-task-text">{t.task}</p>
              {t.result && (
                <details>
                  <summary>Odpověď</summary>
                  <p>{t.result}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
