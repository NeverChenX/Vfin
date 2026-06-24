#!/usr/bin/env bash
set -u

port="${1:-3816}"

if ss -ltnH | grep -Eq "[:.]${port}\\b"; then
  echo "[vfin-preflight] port $port is already in use"
  ss -ltnp | grep -E "[:.]${port}\\b" || true
  exit 1
fi

echo "[vfin-preflight] port $port is free"
