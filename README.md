# 🏙️ Městečko Ondik

Osobní AI asistent jako 3D městečko robotů-agentů. Každý agent má vlastní **box**, ve kterém
bydlí (postel, noční stolek) i pracuje (pracoviště podle zaměření). Boxy stojí v kruhu kolem
**radnice**, sídla CEO Ondřeje Tomka. Na radnici sedí i hlavní asistent **Ondik**, který si s tebou
povídá přes Claude – a je to **Jarvis**: nahlas ti přednese hlášení a mluví s tebou hlasem
(časem ti bude umět i zavolat).

Ovládání: tažením otáčíš, kolečkem (na telefonu dvěma prsty) přibližuješ, kliknutím na box
nebo radnici se kamera přiblíží a otevře detail. V noci jdou roboti k posteli.

## Instalace na jedno kliknutí

### Windows
1. Stáhni projekt jako ZIP (na GitHubu **Code → Download ZIP**) a **rozbal ho** (pravé tlačítko →
   *Extrahovat vše…*) někam, kde zůstane – třeba do *Dokumentů*. Nespouštěj ho přímo ze ZIPu.
2. V rozbalené složce dvakrát klikni na **`Nainstalovat-Windows.bat`**.
   Instalace:
   - zkontroluje Node.js a když chybí, nabídne jeho instalaci,
   - stáhne knihovny a sestaví městečko,
   - zeptá se na **Claude API klíč** a heslo (heslo jen pro přístup z telefonu),
   - když máš víc monitorů, zeptá se, **na kterém** má městečko běžet a jestli přes celou obrazovku,
   - vytvoří na ploše ikonu **Městečko Ondik**.
3. Hotovo – od teď stačí **dvojklik na ikonu na ploše**.

Ikona spustí server (minimalizované okno *Mestecko Ondik – server* na liště – jeho zavřením
městečko vypneš) a otevře městečko jako samostatné okno bez lišty prohlížeče (Chrome nebo Edge).
Pokud se instalace zeptá na „neznámého vydavatele“, zvol *Další informace → Přesto spustit*.

### Mac
1. Stáhni ZIP z GitHubu a rozbal ho (třeba do *Dokumentů*).
2. Na **`Nainstalovat-Mac.command`** klikni **pravým tlačítkem → Otevřít** (poprvé to macOS jinak nedovolí).
3. Na ploše se objeví aplikace **Městečko Ondik**. Server poběží na pozadí do vypnutí počítače;
   ručně ho vypneš příkazem `scripts/zastavit.sh`.

### Druhý monitor a celá obrazovka
- Monitor a celou obrazovku nastavíš v souboru `.env` (`OKNO_POZICE=x,y`, `OKNO_CELA_OBRAZOVKA=ano`)
  – na Windows je za tebe vyplní instalace.
- V městečku je vpravo nahoře tlačítko **⛶** pro celou obrazovku; v okně funguje i **F11**.
- Okno si jinak pamatuje, kde jsi ho naposledy nechal.

### Aktualizace
Stáhni nový ZIP, rozbal ho **přes původní složku** (nastavení `.env` a historie chatu v `data/`
zůstanou) a klikni na ikonu na ploše. Ikona sama pozná novou verzi: doinstaluje knihovny,
sestaví ji (okno serveru bude chvíli vidět) a restartuje běžící server.
Když se instalace po rozbalení ptá znovu na API klíč, rozbalil jsi ZIP do jiné složky.

### Ruční spuštění (pro pokročilé)
```bash
npm install
cp .env.example .env   # doplň ANTHROPIC_API_KEY
npm start              # http://localhost:8787
```

## Přístup z telefonu (Tailscale)

Nejjednodušší a bezpečný způsob, jak se z mobilu dostat ke kanceláři na počítači – odkudkoli,
bez otevírání portů na routeru:

