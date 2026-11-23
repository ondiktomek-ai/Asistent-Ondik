# 🏙️ Městečko Ondik

Osobní AI asistent jako 3D městečko robotů-agentů. Každý agent má vlastní **box**, ve kterém
bydlí (postel, noční stolek) i pracuje (pracoviště podle zaměření). Boxy stojí v kruhu kolem
**radnice**, sídla CEO Ondřeje Tomka. Na radnici sedí i hlavní asistent **Ondik**, který si s tebou
povídá přes Claude a časem se z něj stane **Jarvis** – asistent, se kterým budeš mluvit hlasem
a který ti umí zavolat.

Ovládání: tažením otáčíš, kolečkem (na telefonu dvěma prsty) přibližuješ, kliknutím na box
nebo radnici se kamera přiblíží a otevře detail. V noci jdou roboti k posteli.

## Zprovoznění na počítači

1. **Nainstaluj Node.js 22 nebo novější** z <https://nodejs.org> (verze „LTS“).
2. **Stáhni projekt** (z GitHubu nebo jako ZIP) a v jeho složce otevři terminál
   (Windows: v Průzkumníku klikni do adresního řádku, napiš `cmd` a Enter).
3. Nainstaluj závislosti:
   ```bash
   npm install
   ```
4. **Nastav klíč a heslo.** Zkopíruj soubor `.env.example` jako `.env` a vyplň:
   - `ANTHROPIC_API_KEY` – klíč z <https://console.anthropic.com/settings/keys>
   - `OFFICE_PASSWORD` – heslo do kanceláře (vymysli si vlastní; bez něj kancelář běží jen na tomhle počítači)
5. Spusť kancelář:
   ```bash
   npm start
   ```
   a otevři <http://localhost:8787>. Klikni na Ondika a napiš mu.

Soubor `.env` a složka `data/` (historie chatu) zůstávají jen u tebe a na GitHub se nenahrávají.

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

## Tým

| Box         | Agent   | Role                                           | Stav |
|-------------|---------|------------------------------------------------|------|
| 🏛️ Radnice  | Ondik   | Hlavní asistent, budoucí Jarvis (hlas, hovory) | ✅ chat přes Claude |
| ✉️ Pošta    | Pošťák  | E-maily – Gmail + Centrum.cz                   | plánováno |
| 📅 Kalendář | Chronos | Google Kalendář                                | plánováno |
| 📚 Knihovna | Lexa    | Rešerše na webu a v dokumentech                | plánováno |
| 💰 Finance  | Kasa    | Faktury, výdaje, předplatná                    | plánováno |
| 🔧 Dílna    | Bit     | Automatizace, kód, GitHub                      | plánováno |
| ＋ 2× volný box | –   | Místo pro budoucí agenty                       |      |

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
  world3d/Robot3D.tsx      ← robot (chůze, bubliny)
  components/Chat.tsx      ← chat s agentem
  api.ts                   ← klient serveru
```

Model: Claude Opus 5.5 (`CLAUDE_MODEL` v `.env` ho může změnit). Když model žádost odmítne,
API ji automaticky zkusí na záložním modelu (server-side fallback).

## Plán

1. **Svět** ✅ – 3D městečko: boxy agentů v kruhu, radnice, den/noc, detail agenta
2. **Mozek** ✅ – server na počítači, chat s Ondikem přes Claude, přístup z telefonu
3. **Nástroje** – Chronos (Google Kalendář), Pošťák (Gmail + Centrum.cz), …
4. **Živé městečko** – Ondik deleguje na kolegy, roboti ukazují, na čem pracují, ranní přehled
5. **Jarvis** – Ondik dostane hlas a umí zavolat
