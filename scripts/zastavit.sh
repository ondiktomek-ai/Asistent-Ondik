#!/bin/bash
# Vypne server Městečka Ondik (Mac / Linux).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "$ROOT/.env" 2>/dev/null | tail -n1 | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*$//')"
PORT="${PORT:-8787}"
PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null)"
if [ -n "$PIDS" ]; then
  kill $PIDS && echo "Městečko vypnuto."
else
  echo "Městečko neběží."
fi
