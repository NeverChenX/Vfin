#!/usr/bin/env bash
set -u

repo_dir="/home/Neverchen/project/VFin"
log_dir="$repo_dir/logs"
mkdir -p "$log_dir"

ts="$(date +%Y%m%d-%H%M%S)"
log_file="$log_dir/vfin-stop-$ts.log"
unit="${1:-vfin.service}"
result="${SERVICE_RESULT:-unknown}"
code="${EXIT_CODE:-unknown}"
status="${EXIT_STATUS:-unknown}"

{
  echo "VFin stop diagnostics"
  echo "timestamp=$(date --iso-8601=seconds)"
  echo "unit=$unit"
  echo "result=$result"
  echo "exit_code=$code"
  echo "exit_status=$status"
  echo

  echo "== systemd service state =="
  systemctl --user show "$unit" \
    -p ActiveState -p SubState -p Result -p ExecMainPID -p ExecMainCode \
    -p ExecMainStatus -p NRestarts -p Restart -p MemoryCurrent 2>&1 || true
  echo

  echo "== recent service journal =="
  journalctl --user -u "$unit" --since "30 min ago" --no-pager -n 240 2>&1 || true
  echo

  echo "== port 3816 listeners/connections =="
  ss -ltnp 2>&1 | rg ':3816\\b|State' || true
  ss -tanp 2>&1 | rg ':3816\\b|State' || true
  echo

  echo "== VFin node processes =="
  ps -eo pid,ppid,stat,etime,rss,cmd | rg 'VFin|vfin|server\\.mjs|3816|npm --prefix web run dev|node' || true
  echo

  echo "== memory snapshot =="
  free -h 2>&1 || true
  echo

  echo "== possible kernel OOM lines =="
  journalctl -k --since "30 min ago" --no-pager 2>&1 | rg -i 'oom|out of memory|killed process|node' || true
} > "$log_file" 2>&1

echo "[vfin-stop-diagnostics] wrote $log_file"
