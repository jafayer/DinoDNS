#!/usr/bin/env bash
# entrypoint.sh – run dnsperf against a target DNS server.
#
# Environment variables:
#   DNS_SERVER      IP / hostname of the DNS server to test  (required)
#   DNS_PORT        DNS port                                  (default: 53)
#   QUERY_FILE      Path to the dnsperf query file            (default: /etc/dnsperf/dnsperf.txt)
#   TEST_DURATION   How long to run the test in seconds       (default: 30)
#   MAX_QPS         Max queries per second (0 = unlimited)    (default: 0)
#   CLIENTS         Number of concurrent clients              (default: 10)
#   RESULT_FILE     Write raw dnsperf output here             (default: /tmp/dnsperf-results.txt)
#   WAIT_TIMEOUT    Seconds to wait for DNS to become ready   (default: 120)

set -euo pipefail

DNS_SERVER="${DNS_SERVER:?DNS_SERVER must be set}"
DNS_PORT="${DNS_PORT:-53}"
QUERY_FILE="${QUERY_FILE:-/etc/dnsperf/dnsperf.txt}"
TEST_DURATION="${TEST_DURATION:-30}"
MAX_QPS="${MAX_QPS:-0}"
CLIENTS="${CLIENTS:-10}"
RESULT_FILE="${RESULT_FILE:-/tmp/dnsperf-results.txt}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-120}"

# ---------------------------------------------------------------------------
# Wait until DNS server is accepting queries
# ---------------------------------------------------------------------------
echo "[dnsperf] Waiting for DNS server ${DNS_SERVER}:${DNS_PORT} to become ready..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
until dig +timeout=2 +tries=1 @"${DNS_SERVER}" -p "${DNS_PORT}" +noall +stats \
      healthcheck.example.com A > /dev/null 2>&1; do
  now=$(date +%s)
  if (( now >= deadline )); then
    echo "[dnsperf] ERROR: DNS server ${DNS_SERVER}:${DNS_PORT} did not become ready within ${WAIT_TIMEOUT}s"
    exit 1
  fi
  echo "[dnsperf] Waiting... (${DNS_SERVER}:${DNS_PORT} not yet ready)"
  sleep 2
done
echo "[dnsperf] DNS server is ready."

# ---------------------------------------------------------------------------
# Build dnsperf command
# ---------------------------------------------------------------------------
DNSPERF_ARGS=(
  -s "${DNS_SERVER}"
  -p "${DNS_PORT}"
  -d "${QUERY_FILE}"
  -l "${TEST_DURATION}"
  -c "${CLIENTS}"
)

if [[ "${MAX_QPS}" -gt 0 ]]; then
  DNSPERF_ARGS+=(-Q "${MAX_QPS}")
fi

echo "[dnsperf] Running: dnsperf ${DNSPERF_ARGS[*]}"
echo "[dnsperf] Results will be saved to ${RESULT_FILE}"
echo ""

# Run dnsperf, tee output to file and stdout
dnsperf "${DNSPERF_ARGS[@]}" 2>&1 | tee "${RESULT_FILE}"

echo ""
echo "[dnsperf] Test complete. Results saved to ${RESULT_FILE}"
