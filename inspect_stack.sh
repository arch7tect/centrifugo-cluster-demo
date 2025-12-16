#!/usr/bin/env bash
# Quick inspection helper for emulator stack: HAProxy, Centrifugo nodes, Redis, Docker stats.

set -euo pipefail

HA_PROXY_STATS_URL=${HA_PROXY_STATS_URL:-http://localhost:8404/stats;csv}
CENTRIFUGO_PORTS=${CENTRIFUGO_PORTS:-"8100 8200 8300"}

haproxy_summary() {
  echo "== HAProxy backends (smax/stot/err) =="
  curl -s "$HA_PROXY_STATS_URL" | grep -E '^(fastapi_|centrifugo_)' | cut -d',' -f1,2,5,6,7,9,10,15,16,18,20 | column -s, -t || true
}

redis_summary() {
  echo "== Redis stats =="
  docker exec -i redis redis-cli info stats | grep -E 'instantaneous_ops_per_sec|total_commands_processed|keyspace_hits|keyspace_misses|pubsub_channels|rejected_connections' || true
  echo "-- slowlog (top 5) --"
  docker exec -i redis redis-cli slowlog get 5 || true
}

centrifugo_summary() {
  echo "== Centrifugo metrics (per node) =="
  for port in $CENTRIFUGO_PORTS; do
    echo "-- port $port --"
    if ! curl -s --max-time 2 "http://localhost:${port}/metrics" \
      | grep -E 'centrifugo_client_num_server_disconnects|centrifugo_node_num_clients|process_resident_memory_bytes|process_cpu_seconds_total'; then
      echo "[warn] metrics unavailable on $port"
    fi
  done
}

docker_stats() {
  echo "== Docker stats (no stream) =="
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" \
    centrifugo_node1 centrifugo_node2 centrifugo_node3 granian1 granian2 granian3 granian4 haproxy redis || true
}

main() {
  haproxy_summary
  echo
  centrifugo_summary
  echo
  redis_summary
  echo
  docker_stats
}

main "$@"
