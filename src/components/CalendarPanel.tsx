import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, disconnectGoogle, fetchAgenda, fetchGoogleStatus, saveGoogleClient, startGoogleAuth, type CalEvent, type GoogleStatus } from '../api';
import { dayName } from '../format';

interface CalendarPanelProps {
  serverOnline: boolean;
  /** Výsledek návratu z přihlášení Googlu (z adresy ?kalendar=…). */
  notice: { ok: boolean; text: string } | null;
  onStatusChange: () => void;
}

const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

function Agenda({ events }: { events: CalEvent[] }) {
  if (!events.length) return <p className="hint">Na příští týden nemáš v kalendáři nic.</p>;
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const d = e.start.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  return (
    <div className="agenda">
      {[...byDay].map(([day, list]) => (
        <section key={day}>
          <h4>
            {dayName(day)} <span>{new Date(`${day}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</span>
          </h4>
          <ul>
            {list.map((e) => (
              <li key={e.id}>
                <span className="agenda-time">{e.allDay ? 'celý den' : `${e.start.slice(11)}–${e.end.slice(11)}`}</span>
                <span className="agenda-title">
                  {e.link ? (
                    <a href={e.link} target="_blank" rel="noreferrer">
                      {e.summary}
                    </a>
                  ) : (
                    e.summary
                  )}
                  {e.location && <small>{e.location}</small>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Setup({ onSaved }: { onSaved: () => void }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveGoogleClient(clientId, secret);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se uložit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gsetup">
      <p className="panel-desc">
        Aby Chronos mohl do tvého Google Kalendáře, potřebuje vlastní „přihlašovací aplikaci“ u Googlu. Uděláš ji jednou, zabere to asi 10 minut a je
        zdarma.
      </p>
      <ol className="gsteps">
        <li>
          Otevři{' '}
          <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
            Google Cloud – nový projekt
          </a>
          , pojmenuj ho třeba <b>OndiVerse</b> a dej <i>Vytvořit</i>.
        </li>
        <li>
          Zapni{' '}
          <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
            Google Calendar API
          </a>{' '}
          (nahoře zkontroluj, že je vybraný tvůj nový projekt) → <i>Povolit</i>.
        </li>
        <li>
          Otevři{' '}
          <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">
            Google Auth Platform
          </a>{' '}
          → <i>Začínáme</i>: název aplikace <b>OndiVerse</b>, tvůj e-mail, typ uživatelů <b>Externí</b>, kontaktní e-mail, souhlas → <i>Vytvořit</i>.
        </li>
        <li>
          V části <i>Okruh uživatelů (Audience)</i> klikni na <b>Publikovat aplikaci</b> → potvrdit. (Jinak by tě Google každých 7 dní odhlásil. Ověřovat
          aplikaci u Googlu nemusíš.)
        </li>
        <li>
          V části <i>Klienti (Clients)</i> → <i>Vytvořit klienta</i> → typ aplikace <b>Aplikace pro počítač (Desktop app)</b> → název libovolný →{' '}
          <i>Vytvořit</i>.
        </li>
        <li>
          Zkopíruj <b>ID klienta</b> a <b>Tajný klíč klienta</b> sem:
        </li>
      </ol>
      <form onSubmit={save} className="gform">
        <label htmlFor="g-client-id">ID klienta (Client ID)</label>
        <input id="g-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234…apps.googleusercontent.com" autoComplete="off" />
        <label htmlFor="g-client-secret">Tajný klíč klienta (Client secret)</label>
        <input id="g-client-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" autoComplete="off" />
        {error && <div className="chat-error">{error}</div>}
        <button className="rep-btn primary" disabled={saving || !clientId.trim() || !secret.trim()}>
          {saving ? 'Ukládám…' : 'Uložit a pokračovat'}
        </button>
        <p className="hint">Údaje se uloží jen u tebe v počítači (složka data). Nikomu je neposílej.</p>
      </form>
    </div>
  );
}

/** Záložka Kalendář v panelu Chronose: nastavení propojení a přehled událostí. */
export function CalendarPanel({ serverOnline, notice, onStatusChange }: CalendarPanelProps) {
  const [st, setSt] = useState<GoogleStatus | null>(null);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await fetchGoogleStatus();
      setSt(s);
      setError(null);
      if (s.connected) {
        const a = await fetchAgenda(7);
        setEvents(a.events);
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Běží ještě starší verze serveru. Zavři okno „OndiVerse - server“ na liště a spusť městečko znovu ikonou na ploše.'
          : err instanceof Error
            ? err.message
            : 'Nepodařilo se načíst kalendář.',
      );
    }
  }, []);

  useEffect(() => {
    if (serverOnline) void load();
  }, [serverOnline, load]);

  if (!serverOnline) {
    return (
      <div className="chat-note">
        <strong>Kalendář se propojuje na tvém počítači.</strong>
        <p>Spusť městečko ikonou na ploše a otevři tuhle záložku tam.</p>
      </div>
    );
  }

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await startGoogleAuth();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přihlášení se nepodařilo spustit.');
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      setSt(await disconnectGoogle());
      setEvents(null);
      onStatusChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="calpanel">
      {notice && <div className={notice.ok ? 'notice-ok' : 'chat-error'}>{notice.text}</div>}
      {error && <div className="chat-error">{error}</div>}
      {!st ? (
        !error && <p className="hint">Načítám…</p>
      ) : !st.configured ? (
        <Setup onSaved={() => void load()} />
      ) : !st.connected ? (
        <div className="glogin">
          <p className="panel-desc">Přihlašovací aplikace je nastavená. Teď se přihlas svým účtem Google a povol Chronosovi přístup ke kalendáři.</p>
          {isLocal() ? (
            <button className="rep-btn primary gbtn" disabled={busy} onClick={() => void login()}>
              {busy ? 'Otevírám Google…' : '🔐 Přihlásit se přes Google'}
            </button>
          ) : (
            <div className="chat-note">Propojení udělej přímo na počítači, kde městečko běží – z telefonu to nejde.</div>
          )}
          <p className="hint">
            Google ukáže varování „Google tuto aplikaci neověřil“ – to je v pořádku, je to tvoje vlastní aplikace. Klikni na <b>Pokročilé</b> →{' '}
            <b>Přejít na OndiVerse</b> a povol přístup ke kalendáři.
          </p>
        </div>
      ) : (
        <>
          <div className="gconnected">
            <span>
              ✓ Propojeno{st.email ? ` – ${st.email}` : ''}
            </span>
            <button className="chat-clear" onClick={() => void load()}>
              Obnovit
            </button>
          </div>
          <h3>Příštích 7 dní</h3>
          {events ? <Agenda events={events} /> : <p className="hint">Načítám události…</p>}
          <button className="chat-clear gdisconnect" disabled={busy} onClick={() => void logout()}>
            Odpojit Google Kalendář
          </button>
        </>
      )}
    </div>
  );
}
