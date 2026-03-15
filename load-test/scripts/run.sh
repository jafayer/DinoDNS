#!/usr/bin/env bash
# run.sh – end-to-end AWS load test orchestration
#
# Requirements:
#   - AWS credentials in environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#     or an active AWS_PROFILE / IAM role)
#   - docker  (to build the DinoDNS image)
#   - terraform (>= 1.5)
#   - node / npm  (to generate test domains)
#   - aws CLI
#
# Usage:
#   ./load-test/scripts/run.sh [OPTIONS]
#
# Options (all optional – sensible defaults apply):
#   --region            AWS region             (default: us-east-1)
#   --count             Random domain count    (default: 100)
#   --duration          DNSperf test duration  (default: 30)
#   --clients           DNSperf client threads (default: 10)
#   --max-qps           DNSperf max QPS        (default: 0 = unlimited)
#   --dinodns-type      EC2 instance type for DinoDNS    (default: t3.small)
#   --dinodns-count     Number of DinoDNS instances      (default: 1)
#   --dinodns-cluster   Enable Node.js cluster mode      (default: false)
#   --coredns-type      EC2 instance type for CoreDNS    (default: t3.small)
#   --coredns-count     Number of CoreDNS instances      (default: 1)
#   --dnsperf-type      EC2 instance type for DNSperf    (default: t3.small)
#   --results-dir       Where to write results locally   (default: ./load-test/results)
#   --no-destroy        Do NOT destroy infrastructure after the test
#   --tf-dir            Path to terraform directory      (default: ./load-test/terraform)

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
AWS_REGION="us-east-1"
DOMAIN_COUNT=100
TEST_DURATION=30
DNSPERF_CLIENTS=10
DNSPERF_MAX_QPS=0
DINODNS_INSTANCE_TYPE="t3.small"
DINODNS_INSTANCE_COUNT=1
DINODNS_CLUSTER_MODE="false"
COREDNS_INSTANCE_TYPE="t3.small"
COREDNS_INSTANCE_COUNT=1
DNSPERF_INSTANCE_TYPE="t3.small"
RESULTS_DIR=""
DESTROY=true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TF_DIR="$REPO_ROOT/load-test/terraform"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --region)            AWS_REGION="$2"; shift 2 ;;
    --count)             DOMAIN_COUNT="$2"; shift 2 ;;
    --duration)          TEST_DURATION="$2"; shift 2 ;;
    --clients)           DNSPERF_CLIENTS="$2"; shift 2 ;;
    --max-qps)           DNSPERF_MAX_QPS="$2"; shift 2 ;;
    --dinodns-type)      DINODNS_INSTANCE_TYPE="$2"; shift 2 ;;
    --dinodns-count)     DINODNS_INSTANCE_COUNT="$2"; shift 2 ;;
    --dinodns-cluster)   DINODNS_CLUSTER_MODE="true"; shift ;;
    --coredns-type)      COREDNS_INSTANCE_TYPE="$2"; shift 2 ;;
    --coredns-count)     COREDNS_INSTANCE_COUNT="$2"; shift 2 ;;
    --dnsperf-type)      DNSPERF_INSTANCE_TYPE="$2"; shift 2 ;;
    --results-dir)       RESULTS_DIR="$2"; shift 2 ;;
    --no-destroy)        DESTROY=false; shift ;;
    --tf-dir)            TF_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

RESULTS_DIR="${RESULTS_DIR:-$REPO_ROOT/load-test/results}"
OUTPUT_DIR="$REPO_ROOT/load-test/output"

mkdir -p "$RESULTS_DIR" "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[run.sh] $*"; }

require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' is required but not found in PATH."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
require_cmd aws
require_cmd docker
require_cmd terraform
require_cmd node

log "Checking AWS credentials..."
aws sts get-caller-identity --region "$AWS_REGION" > /dev/null

# ---------------------------------------------------------------------------
# Step 1: Generate domain list
# ---------------------------------------------------------------------------
log "Generating $DOMAIN_COUNT random domain names..."
node "$SCRIPT_DIR/generate-domains.js" --count "$DOMAIN_COUNT" --output-dir "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Step 2: Bootstrap Terraform (creates ECR repo + S3 bucket first)
#         We do a targeted apply to get the ECR URL before building the image.
# ---------------------------------------------------------------------------
log "Initialising Terraform..."
terraform -chdir="$TF_DIR" init -input=false

TF_VARS=(
  -var "aws_region=$AWS_REGION"
  -var "domain_count=$DOMAIN_COUNT"
  -var "test_duration=$TEST_DURATION"
  -var "dnsperf_clients=$DNSPERF_CLIENTS"
  -var "dnsperf_max_qps=$DNSPERF_MAX_QPS"
  -var "dinodns_instance_type=$DINODNS_INSTANCE_TYPE"
  -var "dinodns_instance_count=$DINODNS_INSTANCE_COUNT"
  -var "dinodns_cluster_mode=$DINODNS_CLUSTER_MODE"
  -var "coredns_instance_type=$COREDNS_INSTANCE_TYPE"
  -var "coredns_instance_count=$COREDNS_INSTANCE_COUNT"
  -var "dnsperf_instance_type=$DNSPERF_INSTANCE_TYPE"
)

