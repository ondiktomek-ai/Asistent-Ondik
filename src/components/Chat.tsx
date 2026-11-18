import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ApiError, clearHistory, fetchHistory, sendMessage, setToken, type ChatMessage, type ServerStatus } from '../api';
import type { AgentDef } from '../world/types';

interface ChatProps {
  agent: AgentDef;
  status: ServerStatus | null;
  onStatusChange: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** Zobrazení textu odpovědi: odstavce, odrážky a **tučné**. Bez HTML z modelu. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string, key: number) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{part}</span>,
    );
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•*] /, ''), j)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l, j)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function Chat({ agent, status, onStatusChange, onBusyChange }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const needsLogin = status?.authRequired && !status.authorized;
  const canChat = status?.ready && !needsLogin;

  useEffect(() => {
    if (!canChat) return;
    fetchHistory(agent.id)
      .then((h) => setMessages(h.messages))
      .catch((e: ApiError) => setError(e.message));
  }, [agent.id, canChat]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || streaming !== null) return;
    setDraft('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text, at: new Date().toISOString() }]);
    setStreaming('');
    onBusyChange(true);
    const abort = new AbortController();
    abortRef.current = abort;
    let reply = '';
    try {
      await sendMessage(agent.id, text, (t) => {
        reply += t;
        setStreaming(reply);
      }, abort.signal);
      setMessages((m) => [...m, { role: 'assistant', text: reply, at: new Date().toISOString() }]);
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Něco se pokazilo.');
      setDraft(text);
      setMessages((m) => m.slice(0, -1));
      if (err instanceof ApiError && err.status === 401) onStatusChange();
    } finally {
      setStreaming(null);
      onBusyChange(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  async function clear() {
    try {
      await clearHistory(agent.id);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se smazat.');
    }
  }

  if (!status) {
    return (
      <div className="chat-note">
        <strong>Server kanceláře neběží.</strong>
        <p>Chat funguje, když kancelář otevřeš ze svého počítače, kde běží <code>npm start</code>. Postup je v README.</p>
      </div>
    );
  }
  if (!status.ready) {
    return (
      <div className="chat-note">
        <strong>Chybí API klíč.</strong>
        <p>
          Doplň <code>ANTHROPIC_API_KEY</code> do souboru <code>.env</code> a restartuj server.
        </p>
      </div>
    );
  }
  if (needsLogin) {
    return (
      <form
        className="chat-login"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(password);
          onStatusChange();
        }}
      >
        <label htmlFor="office-password">Heslo do kanceláře</label>
        <div className="chat-input-row">
          <input id="office-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button type="submit">Vstoupit</button>
        </div>
      </form>
    );
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && streaming === null && (
          <div className="chat-empty">Napiš, s čím potřebuješ pomoct. Třeba „Co bys mi dnes doporučil udělat jako první?“</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === 'assistant' ? <RichText text={m.text} /> : m.text}
          </div>
        ))}
        {streaming !== null && (
          <div className="msg msg-assistant">{streaming ? <RichText text={streaming} /> : <span className="typing">Přemýšlí…</span>}</div>
        )}
      </div>
      {error && <div className="chat-error">{error}</div>}
      <form className="chat-input-row" onSubmit={send}>
        <textarea
          id="chat-input"
          rows={1}
          value={draft}
          placeholder="Napiš zprávu…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          disabled={streaming !== null}
        />
        <button type="submit" disabled={!draft.trim() || streaming !== null}>
          Odeslat
        </button>
      </form>
      {messages.length > 0 && streaming === null && (
        <button className="chat-clear" onClick={clear}>
          Začít novou konverzaci
        </button>
      )}
    </div>
  );
}
