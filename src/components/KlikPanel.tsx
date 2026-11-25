import { useCallback, useEffect, useState } from 'react';
import { addTileApi, deleteTileApi, fetchTiles, launch, onServerPc, resetTilesApi, type Tile } from '../api';
import { DEFAULT_TILES } from '../world/tiles';

const COLORS = ['#ff2b2b', '#1ed760', '#4f8ef7', '#e1306c', '#f5b83d', '#8a7dff', '#22c3c9', '#ff7a1a'];

/** Klikův spouštěč: velké dlaždice, hledání a vlastní odkazy. */
export function KlikPanel({ serverOnline }: { serverOnline: boolean }) {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULT_TILES);
  const [query, setQuery] = useState('');
  const [service, setService] = useState('youtube');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', icon: '', color: COLORS[5] });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchTiles()
      .then((r) => setTiles(r.tiles))
      .catch(() => setTiles(DEFAULT_TILES));
  }, []);
  useEffect(() => {
    if (serverOnline) load();
  }, [serverOnline, load]);

  const searchable = tiles.filter((t) => t.search);
  const current = searchable.find((t) => t.id === service) ?? searchable[0];

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || !current?.search) return;
    launch(current.search + encodeURIComponent(q));
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    addTileApi({ name: form.name, url: form.url, icon: form.icon || undefined, color: form.color })
      .then(() => {
        setForm({ name: '', url: '', icon: '', color: COLORS[5] });
        setAdding(false);
        load();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Nepodařilo se uložit.'));
  };

  return (
    <div className="klik">
      <form className="klik-search" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={current ? `Hledat na ${current.name}…` : 'Hledat…'} aria-label="Co hledat" />
        <button type="submit" disabled={!query.trim()} style={{ background: current?.color }}>
          Hledat
        </button>
      </form>
      <div className="klik-services" role="radiogroup" aria-label="Kde hledat">
        {searchable.map((t) => (
          <button key={t.id} role="radio" aria-checked={t.id === current?.id} className={t.id === current?.id ? 'active' : ''} onClick={() => setService(t.id)} style={{ '--c': t.color } as React.CSSProperties}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="klik-grid">
        {tiles.map((t) => (
          <div key={t.id} className="klik-tile-wrap">
            <button className="klik-tile" style={{ '--c': t.color } as React.CSSProperties} onClick={() => launch(t.url)} title={`Otevřít ${t.name}`}>
              <span className="klik-icon">{t.icon}</span>
              <span className="klik-name">{t.name}</span>
            </button>
            {editing && serverOnline && (
              <button className="klik-del" onClick={() => void deleteTileApi(t.id).then(load)} aria-label={`Odebrat ${t.name}`} title="Odebrat">
                ×
              </button>
            )}
          </div>
        ))}
        {serverOnline && (
          <button className="klik-tile klik-add" onClick={() => setAdding((v) => !v)} title="Přidat vlastní odkaz">
            <span className="klik-icon">＋</span>
            <span className="klik-name">Přidat</span>
          </button>
        )}
      </div>

      {adding && (
        <form className="klik-form" onSubmit={add}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Název (např. Netflix)" maxLength={40} />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Adresa (např. netflix.com)" />
          <div className="klik-form-row">
            <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Ikona (písmeno / emoji)" maxLength={2} />
            <div className="klik-colors">
              {COLORS.map((c) => (
                <button type="button" key={c} className={form.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={`Barva ${c}`} />
              ))}
            </div>
          </div>
          <button type="submit" disabled={!form.name.trim() || !form.url.trim()}>
            Uložit dlaždici
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}

      <p className="hint klik-hint">
        {onServerPc()
          ? 'Otevírá se v tvém normálním prohlížeči na počítači (tam, kde jsi přihlášený).'
          : 'Otevře se tady v telefonu. Klikovi (nebo Jarvisovi) můžeš i napsat, co pustit.'}
      </p>
      {serverOnline && (
        <div className="klik-tools">
          <button onClick={() => setEditing((v) => !v)}>{editing ? '✓ Hotovo' : '✏️ Upravit dlaždice'}</button>
          {editing && <button onClick={() => void resetTilesApi().then((r) => setTiles(r.tiles))}>↺ Výchozí sada</button>}
        </div>
      )}
    </div>
  );
}