log "Provisioning ECR repository and S3 bucket (targeted apply)..."
terraform -chdir="$TF_DIR" apply -auto-approve -input=false \
  -target=aws_ecr_repository.dinodns \
  -target=aws_ecr_lifecycle_policy.dinodns \
  -target=aws_s3_bucket.results \
  -target=aws_s3_bucket_public_access_block.results \
  -target=random_id.suffix \
  "${TF_VARS[@]}"

ECR_URL=$(terraform -chdir="$TF_DIR" output -raw ecr_repository_url)
S3_BUCKET=$(terraform -chdir="$TF_DIR" output -raw results_s3_bucket)
log "ECR URL:    $ECR_URL"
log "S3 bucket:  $S3_BUCKET"

# ---------------------------------------------------------------------------
# Step 3: Build and push DinoDNS Docker image from current branch
# ---------------------------------------------------------------------------
log "Building DinoDNS Docker image from current branch..."
GIT_SHORT=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
if ! git -C "$REPO_ROOT" diff --quiet HEAD 2>/dev/null; then
  GIT_SHORT="${GIT_SHORT}-dirty"
  log "WARNING: Working tree has uncommitted changes. Image tag will include '-dirty' suffix."
fi
IMAGE_TAG="loadtest-${GIT_SHORT}"
FULL_IMAGE="$ECR_URL:$IMAGE_TAG"

docker build \
  -f "$REPO_ROOT/load-test/docker/dinodns/Dockerfile" \
  -t "$FULL_IMAGE" \
  "$REPO_ROOT"

log "Pushing DinoDNS image to ECR: $FULL_IMAGE"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$(echo "$ECR_URL" | cut -d/ -f1)"
docker push "$FULL_IMAGE"

# ---------------------------------------------------------------------------
# Step 4: Upload input files to S3
# ---------------------------------------------------------------------------
log "Uploading domain files to S3..."
aws s3 cp "$OUTPUT_DIR/dinodns-records.txt" "s3://$S3_BUCKET/input/dinodns-records.txt"
aws s3 cp "$OUTPUT_DIR/Corefile"            "s3://$S3_BUCKET/input/Corefile"
aws s3 cp "$OUTPUT_DIR/db.example.com"      "s3://$S3_BUCKET/input/db.example.com"
aws s3 cp "$OUTPUT_DIR/dnsperf.txt"         "s3://$S3_BUCKET/input/dnsperf.txt"

# ---------------------------------------------------------------------------
# Step 5: Full Terraform apply (provision all EC2 instances)
# ---------------------------------------------------------------------------
log "Provisioning all EC2 instances..."
terraform -chdir="$TF_DIR" apply -auto-approve -input=false \
  "${TF_VARS[@]}" \
  -var "dinodns_ecr_image_tag=$IMAGE_TAG"

# ---------------------------------------------------------------------------
# Step 6: Wait for DNSperf results to appear in S3
# ---------------------------------------------------------------------------
log "Waiting for DNSperf test results (this will take ~$TEST_DURATION seconds + bootstrap time)..."

WAIT_MAX=600  # 10 minutes total timeout
POLL_INTERVAL=15

wait_for_result() {
  local key="$1"
  local done_key="${key}.done"
  local deadline=$(( $(date +%s) + WAIT_MAX ))

  while true; do
    if aws s3 ls "s3://$S3_BUCKET/$done_key" &>/dev/null; then
      log "Result available: $key"
      return 0
    fi
    now=$(date +%s)
    if (( now >= deadline )); then
      log "ERROR: Timed out waiting for $key"
      return 1
    fi
    log "  Still waiting for $key..."
    sleep "$POLL_INTERVAL"
  done
}

wait_for_result "results/dnsperf-dinodns.txt"
wait_for_result "results/dnsperf-coredns.txt"

# ---------------------------------------------------------------------------
# Step 7: Download and display results
# ---------------------------------------------------------------------------
log "Downloading results..."
aws s3 cp "s3://$S3_BUCKET/results/dnsperf-dinodns.txt" "$RESULTS_DIR/dnsperf-dinodns.txt"
aws s3 cp "s3://$S3_BUCKET/results/dnsperf-coredns.txt" "$RESULTS_DIR/dnsperf-coredns.txt"

echo ""
echo "============================================================"
echo "  DinoDNS Results"
echo "============================================================"
cat "$RESULTS_DIR/dnsperf-dinodns.txt"

echo ""
echo "============================================================"
echo "  CoreDNS Results"
echo "============================================================"
cat "$RESULTS_DIR/dnsperf-coredns.txt"

echo ""
log "Results saved to $RESULTS_DIR/"

# ---------------------------------------------------------------------------
# Step 8: Destroy infrastructure (unless --no-destroy)
# ---------------------------------------------------------------------------
if [[ "$DESTROY" == "true" ]]; then
  log "Destroying AWS infrastructure..."
  terraform -chdir="$TF_DIR" destroy -auto-approve -input=false "${TF_VARS[@]}"
  log "Infrastructure destroyed."
else
  log "--no-destroy specified; skipping terraform destroy."
  log "To clean up manually: terraform -chdir=$TF_DIR destroy -auto-approve"
fi

log "Done."
