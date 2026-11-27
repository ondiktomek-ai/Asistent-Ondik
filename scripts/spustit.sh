#!/bin/bash
# Spuštění Městečka Ondik na Macu / Linuxu – volá ho zástupce na ploše.
# Když server neběží, spustí ho na pozadí (log v data/server.log), pak otevře okno městečka.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
# Zástupce na Macu nemá PATH z terminálu – přidáme obvyklá místa, kde je Node.js.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"

nastaveni() { grep -E "^[[:space:]]*$1[[:space:]]*=" .env 2>/dev/null | tail -n1 | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*$//'; }
PORT="$(nastaveni PORT)"; PORT="${PORT:-8787}"
URL="http://localhost:$PORT"
bezi() { curl -fs --max-time 2 "$URL/api/status" >/dev/null 2>&1; }

if ! bezi; then
  if [ ! -d node_modules ] || [ ! -f dist/index.html ]; then
    echo "Městečko ještě není nainstalované – spusť Nainstalovat-Mac.command."
    exit 1
  fi
  mkdir -p data
  # smyčka: kód 75 = server žádá o restart (obnova po výpadku služeb) → spustí se znovu
  MESTECKO_SMYCKA=1 nohup bash -c 'while :; do npm run serve; [ $? -eq 75 ] || break; sleep 3; done' >data/server.log 2>&1 &
  for _ in $(seq 1 60); do
    sleep 0.5
    bezi && break
  done
  if ! bezi; then
    echo "Server se nepodařilo spustit. Detaily: $ROOT/data/server.log"
    tail -n 20 data/server.log
    exit 1
  fi
fi

POZICE="$(nastaveni OKNO_POZICE)"
CELA="$(nastaveni OKNO_CELA_OBRAZOVKA)"
ARGS=("--app=$URL" "--no-first-run" "--no-default-browser-check")
[[ "$POZICE" =~ ^-?[0-9]+,-?[0-9]+$ ]] && ARGS+=("--window-position=$POZICE")
[ "$CELA" = "ano" ] && ARGS+=("--start-fullscreen")

if [ "$(uname)" = "Darwin" ]; then
  PROFIL="$HOME/Library/Application Support/MesteckoOndik/okno"
  for APP in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
    if open -Ra "$APP" 2>/dev/null; then
      open -na "$APP" --args "--user-data-dir=$PROFIL" "${ARGS[@]}"
      exit 0
    fi
  done
  open "$URL"
else
  PROFIL="$HOME/.local/share/mestecko-ondik/okno"
  for B in google-chrome chromium chromium-browser microsoft-edge; do
    if command -v "$B" >/dev/null; then
      nohup "$B" "--user-data-dir=$PROFIL" "${ARGS[@]}" >/dev/null 2>&1 &
      exit 0
    fi
  done
  xdg-open "$URL" >/dev/null 2>&1 &
fi
