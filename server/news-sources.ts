/**
 * Zdroje zpráv pro zpravodaje Echa (RSS / Atom).
 * scope: kam zprávy patří – svět, Česko, nebo region (Olomoucký kraj / Přerovsko).
 * Když některý zdroj přestane fungovat, uvidíš to v panelu Echa (Stav zdrojů) a stačí tu opravit adresu.
 */
export type NewsScope = 'svet' | 'cesko' | 'region';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  scope: NewsScope;
}

export const NEWS_SOURCES: NewsSource[] = [
  // Česko
  { id: 'ct24', name: 'ČT24', url: 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy', scope: 'cesko' },
  { id: 'irozhlas', name: 'iROZHLAS', url: 'https://www.irozhlas.cz/rss/irozhlas', scope: 'cesko' },
  { id: 'seznam', name: 'Seznam Zprávy', url: 'https://www.seznamzpravy.cz/rss', scope: 'cesko' },
  { id: 'novinky', name: 'Novinky', url: 'https://www.novinky.cz/rss', scope: 'cesko' },
  // Svět
  { id: 'irozhlas-svet', name: 'iROZHLAS Svět', url: 'https://www.irozhlas.cz/rss/irozhlas/section/zpravy-svet', scope: 'svet' },
  { id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', scope: 'svet' },
  { id: 'guardian', name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', scope: 'svet' },
  // Region – Olomoucký kraj, Přerovsko
  { id: 'idnes-olomouc', name: 'iDNES Olomoucký kraj', url: 'https://servis.idnes.cz/rss.aspx?c=olomouc', scope: 'region' },
  { id: 'prerovsky-denik', name: 'Přerovský deník', url: 'https://prerovsky.denik.cz/rss/zpravy.xml', scope: 'region' },
];

export const SCOPE_NAMES: Record<NewsScope, string> = { svet: 'svět', cesko: 'Česko', region: 'region' };
