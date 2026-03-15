#!/usr/bin/env bash
# user_data/coredns.sh.tpl
# Bootstraps a CoreDNS instance on Amazon Linux 2023.
#
# Template variables (injected by Terraform):
#   s3_bucket  – S3 bucket containing the Corefile and zone file
#   dns_port   – DNS port (default 53)

set -euxo pipefail
exec > >(tee /var/log/user-data.log) 2>&1

S3_BUCKET="${s3_bucket}"
DNS_PORT="${dns_port}"

# ---------------------------------------------------------------------------
# 1. System updates and tools
# ---------------------------------------------------------------------------
dnf update -y
dnf install -y docker aws-cli

systemctl enable docker
systemctl start docker

# ---------------------------------------------------------------------------
# 2. Download CoreDNS config files from S3
# ---------------------------------------------------------------------------
mkdir -p /etc/coredns
aws s3 cp "s3://$${S3_BUCKET}/input/Corefile"         /etc/coredns/Corefile
aws s3 cp "s3://$${S3_BUCKET}/input/db.example.com"   /etc/coredns/db.example.com

# If using a non-standard port rewrite the Corefile zone header
if [[ "$DNS_PORT" != "53" ]]; then
  sed -i "s/^example\.com {/example.com:$${DNS_PORT} {/" /etc/coredns/Corefile
  sed -i "s/^\. {/.:$${DNS_PORT} {/"                     /etc/coredns/Corefile
fi

# ---------------------------------------------------------------------------
# 3. Run CoreDNS
# ---------------------------------------------------------------------------
docker run -d \
  --name coredns \
  --restart unless-stopped \
  --network host \
  -v /etc/coredns:/etc/coredns:ro \
  coredns/coredns:latest \
  -conf /etc/coredns/Corefile

echo "[coredns user-data] Bootstrap complete."
