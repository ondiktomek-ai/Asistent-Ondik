# 🏢 Kancelář Ondik

Osobní AI asistent jako kancelářská budova plná robotů-agentů. Každý agent
má vlastní kancelář vybavenou podle toho, co dělá, a později bude napojený na
skutečné nástroje (e-mail, kalendář, web, úkoly…).

## Spuštění

```bash
npm install
npm run dev      # vývojový server na http://localhost:5173
npm run build    # produkční build do dist/
```

## Tým

| Kancelář   | Agent   | Role                                           |
|------------|---------|------------------------------------------------|
| ⭐ Recepce  | Ondik   | Hlavní asistent – přijímá požadavky a deleguje |
| ✉️ Pošta    | Pošťák  | E-maily – Gmail + Centrum.cz                   |
| 📅 Kalendář | Chronos | Google Kalendář                                |
| 📚 Knihovna | Lexa    | Rešerše na webu a v dokumentech                |
| 💰 Finance  | Kasa    | Faktury, výdaje, předplatná                    |
| 🔧 Dílna    | Bit     | Automatizace, kód, GitHub                      |
| ＋ Volno    | –       | Volná kancelář pro budoucího agenta            |

## Struktura

```
src/
  world/agents.ts      ← definice agentů (jména, role, nástroje, hlášky) – tady se agenti nastavují
  world/layout.ts      ← půdorys budovy: kanceláře, chodba, dveře (agentId: null = volná kancelář)
  components/themes.tsx    ← vybavení jednotlivých kanceláří + místa, kam robot chodí
  components/Furniture.tsx ← knihovna nábytku (SVG)
  components/Robot.tsx     ← robot (animace, bubliny)
  components/World.tsx     ← skládá celý svět, den/noc
  components/AgentPanel.tsx← detail agenta
  hooks/useRobots.ts       ← simulace pohybu robotů
```

## Plán

1. **Svět** ✅ – budova, kanceláře, roboti, den/noc, detail agenta
2. **Mozek** – backend s Claude (Agent SDK), Ondik jako koordinátor, ostatní jako sub-agenti
3. **Nástroje** – napojení přes MCP/konektory (Gmail, Google Kalendář, web, úkoly…)
4. **Živá kancelář** – roboti ukazují, na čem právě pracují; chat s agenty; ranní přehled