1. Nainstaluj **Tailscale** na počítač (<https://tailscale.com/download>) a do telefonu (App Store / Google Play)
   a na obou se přihlas stejným účtem.
2. V `.env` musí být vyplněné `OFFICE_PASSWORD` (jinak server poslouchá jen lokálně).
   Na Windows při prvním spuštění povol přístup ve firewallu.
3. V telefonu otevři `http://NAZEV-POCITACE:8787` – název počítače najdeš v aplikaci Tailscale.
4. Zadej heslo a v prohlížeči zvol **Přidat na plochu**. Kancelář se pak otevírá jako aplikace.

Telefon se ke kanceláři dostane, jen když počítač běží a `npm start` je spuštěné.

## Vývoj

```bash
npm run dev:server   # API server s automatickým restartem (port 8787)
npm run dev          # kancelář s hot-reloadem na http://localhost:5173
```

## Život v městečku

Roboti nejsou zavření v kancelářích: pracují v boxech, ale občas si dojdou **nakoupit do stánků**
na náměstí (☕ kavárna, 🥐 pekárna, 🍎 ovoce, 🍦 zmrzlina) a nesou si nákup v ruce, **navštěvují se**
(pozdraví a popovídají si) nebo se **projdou** kolem radnice. V noci spí u postele.
Tlačítkem **🏛️ Svolat poradu** se všichni sejdou na radnici kolem podstavce pro Jarvise,
každý řekne, jak na tom je, a pak se rozejdou. Když agent pracuje (chat, plakátek), vrátí se ke stolu.

Logika je v `src/world3d/TownLife.tsx` (plánování činností a cest), geometrie cest a stánků
v `src/world3d/town.ts`. Pro ladění: `?ladeni&rychlost=5` v adrese zrychlí čas.

## Jarvis – mluvené hlášení a hlasový rozhovor

- Tlačítko **Jarvis** nahoře otevře Jarvise přes celou obrazovku. Jarvis sesbírá podklady
  (čas, počasí v Lipníku, zprávy ze světa, Česka a okolí, kalendář, upozornění od Bita)
  a nahlas přednese krátké hlášení: *„Dobrý večer, pane, je 22:58 a venku je jeden stupeň…“*.
  Hlášení jde po částech (úvod, počasí, svět, Česko, region, program, otázka) – vlevo se
  objevují kartičky se zprávami a programem, dole titulky, kde se rozsvěcí vyslovená slova.
- Na konci se zeptá, jestli se do něčeho pustíte, a **poslouchá** – odpovíš hlasem
  (nebo napíšeš). Mluvíš s Ondikem, takže umí zapojit kolegy (kalendář, rešerše, plakátky),
  rozhovor pokračuje, dokud nepřestaneš mluvit. Mezerník = mluvit, Esc = zavřít.
- Hlas i rozpoznávání řeči obstarává prohlížeč (zdarma, bez klíče). Nejlepší české hlasy
  má **Microsoft Edge** (Antonín, Vlasta), proto spouštěč otevírá městečko v Edge
  (Chrome: do `.env` dej `PROHLIZEC=chrome`). Hlas a rychlost se mění ozubeným kolečkem.
- Rozpoznávání řeči posílá zvuk z mikrofonu Microsoftu (Edge) nebo Googlu (Chrome).
  Na telefonu mikrofon funguje jen přes zabezpečenou adresu (https, např. Tailscale) –
  přes běžnou adresu v síti se dá Jarvisovi psát a mluví nahlas.
- **Úvodní hudba:** v nastavení Jarvise (⚙) nahraješ vlastní hudbu (MP3, M4A…, do 25 MB).
  Hraje hned po kliknutí, zatímco se hlášení připravuje (koule pulzuje do rytmu), po nastavené
  době se ztlumí pod hlas a po úvodu dozní. Soubor zůstává jen na tvém počítači (`data/jarvis-uvod.bin`).
- Hlášení píše Claude Opus 5.5 (`JARVIS_MODEL`), jedno stojí asi korunu. Oslovení se dá
  změnit v `.env`: `JARVIS_OSLOVENI=pane`.

## Automatické aktualizace

- Městečko se **aktualizuje samo z GitHubu** – už není potřeba stahovat ZIP.
  Při každém spuštění ikonou se spouštěč podívá, jestli na GitHubu není novější verze;
  když ano, stáhne ji, přepíše zdrojové soubory (tvůj `.env`, `data/` a knihovny zůstanou),
  sestaví ji a spustí. Trvá to chvilku déle než běžné spuštění (ukáže se okno se sestavováním).
- Když městečko běží dlouho, Bit každou čtvrthodinu zkontroluje GitHub a při nové verzi
  ukáže upozornění s tlačítkem **Aktualizovat** – městečko se samo aktualizuje, restartuje
  a stránka se obnoví.
- Bez internetu se prostě spustí stávající verze. Vypnutí: v `.env` řádek `AKTUALIZACE=ne`.
- Nainstalovanou verzi si spouštěč pamatuje v souboru `.verze`.

## Autopilot – městečko jede samo

- **Pozdrav po spuštění:** když městečko otevřeš ikonou, Jarvis tě sám přivítá hlášením
  (nejvýš jednou za 3 hodiny, aby neotravoval).
- **Ranní hlášení:** v nastavený čas (výchozí 7:00) se Jarvis ozve sám, když je městečko otevřené.
- **Připomínky nahlas:** 10 minut před událostí z kalendáře Jarvis řekne, co tě čeká.
- Zapíná se v nastavení Jarvise (⚙ → 🤖 Autopilot). Funguje na počítači; na telefonu Jarvis
  sám nevyskakuje. Spouštěč okně dovoluje přehrát zvuk bez kliknutí – kdyby to prohlížeč
  přesto nepovolil, Jarvis ukáže tlačítko „▶ Spustit hlášení“.
- **Rychlé zadání:** nahoře v informačním panelu je pole „Zadej úkol týmu…“ – napíšeš úkol,
  Enter, a Ondik se do toho pustí (zapojí kolegy). Klávesa **/** do pole skočí, **J** otevře Jarvise.
- Echo v noci (0–6 h, `ECHO_NOC`) nepíše hodinové plakátky a chaty si posílají jen posledních
  pár desítek zpráv – obojí šetří peníze.

### Zakázaný mikrofon

Když omylem zakážeš mikrofon, dvakrát klikni ve složce městečka na **Povolit-mikrofon.bat**.
Zavře okno městečka, smaže jeho uložená oprávnění (a zapamatovanou polohu okna – jednou ho
přetáhni zpátky na monitor) a městečko znovu otevře. Pak u Jarvise klikni na mikrofon a dej
**Povolit**. Chaty, paměť ani nastavení se nesmažou.

## Klik – spouštěč webů

- Robot Klik bydlí v boxu-kině. Jeho panel začíná **dlaždicemi**: YouTube, Spotify, Google,
  Instagram, Gmail, Mapy.cz – jedno kliknutí a web se otevře. Nahoře je **hledání**
  (vybereš službu a napíšeš, co hledat).
- Na počítači se web otevře ve tvém **výchozím prohlížeči** (tam, kde jsi přihlášený),
  ne v okně městečka. Na telefonu se otevře v telefonu.
- Vlastní dlaždice: ＋ Přidat (název, adresa, ikona, barva); ✏️ Upravit dlaždice = odebrat /
  vrátit výchozí sadu. Ukládají se do `data/spoustec.json`.
- Klikovi i Jarvisovi můžeš napsat nebo říct „pusť lofi na YouTube“, „najdi na Spotify Kabát“ –
  Ondik/Jarvis to otevře sám (nástroj `open_link`). Otevírat jde jen webové adresy (http/https).

## Tým: spolupráce a společná paměť

- **Ondik je šéf týmu.** Když požadavek potřebuje kolegu, zadá mu úkol (nástroj `ask_colleague`)
  a výsledky spojí do jedné odpovědi – např. „Najdi mi tento týden volný večer a tip na výlet“
  → Chronos najde termín, Lexa výlet (i s plakátkem). Úkoly může zadávat každý agent, kterému
  píšeš; kolega, který úkol dostal, už další kolegy nezapojuje (žádné nekonečné řetězy).
- **Společná paměť** (`data/pamet.json`): co se agenti dozvědí a bude se hodit i příště, zapíšou
  jednou větou; celý tým ji vidí u každé otázky. Najdeš ji u Ondika v záložce *🧠 Paměť a tým* –
  můžeš tam přidat vlastní poznámku nebo cokoli smazat. Tamtéž je deník spolupráce (kdo komu co zadal a co odpověděl).
- Kdo zrovna pro koho pracuje, ukazuje informační panel (*Právě teď*) i bublina nad robotem.

## Útrata

Po každém volání Claude API se sečtou tokeny a podle ceníku se spočítá **odhad** v korunách
(kurz `KURZ_USD`, výchozí 23 Kč/USD). Vidíš ho v informačním panelu (dnes, tento měsíc,
graf 14 dní, podle agentů) a ptát se na něj můžeš Bita. Ukládá se do `data/utrata.json`.
Přesná čísla a vyúčtování jsou v **Claude Console → Usage / Cost**.

## Lexa – rešerše a plakátky

- Zadáš jí v chatu rešerši („Porovnej tepelná čerpadla“, „Kam na výlet s dětmi kolem Lipníku?“).
  Lexa **hledá a čte web** (vestavěné nástroje Claude API) a odpoví se zdroji.
- Řekneš-li „udělej z toho plakátek“, vylepí výsledek jako **plakátek**: titulek, shrnutí,
  klíčová čísla, sekce, doporučení a zdroje. Otevře se sám, najdeš ho i v jejím panelu (📚 Plakátky)
  a v informačním panelu vpravo.
- Běží na **Claude Haiku 5.5** (`LEXA_MODEL`), hledání stojí navíc asi 0,25 Kč za dotaz.
  Limity na jednu odpověď: `LEXA_MAX_HLEDANI` (6) a `LEXA_MAX_CTENI` (5).

## Rozložení obrazovky

- **Vpravo informační panel**: čas a počasí, *Právě teď* (kdo co dělá – nákupy, návštěvy, porada,
  práce agentů), *Dnes na práci* (zbývající události z kalendáře, další plakátek), stav městečka a poslední plakátky.
- **Dole lišta zpráv** od Echa – jednotlivé zprávy jako bublinky; najetím myší se zastaví, kliknutím otevřeš článek.

## Bit – údržbář a správce nápadů

- Každých **15 minut** zkontroluje městečko: Claude API klíč, Google Kalendář, zdroje zpráv,
  plakátky, počasí, data a server. Výsledek je u Bita v záložce **🔧 Údržba**.
- **Připomíná přihlášení ke Googlu**: aplikace je v testovacím režimu, přihlášení platí 7 dní.
  Den předem se v městečku objeví upozornění s tlačítkem **Přihlásit** a Bit to říká i v bublině.
- Vede **seznam nápadů na vylepšení** – zapíšeš je v záložce Údržba, nebo je řekneš Bitovi v chatu.
  Bit sám navrhne další. Kód sám nemění – nápady pak předáš programátorovi (Claude Code).
- Chat běží na **Claude Haiku 5.5** (`BIT_MODEL` v `.env`).

## Echo – zpravodaj

- Každých **10 minut** projde zpravodajské weby (RSS) a nové zprávy pošle do **pásu vpravo**
  (na telefonu běží dole). Seznam zdrojů je v `server/news-sources.ts`, jejich stav vidíš v panelu Echa.
- Každou **celou hodinu** vylepí **plakátek**: souhrn ze světa, Česka a z okolí Lipníku
  + vývoj počasí na 24 hodin a 3 dny. Píše ho **Claude Haiku 5.5** (cca 1 $ měsíčně při běhu 24 h denně).
  Plakátek se sám ukáže a za 3 minuty schová; starší najdeš v panelu Echa.
- Počasí je z **Open-Meteo** (zdarma, bez klíče) pro Lipník nad Bečvou – jiné místo nastavíš v `.env`
  (`MISTO_NAZEV`, `MISTO_LAT`, `MISTO_LON`).
- Bez API klíče Echo funguje taky, jen místo souhrnu ukáže titulky.

## Chronos – Google Kalendář

1. Klikni na **Chronose** → záložka **📅 Kalendář** a projdi průvodce (jednou, cca 10 minut):
   vytvoříš si u Googlu vlastní „přihlašovací aplikaci“ (projekt v Google Cloud, zapnuté Calendar API,
   klient typu *Aplikace pro počítač*) a vložíš její **Client ID** a **Client secret**.
2. **Přihlas se přes Google** – dělej to na počítači, kde městečko běží (ne z telefonu).
   Varování „Google tuto aplikaci neověřil“ je v pořádku: *Pokročilé → Přejít na Městečko Ondik*.
3. Hotovo. Chronosovi pak piš třeba „Co mám zítra?“, „Najdi mi příští týden hodinu na zubaře“
   nebo „Zapiš oběd s Petrem ve čtvrtek ve 12“. Změny v kalendáři dělá **rovnou** a napíše, co udělal.

- Pracuje s **hlavním kalendářem**, volno hledá **každý den 8:00–20:00** (`PRACOVNI_DOBA`, `PRACOVNI_DNY` v `.env`).
- Běží na **Claude Sonnet 5.5** (`CHRONOS_MODEL` v `.env`).
- **10 minut před událostí** se v městečku objeví připomínka.
- Přihlašovací údaje i tokeny jsou jen u tebe v `data/` (`google-client.json`, `google-token.json`), na GitHub se nenahrávají.
  Odpojit jde v panelu Chronose, přístup můžeš odebrat i na https://myaccount.google.com/permissions.

## Tým

| Box         | Agent   | Role                                           | Stav |
|-------------|---------|------------------------------------------------|------|
| 🏛️ Radnice  | Ondik   | Jarvis: šéf týmu, hlasové hlášení a rozhovor, společná paměť | ✅ běží |
| 📰 Redakce  | Echo    | Zprávy ze světa, Česka a regionu, hodinové plakátky, počasí | ✅ běží |
| ✉️ Pošta    | Pošťák  | E-maily – Gmail + Centrum.cz                   | plánováno |
| 📅 Kalendář | Chronos | Google Kalendář: přehled, volno, zápis, připomínky | ✅ po propojení |
| 📚 Knihovna | Lexa    | Rešerše na webu, plakátky z rešerší            | ✅ běží |
| 💰 Finance  | Kasa    | Faktury, výdaje, předplatná                    | plánováno |
| 🎬 Kino     | Klik    | Spouštěč: YouTube, Spotify, Google… jedním kliknutím | ✅ běží |
| 🔧 Dílna    | Bit     | Údržba: kontroly, připomínky, nápady na vylepšení | ✅ běží |

## Struktura

```
server/
  index.ts       ← HTTP server: servíruje kancelář + API (/api/status, /api/chat/:agent)
  ondik.ts       ← Ondikův mozek: systémový prompt, volání Claude API (streamování)
  store.ts       ← ukládání konverzací do data/
src/
  world/agents.ts          ← definice agentů (jména, role, nástroje, hlášky)
  world/layout.ts          ← pořadí boxů v kruhu (null = volný box), rozměry
  world3d/World3D.tsx      ← 3D scéna: náměstí, světla den/noc, kamera
  world3d/OfficeBox.tsx    ← box agenta (zdi se snižují, když zakrývají výhled)
  world3d/TownHall.tsx     ← radnice s podstavcem pro Jarvise
  world3d/themes.tsx       ← vybavení boxů + místa, kam robot chodí
  world3d/props.tsx        ← 3D nábytek
  world3d/Robot3D.tsx      ← robot (tělo, animace, bubliny, nákup v ruce)
  world3d/TownLife.tsx     ← život v městečku: činnosti, cesty, návštěvy, porada
  world3d/Stall.tsx        ← stánky na náměstí
  components/Chat.tsx      ← chat s agentem
  api.ts                   ← klient serveru
```

Model: Claude Opus 5.5 (`CLAUDE_MODEL` v `.env` ho může změnit). Když model žádost odmítne,
API ji automaticky zkusí na záložním modelu (server-side fallback).

## Plán

1. **Svět** ✅ – 3D městečko: boxy agentů v kruhu, radnice, den/noc, detail agenta
2. **Mozek** ✅ – server na počítači, chat s Ondikem přes Claude, přístup z telefonu
3. **Nástroje** – Chronos (Google Kalendář) ✅, Echo ✅, Lexa ✅, Bit ✅, Pošťák (Gmail + Centrum.cz) …
4. **Živé městečko** ✅ – Ondik deleguje na kolegy, společná paměť, roboti ukazují, na čem pracují
5. **Jarvis** – hlas a hlášení ✅, telefonní hovory …
