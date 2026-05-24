#!/usr/bin/env bash
# Start both gateway (Express :18080) and web (Next.js :3816) for local dev.
# Each child gets its own process group; SIGINT propagates.

set -e
cd "$(dirname "$0")/.."

if [ ! -d gateway/node_modules ]; then
  echo "[start-all] installing gateway deps..."
  npm --prefix gateway install
fi

if [ ! -d web/node_modules ]; then
  echo "[start-all] installing web deps..."
  npm --prefix web install
fi

if [ ! -d node_modules ]; then
  echo "[start-all] installing root deps (concurrently)..."
  npm install
fi

exec npm run dev
