#!/bin/bash
# Instalace Městečka Ondik na Macu (a Linuxu).
# Spouští se dvojklikem na „Nainstalovat-Mac.command“. Dá se pustit opakovaně – .env nepřepíše.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

zluta() { printf '\n\033[33m> %s\033[0m\n' "$1"; }
ok() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }
konec() { printf '\n  \033[31mCHYBA\033[0m  %s\n' "$1"; read -r -p "Stiskni Enter pro zavření…" _; exit 1; }
verze_node() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }

echo "=============================================="
echo "   Městečko Ondik – instalace"
echo "=============================================="
echo "Složka: $ROOT"

# Soubory stažené z internetu macOS „zamyká“ – odemkneme je, ať jde zástupce spustit.
[ "$(uname)" = "Darwin" ] && xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null

zluta "Kontroluji Node.js"
if [ "$(verze_node)" = "" ] || [ "$(verze_node)" -lt 22 ] 2>/dev/null; then
  echo "  Node.js 22 nebo novější tu není."
  if command -v brew >/dev/null; then
    read -r -p "  Mám ho nainstalovat přes Homebrew? (a/n) " ODP
    [[ "$ODP" =~ ^[aAyY] ]] && brew install node
  fi
  if [ "$(verze_node)" = "" ] || [ "$(verze_node)" -lt 22 ] 2>/dev/null; then
    { [ "$(uname)" = "Darwin" ] && open "https://nodejs.org/cs/download"; } || true
    konec "Nainstaluj Node.js (verze LTS) z https://nodejs.org a spusť instalaci znovu."
  fi
fi
ok "Node.js $(node -v)"

zluta "Stahuji knihovny (poprvé to může trvat pár minut)"
npm install --no-fund --no-audit || konec "npm install selhal – zkontroluj připojení k internetu."
ok "Knihovny jsou připravené"

if [ ! -f .env ]; then
  zluta "Nastavení"
  echo "  API klíč najdeš na https://console.anthropic.com/settings/keys (při vkládání není vidět)"
  read -r -s -p "  Claude API klíč: " KLIC; echo
  [[ -n "$KLIC" && "$KLIC" != sk-ant-* ]] && echo "  Pozor: klíč obvykle začíná „sk-ant-“. Kdyžtak ho oprav v souboru .env."
  echo "  Heslo do městečka je potřeba jen pro přístup z telefonu."
  read -r -p "  Heslo (Enter = bez hesla, jen tento počítač): " HESLO
  umask 077
  cat >.env <<ENV
# Nastavení Městečka Ondik (vytvořila instalace). Klíč nikomu neposílej.
ANTHROPIC_API_KEY=$KLIC
OFFICE_PASSWORD=$HESLO
PORT=8787

# Okno městečka: pozice levého horního rohu (x,y), např. 1980,80 pro druhý monitor vpravo; celá obrazovka ano/ne
OKNO_POZICE=
OKNO_CELA_OBRAZOVKA=ne
ENV
  ok "Nastavení uloženo do .env"
else
  ok "Nastavení (.env) už existuje – nechávám ho beze změny"
fi

zluta "Sestavuji městečko"
npm run build || konec "Sestavení selhalo – pošli mi prosím text chyby výše."
ok "Hotovo"

zluta "Vytvářím zástupce na ploše"
chmod +x scripts/*.sh
if [ "$(uname)" = "Darwin" ]; then
  CIL="$HOME/Desktop/Městečko Ondik.app"
  rm -rf "$CIL"
  if osacompile -o "$CIL" -e "do shell script quoted form of \"$ROOT/scripts/spustit.sh\" & \" >/dev/null 2>&1 &\"" 2>/dev/null; then
    # vlastní ikona robota
    osascript -l JavaScript -e "ObjC.import('AppKit'); \$.NSWorkspace.sharedWorkspace.setIconForFileOptions(\$.NSImage.alloc.initWithContentsOfFile('$ROOT/public/icon-512.png'), '$CIL', 0)" >/dev/null 2>&1
  else
    CIL="$HOME/Desktop/Městečko Ondik.command"
    printf '#!/bin/bash\n"%s/scripts/spustit.sh"\n' "$ROOT" >"$CIL"
    chmod +x "$CIL"
  fi
else
  PLOCHA="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
  mkdir -p "$PLOCHA"
  CIL="$PLOCHA/mestecko-ondik.desktop"
  cat >"$CIL" <<DESK
[Desktop Entry]
Type=Application
Name=Městečko Ondik
Comment=Spustí Městečko Ondik
Exec="$ROOT/scripts/spustit.sh"
Icon=$ROOT/public/icon-512.png
Terminal=false
DESK
  chmod +x "$CIL"
  command -v gio >/dev/null && gio set "$CIL" metadata::trusted true 2>/dev/null
fi
ok "Zástupce: $CIL"

echo
echo "=============================================="
echo "   Hotovo! Městečko spustíš ikonou na ploše."
echo "=============================================="
read -r -p "Spustit městečko hned teď? (a/n, Enter = a) " ODP
if [ -z "$ODP" ] || [[ "$ODP" =~ ^[aAyY] ]]; then "$ROOT/scripts/spustit.sh"; fi
