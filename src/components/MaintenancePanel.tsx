import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { addIdeaApi, deleteIdeaApi, fetchBitStatus, fetchIdeas, updateIdeaApi, type BitReport, type CheckState, type Idea, type IdeaStatus } from '../api';
import { ago } from '../format';

const STATE_ICON: Record<CheckState, string> = { ok: '✓', warn: '!', error: '✗', info: 'i' };
const STATE_LABEL: Record<CheckState, string> = { ok: 'v pořádku', warn: 'pozor', error: 'chyba', info: 'informace' };
const STATUS_LABEL: Record<IdeaStatus, string> = { novy: 'Nové', planovany: 'Plánované', hotovo: 'Hotové', zamitnuty: 'Zamítnuté' };
const PRIORITY_LABEL = { vysoka: 'vysoká', stredni: 'střední', nizka: 'nízká' } as const;

interface Props {
  serverOnline: boolean;
  onGoogleLogin: () => void;
}

/** Bitova záložka Údržba: stav městečka a seznam nápadů na vylepšení. */
export function MaintenancePanel({ serverOnline, onGoogleLogin }: Props) {
  const [report, setReport] = useState<BitReport | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [showDone, setShowDone] = useState(false);

  const loadIdeas = useCallback(() => {
    fetchIdeas()
      .then((r) => setIdeas(r.ideas))
      .catch((e: Error) => setError(e.message));
  }, []);

  const check = useCallback(async (now: boolean) => {
    setChecking(true);
    try {
      setReport(await fetchBitStatus(now));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kontrola se nepovedla.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!serverOnline) return;
    void check(false);
    loadIdeas();
  }, [serverOnline, check, loadIdeas]);

  if (!serverOnline) {
    return (
      <div className="chat-note">
        <strong>Bit pracuje na tvém počítači.</strong>
        <p>Stav městečka a nápady uvidíš, až ho spustíš ikonou na ploše.</p>
      </div>
    );
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addIdeaApi(title, detail);
      setTitle('');
      setDetail('');
      loadIdeas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nápad se nepodařilo uložit.');
    }
  }

  async function setStatus(i: Idea, status: IdeaStatus) {
    await updateIdeaApi(i.id, { status }).catch(() => {});
    loadIdeas();
  }

  async function remove(i: Idea) {
    await deleteIdeaApi(i.id).catch(() => {});
    loadIdeas();
  }

  const open = ideas?.filter((i) => i.status === 'novy' || i.status === 'planovany') ?? [];
  const closed = ideas?.filter((i) => i.status === 'hotovo' || i.status === 'zamitnuty') ?? [];

  return (
    <div className="maint">
      {error && <div className="chat-error">{error}</div>}

      {report?.alerts.map((a) => (
        <div key={a.id} className="maint-alert">
          <span>{a.text}</span>
          {a.action === 'google-login' && (
            <button className="rep-btn primary" onClick={onGoogleLogin}>
              Přihlásit se
            </button>
          )}
        </div>
      ))}

      <section>
        <div className="maint-head">
          <h3>Stav městečka</h3>
          <button className="chat-clear" disabled={checking} onClick={() => void check(true)}>
            {checking ? 'Kontroluji…' : 'Zkontrolovat teď'}
          </button>
        </div>
        {report ? (
          <>
            <ul className="checks">
              {report.checks.map((c) => (
                <li key={c.id} className={`check-${c.state}`}>
                  <span className="check-icon" aria-label={STATE_LABEL[c.state]}>
                    {STATE_ICON[c.state]}
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.detail}</span>
                    {c.hint && c.state !== 'ok' && <small>{c.hint}</small>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="hint">Zkontrolováno {ago(report.checkedAt)}. Bit kontroluje každých 15 minut.</p>
          </>
        ) : (
          <p className="hint">Kontroluji…</p>
        )}
      </section>

      <section>
        <h3>Nápady na vylepšení</h3>
        <form className="idea-form" onSubmit={add}>
          <input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Co vylepšit? (např. Echo bude hlásit i dopravu)" />
          {title.trim() && <textarea id="idea-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Podrobnosti (nepovinné)" />}
          <button className="rep-btn primary" disabled={!title.trim()}>
            Zapsat nápad
          </button>
        </form>
        {ideas === null ? (
          <p className="hint">Načítám…</p>
        ) : open.length === 0 ? (
          <p className="hint">Zatím žádné otevřené nápady. Napiš Bitovi, co by se ti v městečku hodilo.</p>
        ) : (
          <ul className="ideas">
            {open.map((i) => (
              <li key={i.id} className={`idea prio-${i.priority}`}>
                <div className="idea-main">
                  <strong>{i.title}</strong>
                  {i.detail && <span>{i.detail}</span>}
                  <small>
                    {STATUS_LABEL[i.status]} · priorita {PRIORITY_LABEL[i.priority]} · {i.from === 'bit' ? 'návrh Bita' : 'tvůj nápad'}
                  </small>
                </div>
                <div className="idea-actions">
                  {i.status === 'novy' && (
                    <button title="Naplánovat" onClick={() => void setStatus(i, 'planovany')}>
                      📌
                    </button>
                  )}
                  <button title="Hotovo" onClick={() => void setStatus(i, 'hotovo')}>
                    ✓
                  </button>
                  <button title="Zamítnout" onClick={() => void setStatus(i, 'zamitnuty')}>
                    ✗
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <>
            <button className="chat-clear" onClick={() => setShowDone((v) => !v)}>
              {showDone ? 'Skrýt' : 'Ukázat'} vyřízené ({closed.length})
            </button>
            {showDone && (
              <ul className="ideas closed">
                {closed.map((i) => (
                  <li key={i.id} className="idea">
                    <div className="idea-main">
                      <strong>{i.title}</strong>
                      <small>{STATUS_LABEL[i.status]}</small>
                    </div>
                    <div className="idea-actions">
                      <button title="Vrátit mezi otevřené" onClick={() => void setStatus(i, 'novy')}>
                        ↺
                      </button>
                      <button title="Smazat" onClick={() => void remove(i)}>
                        🗑
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
