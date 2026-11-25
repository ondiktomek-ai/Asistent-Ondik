/** Dlaždice spouštěče (Klik). Sdílí je server i prohlížeč – výchozí sada, kterou si uživatel může upravit. */
export interface Tile {
  id: string;
  name: string;
  url: string;
  /** Adresa hledání; hledaný text se přidá na konec (zakódovaný). */
  search?: string;
  icon: string;
  color: string;
}

export const DEFAULT_TILES: Tile[] = [
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', search: 'https://www.youtube.com/results?search_query=', icon: '▶', color: '#ff2b2b' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', search: 'https://open.spotify.com/search/', icon: '♫', color: '#1ed760' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/', search: 'https://www.google.com/search?q=', icon: 'G', color: '#4f8ef7' },
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/', icon: '◎', color: '#e1306c' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/', search: 'https://mail.google.com/mail/u/0/#search/', icon: '✉', color: '#ea4335' },
  { id: 'mapy', name: 'Mapy.cz', url: 'https://mapy.cz/', search: 'https://mapy.cz/?q=', icon: '⌖', color: '#2fb06b' },
];
