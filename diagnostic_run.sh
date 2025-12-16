#!/usr/bin/env bash
# One-shot diagnostic runner:
#  - optional per-run Centrifugo recovery disablement (history off)
#  - pre/post HAProxy/Redis snapshots
#  - 5s metrics sampling (HAProxy/Centrifugo/docker stats) during load
#  - runs the emulator load test and stores everything under logs/diagnostic_run_<timestamp>
set -euo pipefail

CLIENTS=${CLIENTS:-5000}
CYCLES=${CYCLES:-5}
LENGTH=${LENGTH:-100}
DELAY=${DELAY:-0.01}
RAMP_MS=${RAMP_MS:-5}
SAMPLE_INTERVAL=${SAMPLE_INTERVAL:-5}
DISABLE_RECOVERY=${DISABLE_RECOVERY:-0} # set to 1 to disable Centrifugo recovery (no history) for this run

HA_PROXY_STATS_URL=${HA_PROXY_STATS_URL:-http://localhost:8404/stats;csv}
CENTRIFUGO_PORTS=${CENTRIFUGO_PORTS:-"8100 8200 8300"}
COMPOSE_BIN=${COMPOSE_BIN:-docker-compose}

ts() { date +"%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(ts)] $*"; }

RUN_TS=$(date +%Y%m%d_%H%M%S)
RUN_DIR="logs/diagnostic_run_${CLIENTS}c_${CYCLES}cy_${RUN_TS}"
mkdir -p "$RUN_DIR"

snapshot_haproxy() {
  local phase=$1
  curl -s "$HA_PROXY_STATS_URL" > "${RUN_DIR}/haproxy_${phase}.csv" || true
}

snapshot_redis() {
  local phase=$1
  {
    echo "### redis info stats"
    $COMPOSE_BIN exec -T redis redis-cli info stats
    echo
    echo "### redis slowlog (20)"
    $COMPOSE_BIN exec -T redis redis-cli slowlog get 20
  } > "${RUN_DIR}/redis_${phase}.txt" || true
}

snapshot_inspect() {
  local phase=$1
  if [ -x ./inspect_stack.sh ]; then
    ./inspect_stack.sh > "${RUN_DIR}/inspect_${phase}.txt" || true
  fi
}

prepare_no_recovery_configs() {
  local out_dir=".diagnostic/no_recovery"
  mkdir -p "$out_dir"
  python - <<'PY'
import json
from pathlib import Path

srcs = [
    Path("centrifugo/config_node1.json"),
    Path("centrifugo/config_node2.json"),
    Path("centrifugo/config_node3.json"),
]
out_dir = Path(".diagnostic/no_recovery")
out_dir.mkdir(parents=True, exist_ok=True)

for src in srcs:
    data = json.loads(src.read_text())
    for ns in data.get("namespaces", []):
        if ns.get("name") == "session":
            ns["history_size"] = 0
            ns["history_ttl"] = "0s"
            ns["force_recovery"] = False
            ns["force_positioning"] = False
    out = out_dir / src.name
    out.write_text(json.dumps(data, indent=2))
PY

  cat > "$out_dir/docker-compose.override.yml" <<'EOF'
services:
  centrifugo_node1:
    volumes:
      - ./.diagnostic/no_recovery/config_node1.json:/centrifugo/config.json:ro
  centrifugo_node2:
    volumes:
      - ./.diagnostic/no_recovery/config_node2.json:/centrifugo/config.json:ro
  centrifugo_node3:
    volumes:
      - ./.diagnostic/no_recovery/config_node3.json:/centrifugo/config.json:ro
EOF

  log "Prepared no-recovery Centrifugo configs under $out_dir"
  log "Apply with: $COMPOSE_BIN -f docker-compose.yml -f $out_dir/docker-compose.override.yml up -d --force-recreate centrifugo_node1 centrifugo_node2 centrifugo_node3"
}

start_sampler() {
  log "Starting ${SAMPLE_INTERVAL}s sampler (HAProxy/Centrifugo/docker stats)..."
  (
    while true; do
      echo "### $(ts)" >> "${RUN_DIR}/metrics_samples.log"
      curl -s "$HA_PROXY_STATS_URL" | grep -E '^(fastapi_|centrifugo_)' >> "${RUN_DIR}/metrics_samples.log" || true
      for port in $CENTRIFUGO_PORTS; do
        echo "-- centrifugo $port" >> "${RUN_DIR}/metrics_samples.log"
        curl -s --max-time 2 "http://localhost:${port}/metrics" \
          | grep -E 'centrifugo_client_num_server_disconnects|centrifugo_node_num_clients|process_resident_memory_bytes|process_cpu_seconds_total' \
          >> "${RUN_DIR}/metrics_samples.log" || echo "[warn] metrics unavailable on ${port}" >> "${RUN_DIR}/metrics_samples.log"
      done
      echo "-- docker stats" >> "${RUN_DIR}/metrics_samples.log"
      docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" \
        centrifugo_node1 centrifugo_node2 centrifugo_node3 granian1 granian2 granian3 granian4 haproxy redis \
        >> "${RUN_DIR}/metrics_samples.log" 2>/dev/null || true
      echo >> "${RUN_DIR}/metrics_samples.log"
      sleep "$SAMPLE_INTERVAL"
    done
  ) &
  SAMPLER_PID=$!
}

stop_sampler() {
  if [ -n "${SAMPLER_PID:-}" ] && kill -0 "$SAMPLER_PID" 2>/dev/null; then
    log "Stopping sampler (pid=$SAMPLER_PID)"
    kill "$SAMPLER_PID" || true
    wait "$SAMPLER_PID" 2>/dev/null || true
  fi
}

log "Diagnostic run folder: $RUN_DIR"
log "Config: clients=$CLIENTS cycles=$CYCLES length=$LENGTH delay=$DELAY ramp_ms=$RAMP_MS sample=${SAMPLE_INTERVAL}s disable_recovery=$DISABLE_RECOVERY"

if [ "$DISABLE_RECOVERY" -eq 1 ]; then
  prepare_no_recovery_configs
  log "Restart Centrifugo with no-recovery override before running this script (see command above)."
fi

log "Taking pre-run snapshots..."
snapshot_inspect "pre"
snapshot_haproxy "pre"
snapshot_redis "pre"

start_sampler
trap stop_sampler EXIT

log "Starting load test..."
uv run python run_emulator.py \
  --clients "$CLIENTS" \
  --cycles "$CYCLES" \
  --length "$LENGTH" \
  --delay "$DELAY" \
  --ramp-delay-ms "$RAMP_MS" \
  2>&1 | tee "${RUN_DIR}/load_test_stdout.log"

stop_sampler

log "Taking post-run snapshots..."
snapshot_inspect "post"
snapshot_haproxy "post"
snapshot_redis "post"

log "Diagnostics complete. Artifacts in: $RUN_DIR"
