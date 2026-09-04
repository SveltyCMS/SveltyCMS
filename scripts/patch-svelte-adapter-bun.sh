#!/bin/bash
# Reproduzierbarer Patch fuer svelte-adapter-bun 1.0.1 (WS optional).
set -euo pipefail
FILE="node_modules/svelte-adapter-bun/dist/files/handler.js"
if [ ! -f "$FILE" ]; then
  echo "FEHLER: $FILE nicht gefunden — svelte-adapter-bun installiert?"; exit 1
fi
if grep -q "server.websocket?.()" "$FILE"; then
  echo "Patch bereits angewendet."; exit 0
fi
sed -i 's/const websocket = server.websocket();/const websocket = server.websocket?.() ?? null;/' "$FILE"
echo "OK: WS-Patch angewendet"
