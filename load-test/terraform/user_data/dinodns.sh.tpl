#!/usr/bin/env bash
# user_data/dinodns.sh.tpl
# Bootstraps a DinoDNS instance on Amazon Linux 2023.
#
# Template variables (injected by Terraform):
#   aws_region    – AWS region (for ECR login)
#   ecr_image_url – full ECR image URI including tag
#   s3_bucket     – S3 bucket containing domain files
#   dns_port      – port to expose (default 53)
#   cluster_mode  – "true" / "false"

set -euxo pipefail
exec > >(tee /var/log/user-data.log) 2>&1

AWS_REGION="${aws_region}"
ECR_IMAGE_URL="${ecr_image_url}"
S3_BUCKET="${s3_bucket}"
DNS_PORT="${dns_port}"
CLUSTER_MODE="${cluster_mode}"

# ---------------------------------------------------------------------------
# 1. System updates and Docker install
# ---------------------------------------------------------------------------
dnf update -y
dnf install -y docker aws-cli

systemctl enable docker
systemctl start docker

# ---------------------------------------------------------------------------
# 2. Download domain records from S3
# ---------------------------------------------------------------------------
mkdir -p /etc/dinodns
aws s3 cp "s3://$${S3_BUCKET}/input/dinodns-records.txt" /etc/dinodns/dinodns-records.txt

# ---------------------------------------------------------------------------
# 3. Authenticate with ECR and pull the DinoDNS image
# ---------------------------------------------------------------------------
ECR_REGISTRY=$(echo "$ECR_IMAGE_URL" | cut -d/ -f1)
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker pull "$ECR_IMAGE_URL"

# ---------------------------------------------------------------------------
# 4. Run DinoDNS
# ---------------------------------------------------------------------------
docker run -d \
  --name dinodns \
  --restart unless-stopped \
  --network host \
  -e RECORDS_FILE=/etc/dinodns/dinodns-records.txt \
  -e DNS_PORT="$DNS_PORT" \
  -e CLUSTER_MODE="$CLUSTER_MODE" \
  -v /etc/dinodns:/etc/dinodns:ro \
  "$ECR_IMAGE_URL"

echo "[dinodns user-data] Bootstrap complete."
