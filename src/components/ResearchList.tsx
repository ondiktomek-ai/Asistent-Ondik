import { useCallback, useEffect, useState } from 'react';
import { deleteResearchPoster, fetchResearchPosters } from '../api';
import { ago } from '../format';

interface Props {
  serverOnline: boolean;
  onOpen: (id: string) => void;
  /** Mění se po vytvoření nového plakátku – seznam se znovu načte. */
  refreshKey: number;
}

/** Lexina knihovna plakátků z rešerší. */
export function ResearchList({ serverOnline, onOpen, refreshKey }: Props) {
  const [list, setList] = useState<{ id: string; createdAt: string; title: string; topic: string }[] | null>(null);
  const load = useCallback(() => {
    fetchResearchPosters()
      .then((r) => setList(r.posters))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    if (serverOnline) load();
  }, [serverOnline, load, refreshKey]);

  if (!serverOnline) {
    return (
      <div className="chat-note">
        <strong>Lexa pracuje na tvém počítači.</strong>
        <p>Plakátky z rešerší uvidíš, až městečko spustíš ikonou na ploše.</p>
      </div>
    );
  }
  if (!list) return <p className="hint">Načítám…</p>;
  if (!list.length)
    return <p className="hint">Zatím žádné plakátky. Zadej Lexe v chatu rešerši a řekni „udělej z toho plakátek“.</p>;
  return (
    <ul className="research-list">
      {list.map((p) => (
        <li key={p.id}>
          <button className="research-open" onClick={() => onOpen(p.id)}>
            <strong>📜 {p.title}</strong>
            {p.topic && <span>{p.topic}</span>}
            <small>{ago(p.createdAt)}</small>
          </button>
          <button
            className="research-del"
            title="Smazat plakátek"
            onClick={() => {
              void deleteResearchPoster(p.id).then(load);
            }}
          >
            🗑
          </button>
        </li>
      ))}
    </ul>
  );
}
