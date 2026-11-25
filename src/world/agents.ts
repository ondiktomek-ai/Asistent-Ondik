import type { AgentDef } from './types';

/**
 * Seznam agentů v kanceláři.
 * Nástroje ve stavu `planned` teprve přijdou.
 */
export const AGENTS: AgentDef[] = [
  {
    id: 'ondik',
    name: 'Ondik',
    role: 'Hlavní asistent · budoucí Jarvis',
    roomName: 'Radnice',
    icon: '⭐',
    color: '#f5b83d',
    theme: 'townhall',
    status: 'setup',
    description:
      'Tvůj hlavní asistent a šéf týmu. Sídlí na radnici hned vedle tebe, přijímá požadavky a rozdělí je kolegům – Chronos zjistí termíny, Lexa udělá rešerši, Echo zprávy – a výsledky ti shrne dohromady. Časem z něj bude Jarvis – asistent, se kterým budeš mluvit hlasem a který ti umí zavolat.',
    duties: [
      'Přijímá tvoje požadavky a rozděluje je týmu',
      'Spojuje výsledky kolegů do jedné odpovědi',
      'Vede společnou paměť týmu (co o tobě všichni vědí)',
      'Každé ráno připraví přehled dne (brzy)',
    ],
    tools: [
      { name: 'Delegování', description: 'Zadává úkoly kolegům a čeká na jejich výsledky', status: 'connected' },
      { name: 'Společná paměť', description: 'Co si tým pamatuje o tobě, tvých zvyklostech a projektech', status: 'connected' },
      { name: 'Notifikace', description: 'Upozornění do telefonu', status: 'planned' },
      { name: 'Hlas (Jarvis)', description: 'Mluvený rozhovor místo psaní', status: 'planned' },
      { name: 'Telefonní hovory (Jarvis)', description: 'Zavolá ti, když je něco důležitého', status: 'planned' },
    ],
    idleLines: ['Co dnes vyřešíme?', 'Všichni na místech!', 'Jarvis mód: brzy…', 'Kávu, šéfe?'],
  },
  {
    id: 'echo',
    name: 'Echo',
    role: 'Zpravodaj',
    roomName: 'Redakce',
    icon: '📰',
    color: '#e8505b',
    theme: 'newsroom',
    status: 'setup',
    description:
      'Hlídá, co se děje ve světě, v Česku i u nás v Lipníku a okolí. Novinky hned posílá do pásu zpráv vpravo a každou celou hodinu vylepí plakátek se souhrnem a vývojem počasí.',
    duties: [
      'Každých 10 minut projde zpravodajské weby',
      'Nové zprávy posílá do pásu vpravo',
      'Každou hodinu sepíše plakátek se souhrnem',
      'Hlásí počasí pro Lipník nad Bečvou',
    ],
    tools: [
      { name: 'Zprávy (RSS)', description: 'ČT24, iROZHLAS, Seznam Zprávy, Novinky, BBC, Guardian, regionální weby', status: 'connected' },
      { name: 'Počasí (Open-Meteo)', description: 'Aktuální stav, 24 hodin a 3 dny dopředu', status: 'connected' },
      { name: 'Souhrny (Claude Haiku 5.5)', description: 'Hodinový plakátek z nasbíraných zpráv', status: 'connected' },
    ],
    idleLines: ['Mimořádná zpráva!', 'Píšu titulek…', 'Co je nového?', 'Hlásím počasí!', 'Tiskneme!'],
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
    description:
      'Spravuje tvůj Google Kalendář: řekne ti, co tě čeká, najde volný termín, zapíše, přesune nebo smaže událost a 10 minut předem ti připomene, co začíná.',
    duties: ['Přehled, co tě čeká', 'Hledání volných termínů (8:00–20:00)', 'Zakládání, přesouvání a mazání událostí', 'Připomínky 10 minut předem'],
    tools: [{ name: 'Google Kalendář', description: 'Hlavní kalendář: čtení, volné termíny, zápis, úpravy, mazání', status: 'connected' }],
    idleLines: ['Hlídám čas.', 'Tik tak…', 'Co naplánujeme?', 'Kalendář je v cajku.'],
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
    description:
      'Hledá a čte informace na webu, porovnává možnosti a sepisuje přehledy. Výsledek rešerše ti umí vylepit jako přehledný plakátek se zdroji.',
    duties: ['Rešerše na webu (hledání i čtení stránek)', 'Porovnání produktů, služeb a nabídek', 'Plakátky z rešerší se zdroji', 'Tipy z okolí Lipníku nad Bečvou'],
    tools: [
      { name: 'Vyhledávání na webu', description: 'Hledání a čtení stránek přes Claude (Haiku 5.5)', status: 'connected' },
      { name: 'Plakátky z rešerší', description: 'Přehledný plakátek se shrnutím, body, doporučením a zdroji', status: 'connected' },
      { name: 'Google Disk', description: 'Hledání v tvých dokumentech – připojíme později', status: 'planned' },
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
    role: 'Technik a údržbář',
    roomName: 'Dílna',
    icon: '🔧',
    color: '#22c3c9',
    theme: 'workshop',
    status: 'setup',
    description:
      'Hlídá, že v městečku všechno běží – API klíč, zprávy, plakátky, počasí i Google Kalendář. Připomene ti přihlášení ke Googlu a vede seznam nápadů, co v městečku vylepšit.',
    duties: ['Kontrola městečka každých 15 minut', 'Připomínka přihlášení ke Googlu (jednou týdně)', 'Seznam nápadů na vylepšení', 'Rady, když něco nejde'],
    tools: [
      { name: 'Kontrola systému', description: 'API klíč, zdroje zpráv, plakátky, počasí, Google, data, server', status: 'connected' },
      { name: 'Seznam vylepšení', description: 'Tvoje nápady i jeho návrhy, s prioritou a stavem', status: 'connected' },
    ],
    idleLines: ['Servery běží. 🔧', 'Kontroluju městečko…', 'Máš nápad? Zapíšu ho!', '01001000 01101001', 'Všechno v cajku.'],
  },
];

export const AGENT_BY_ID: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
