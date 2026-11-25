import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { ApiError, clearHistory, fetchHistory, launch, sendMessage, setToken, type ChatAttachment, type ChatMessage, type ServerStatus } from '../api';
import type { AgentDef } from '../world/types';

interface ChatProps {
  agent: AgentDef;
  status: ServerStatus | null;
  onStatusChange: () => void;
  onBusyChange: (busy: boolean) => void;
  /** Co agent právě dělá (např. „Dívám se do kalendáře…“), null = nic. */
  onActivity?: (label: string | null) => void;
  /** Otevřít přílohu (plakátek z rešerše). */
  onOpenAttachment?: (a: ChatAttachment) => void;
}

/** Zobrazení textu odpovědi: odstavce, odrážky a **tučné**. Bez HTML z modelu. */
function RichText({ text }: { text: string }) {
  const inline = (str: string, key: string) =>
    str.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{part}</span>,
    );
  const isBullet = (l: string) => /^\s*[-•*] /.test(l);
  const out: ReactElement[] = [];
  text.split(/\n{2,}/).forEach((block, bi) => {
    // v rámci odstavce seskupíme po sobě jdoucí odrážky do seznamu
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length)
        out.push(
          <p key={`p${bi}-${out.length}`}>
            {para.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l, `${bi}-${j}`)}
              </span>
            ))}
          </p>,
        );
      para = [];
    };
    const flushList = () => {
      if (list.length)
        out.push(
          <ul key={`u${bi}-${out.length}`}>
            {list.map((l, j) => (
              <li key={j}>{inline(l.replace(/^\s*[-•*] /, ''), `${bi}-l${j}`)}</li>
            ))}
          </ul>,
        );
      list = [];
    };
    for (const line of block.split('\n')) {
      if (isBullet(line)) {
        flushPara();
        list.push(line);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  });
  return <>{out}</>;
}

const CHAT_HINTS: Record<string, string> = {
  ondik: 'Napiš, s čím potřebuješ pomoct – zapojím kolegy. Třeba „Najdi mi tento týden volný večer a tip na výlet“, „Co mám zítra a jaké bude počasí?“ nebo „Pamatuj si, že…“.',
  chronos: 'Napiš, co potřebuješ. Třeba „Co mám zítra?“, „Najdi mi příští týden hodinu na zubaře“ nebo „Zapiš oběd s Petrem ve čtvrtek ve 12“.',
  bit: 'Zeptej se „Běží všechno?“, nebo mi řekni nápad, co v městečku vylepšit – zapíšu si ho.',
  lexa: 'Zadej mi rešerši – třeba „Porovnej tepelná čerpadla do rodinného domu“ nebo „Kam na výlet s dětmi v okolí Lipníku? Udělej z toho plakátek“.',
  klik: 'Řekni, co otevřít – třeba „Pusť lofi na YouTube“, „Najdi na Spotify Kabát“ nebo „Vygoogli recept na svíčkovou“. Dlaždice najdeš v záložce Spouštěč.',
  echo: 'Zeptej se na zprávy nebo počasí. Třeba „Co je nového v regionu?“ nebo „Bude zítra v Lipníku pršet?“',
};

export function Chat({ agent, status, onStatusChange, onBusyChange, onActivity, onOpenAttachment }: ChatProps) {
  const [activity, setActivity] = useState<string | null>(null);
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
    const made: ChatAttachment[] = [];
    try {
      await sendMessage(
        agent.id,
        text,
        (t) => {
          reply += t;
          setStreaming(reply);
          setActivity(null);
          onActivity?.(null);
        },
        abort.signal,
        (label) => {
          setActivity(label);
          onActivity?.(label);
        },
        (a) => {
          made.push(a);
          // plakátek se otevře hned; odkaz už otevřel server na počítači (na telefonu je tu tlačítko)
          if (a.kind === 'lexa-poster') onOpenAttachment?.(a);
        },
      );
      setMessages((m) => [...m, { role: 'assistant', text: reply, at: new Date().toISOString(), ...(made.length ? { attachments: [...made] } : {}) }]);
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Něco se pokazilo.');
      setDraft(text);
      setMessages((m) => m.slice(0, -1));
      if (err instanceof ApiError && err.status === 401) onStatusChange();
    } finally {
      setStreaming(null);
      setActivity(null);
      onActivity?.(null);
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
          <div className="chat-empty">{CHAT_HINTS[agent.id] ?? 'Napiš, s čím potřebuješ pomoct.'}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === 'assistant' ? <RichText text={m.text} /> : m.text}
            {m.attachments?.map((a) => (
              <button key={a.id} className={`chat-attachment${a.kind === 'link' ? ' link' : ''}`} onClick={() => (a.kind === 'link' ? launch(a.url) : onOpenAttachment?.(a))}>
                {a.kind === 'link' ? '▶' : '📜'} {a.title}
              </button>
            ))}
          </div>
        ))}
        {streaming !== null && (
          <div className="msg msg-assistant">
            {streaming && <RichText text={streaming} />}
            {(activity || !streaming) && <span className="typing">{activity ?? 'Přemýšlí…'}</span>}
          </div>
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
