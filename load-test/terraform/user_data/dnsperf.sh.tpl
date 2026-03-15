#!/usr/bin/env bash
# user_data/dnsperf.sh.tpl
# Bootstraps a DNSperf instance on Amazon Linux 2023.
# Waits for the target DNS server, runs the test, and uploads results to S3.
#
# Template variables (injected by Terraform):
#   dns_server    – IP / hostname of the DNS server under test
#   dns_port      – DNS port (default 53)
#   s3_bucket     – S3 bucket for results and query file
#   result_key    – S3 object key for the results file
#   test_duration – How long to run dnsperf (seconds)
#   clients       – Number of concurrent dnsperf client threads
#   max_qps       – Max QPS (0 = unlimited)
#   aws_region    – AWS region (for aws CLI calls)
#   wait_timeout  – Seconds to wait for DNS to become ready (default: 300)

set -euxo pipefail
exec > >(tee /var/log/user-data.log) 2>&1

DNS_SERVER="${dns_server}"
DNS_PORT="${dns_port}"
S3_BUCKET="${s3_bucket}"
RESULT_KEY="${result_key}"
TEST_DURATION="${test_duration}"
CLIENTS="${clients}"
MAX_QPS="${max_qps}"
AWS_REGION="${aws_region}"
WAIT_TIMEOUT="${wait_timeout}"

# ---------------------------------------------------------------------------
# 1. System updates and dnsperf install
# ---------------------------------------------------------------------------
dnf update -y
dnf install -y aws-cli bind-utils

# dnsperf is not in the AL2023 default repos; build from source or use EPEL.
# We use a static binary approach via Docker to keep the host clean.
dnf install -y docker
systemctl enable docker
systemctl start docker

# ---------------------------------------------------------------------------
# 2. Download DNSperf query file from S3
# ---------------------------------------------------------------------------
mkdir -p /etc/dnsperf
aws s3 cp "s3://$${S3_BUCKET}/input/dnsperf.txt" /etc/dnsperf/dnsperf.txt

# ---------------------------------------------------------------------------
# 3. Wait for DNS server to become ready
# ---------------------------------------------------------------------------
echo "[dnsperf user-data] Waiting for DNS server ${dns_server}:${dns_port}..."
deadline=$(( $(date +%s) + WAIT_TIMEOUT ))
# Query the zone apex – even an NXDOMAIN / NOERROR counts as "server ready".
# The important thing is that dig exits with code 0 (not a timeout).
until dig +timeout=2 +tries=1 @"$DNS_SERVER" -p "$DNS_PORT" +noall +stats \
      healthcheck.example.com A > /dev/null 2>&1; do
  now=$(date +%s)
  if (( now >= deadline )); then
    echo "[dnsperf user-data] ERROR: DNS server did not become ready within $${WAIT_TIMEOUT}s"
    exit 1
  fi
  echo "[dnsperf user-data] Waiting... ($DNS_SERVER:$DNS_PORT not yet ready)"
  sleep 5
done
echo "[dnsperf user-data] DNS server is ready."

# ---------------------------------------------------------------------------
# 4. Build dnsperf arguments and run test via Docker
# ---------------------------------------------------------------------------
DNSPERF_ARGS="-s $DNS_SERVER -p $DNS_PORT -d /etc/dnsperf/dnsperf.txt -l $TEST_DURATION -c $CLIENTS"
if [[ "$MAX_QPS" -gt 0 ]]; then
  DNSPERF_ARGS="$DNSPERF_ARGS -Q $MAX_QPS"
fi

mkdir -p /var/results

docker run --rm \
  --network host \
  -v /etc/dnsperf:/etc/dnsperf:ro \
  -v /var/results:/results \
  ubuntu:22.04 \
  bash -c "
    apt-get update -qq && apt-get install -y -qq dnsperf > /dev/null 2>&1
    dnsperf $DNSPERF_ARGS 2>&1 | tee /results/result.txt
  "

RESULT_FILE=/var/results/result.txt

# ---------------------------------------------------------------------------
# 5. Upload results to S3
# ---------------------------------------------------------------------------
aws s3 cp "$RESULT_FILE" "s3://$${S3_BUCKET}/$${RESULT_KEY}" --region "$AWS_REGION"
echo "[dnsperf user-data] Results uploaded to s3://$${S3_BUCKET}/$${RESULT_KEY}"

# Write a sentinel object so run.sh knows this instance is done
aws s3 cp /dev/null "s3://$${S3_BUCKET}/$${RESULT_KEY}.done" --region "$AWS_REGION"
echo "[dnsperf user-data] Test complete."
