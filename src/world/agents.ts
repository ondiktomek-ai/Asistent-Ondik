import type { AgentDef } from './types';

/**
 * Seznam agentů v kanceláři.
 * Zatím jde jen o „obsazení“ světa – nástroje jsou ve stavu `planned`
 * a skutečné napojení přijde v další fázi.
 */
export const AGENTS: AgentDef[] = [
  {
    id: 'ondik',
    name: 'Ondik',
    role: 'Hlavní asistent',
    roomName: 'Recepce',
    icon: '⭐',
    color: '#f5b83d',
    theme: 'reception',
    status: 'setup',
    description:
      'Šéf recepce a tvůj hlavní kontakt. Přijímá požadavky, rozhoduje, který agent se jich ujme, a hlídá, aby se na nic nezapomnělo.',
    duties: [
      'Přijímá tvoje požadavky (chat, hlas, zprávy)',
      'Deleguje práci ostatním agentům',
      'Každé ráno připraví přehled dne',
      'Pamatuje si tvoje preference',
    ],
    tools: [
      { name: 'Delegování', description: 'Předávání úkolů ostatním agentům', status: 'planned' },
      { name: 'Paměť', description: 'Dlouhodobá paměť o tobě a tvých zvyklostech', status: 'planned' },
      { name: 'Notifikace', description: 'Upozornění do telefonu', status: 'planned' },
    ],
    idleLines: ['Co dnes vyřešíme?', 'Všichni na místech!', 'Kontroluju kanceláře…', 'Kávu?'],
  },
  {
    id: 'postak',
    name: 'Pošťák',
    role: 'E-mailový agent',
    roomName: 'Pošta',
    icon: '✉️',
    color: '#4f8ef7',
    theme: 'mail',
    status: 'setup',
    description:
      'Hlídá obě schránky – Gmail i Centrum. Třídí poštu, shrnuje důležité zprávy a připravuje koncepty odpovědí ke schválení.',
    duties: ['Jeden přehled pro Gmail i Centrum', 'Třídění a štítkování e-mailů', 'Shrnutí důležité pošty', 'Koncepty odpovědí', 'Hlídání nevyřízených vláken'],
    tools: [
      { name: 'Gmail', description: 'Čtení, hledání, štítky a koncepty odpovědí', status: 'planned' },
      { name: 'Centrum.cz', description: 'Druhá schránka přes IMAP/SMTP', status: 'planned' },
    ],
    idleLines: ['Nová pošta!', 'Třídím, třídím…', 'Spam do koše.', 'Tohle chce odpověď.'],
  },
  {
    id: 'chronos',
    name: 'Chronos',
    role: 'Kalendářní agent',
    roomName: 'Kalendář',
    icon: '📅',
    color: '#ff8a3d',
    theme: 'calendar',
    status: 'setup',
    description: 'Spravuje kalendář, hledá volné termíny, plánuje schůzky a připomíná, co tě čeká.',
    duties: ['Plánování schůzek', 'Hledání volných termínů', 'Připomínky událostí', 'Ochrana času na soustředění'],
    tools: [{ name: 'Google Kalendář', description: 'Čtení, vytváření a úpravy událostí', status: 'planned' }],
    idleLines: ['V 10:00 máš schůzku.', 'Zítra je volno!', 'Hlídám čas.', 'Tik tak…'],
  },
  {
    id: 'lexa',
    name: 'Lexa',
    role: 'Rešeršní agent',
    roomName: 'Knihovna',
    icon: '📚',
    color: '#a874f7',
    theme: 'research',
    status: 'setup',
    description: 'Hledá informace na webu i v tvých dokumentech, porovnává možnosti a sepisuje přehledy.',
    duties: ['Rešerše na webu', 'Shrnutí článků a dokumentů', 'Porovnání produktů a nabídek', 'Práce s tvými soubory'],
    tools: [
      { name: 'Vyhledávání na webu', description: 'Aktuální informace z internetu', status: 'planned' },
      { name: 'Google Disk', description: 'Hledání v tvých dokumentech', status: 'planned' },
    ],
    idleLines: ['Zajímavé čtení…', 'Našla jsem zdroj!', 'Hmm, ověřím to.', 'Pssst, knihovna.'],
  },
  {
    id: 'kasa',
    name: 'Kasa',
    role: 'Finanční agent',
    roomName: 'Finance',
    icon: '💰',
    color: '#34c47c',
    theme: 'finance',
    status: 'setup',
    description: 'Hlídá výdaje, faktury a předplatná. Upozorní na splatnosti a připraví měsíční přehled.',
    duties: ['Evidence faktur a účtenek', 'Hlídání splatností', 'Přehled předplatných', 'Měsíční shrnutí výdajů'],
    tools: [
      { name: 'Tabulky', description: 'Evidence výdajů v tabulce', status: 'planned' },
      { name: 'Faktury z e-mailu', description: 'Ve spolupráci s Pošťákem', status: 'planned' },
    ],
    idleLines: ['Počítám drobné.', 'Faktura je splatná!', 'Rozpočet sedí.', 'Cink!'],
  },
  {
    id: 'bit',
    name: 'Bit',
    role: 'Technický agent',
    roomName: 'Dílna',
    icon: '🔧',
    color: '#22c3c9',
    theme: 'workshop',
    status: 'setup',
    description: 'Stará se o automatizace, skripty a technické věci – od GitHubu po napojení dalších služeb.',
    duties: ['Automatizace opakovaných činností', 'Práce s kódem a GitHubem', 'Napojování nových nástrojů', 'Údržba systému'],
    tools: [
      { name: 'GitHub', description: 'Repozitáře, issues, pull requesty', status: 'planned' },
      { name: 'Spouštění kódu', description: 'Skripty a automatizace', status: 'planned' },
    ],
    idleLines: ['Kompiluju…', 'Servery běží.', 'Kde je můj šroubovák?', '01001000 01101001'],
  },
];

export const AGENT_BY_ID: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
