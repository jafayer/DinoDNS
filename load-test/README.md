# DinoDNS Load Test

Ephemeral, configurable DNS load-test harness that benchmarks **DinoDNS** against **CoreDNS** using [DNSperf](https://www.dns-oarc.net/tools/dnsperf).

---

## Architecture

```
┌────────────────── VPC (same AZ) ─────────────────────────────┐
│                                                               │
│  ┌──────────────┐    ┌──────────────┐                        │
│  │  DinoDNS     │    │  CoreDNS     │                        │
│  │  (EC2 × N)   │    │  (EC2 × N)   │                        │
│  └──────┬───────┘    └──────┬───────┘                        │
│         │ UDP/TCP :53       │ UDP/TCP :53                     │
│  ┌──────┴───────┐    ┌──────┴───────┐                        │
│  │  DNSperf 1   │    │  DNSperf 2   │                        │
│  │  → DinoDNS   │    │  → CoreDNS   │                        │
│  └──────────────┘    └──────────────┘                        │
│                                                               │
│  Results uploaded to S3 → downloaded to ./load-test/results/ │
└───────────────────────────────────────────────────────────────┘
```

All instances are in the **same VPC / Availability Zone** to minimise network
latency and ensure results are a fair reflection of each server's performance.

---

## Quick Start

### Prerequisites

| Tool       | Minimum version |
|------------|-----------------|
| Node.js    | 18+             |
| Docker     | 24+             |
| Terraform  | 1.5+            |
| AWS CLI    | 2+              |

AWS credentials must be available (environment variables, `~/.aws/credentials`,
or an IAM instance profile).

---

### Run locally (no AWS required)

```bash
# From the repository root:
make -f load-test/Makefile local

# Or override parameters:
make -f load-test/Makefile local COUNT=50 DURATION=60 CLIENTS=20
```

Results are written to `load-test/results/`.

---

### Run on AWS

```bash
# Minimal – all defaults
make -f load-test/Makefile aws

# Custom configuration
./load-test/scripts/run.sh \
  --region       us-east-1     \
  --count        100           \
  --duration     60            \
  --clients      20            \
  --max-qps      5000          \
  --dinodns-type t3.medium     \
  --dinodns-count 2            \
  --dinodns-cluster            \
  --coredns-type t3.medium     \
  --coredns-count 2            \
  --dnsperf-type t3.small
```

The script:
1. Generates 100 random domain names (50 % NOERROR / 50 % NXDOMAIN).
2. Creates an ECR repository and S3 bucket (targeted apply).
3. Builds the **current branch** of DinoDNS into a Docker image and pushes to ECR.
4. Uploads all config/zone files to S3.
5. Provisions all EC2 instances via Terraform.
6. Waits for both DNSperf instances to finish.
7. Downloads and prints the results.
8. **Destroys all AWS resources** (pass `--no-destroy` to keep them).

---

## Configuration Reference

### `run.sh` flags

| Flag | Default | Description |
|------|---------|-------------|
| `--region` | `us-east-1` | AWS region |
| `--count` | `100` | Number of random domains (equal NOERROR/NXDOMAIN split) |
| `--duration` | `30` | DNSperf test duration (seconds) |
| `--clients` | `10` | DNSperf concurrent client threads |
| `--max-qps` | `0` | Max QPS per DNSperf instance (`0` = unlimited) |
| `--dinodns-type` | `t3.small` | EC2 instance type – vertical scaling |
| `--dinodns-count` | `1` | Number of DinoDNS EC2 instances – horizontal scaling |
| `--dinodns-cluster` | _(false)_ | Enable Node.js cluster mode inside DinoDNS |
| `--coredns-type` | `t3.small` | EC2 instance type for CoreDNS – vertical scaling |
| `--coredns-count` | `1` | Number of CoreDNS instances – horizontal scaling |
| `--dnsperf-type` | `t3.small` | EC2 instance type for DNSperf |
| `--results-dir` | `./load-test/results` | Local directory for result files |
| `--no-destroy` | _(destroy)_ | Skip `terraform destroy` after the test |
| `--tf-dir` | `./load-test/terraform` | Override Terraform directory path |

### Terraform variables

All `run.sh` flags map to Terraform variables of the same name.  You can also
manage the infrastructure directly:

```bash
cd load-test/terraform
terraform init
terraform apply \
  -var="aws_region=us-east-1" \
  -var="dinodns_instance_type=t3.medium" \
  -var="dinodns_instance_count=2" \
  -var="dinodns_cluster_mode=true" \
  -var="test_duration=60"
```

---

## Scaling

### Vertical scaling

Change `--dinodns-type` / `--coredns-type` to a larger EC2 instance type
(e.g. `c6i.2xlarge`).  DinoDNS can also use **cluster mode** (`--dinodns-cluster`)
to fork one worker per vCPU, making full use of the larger machine.

### Horizontal scaling

Set `--dinodns-count` or `--coredns-count` > 1.  Terraform will automatically
create an **AWS Network Load Balancer** (UDP + TCP port 53) in front of the
instances so that DNSperf sees a single stable endpoint.

---

## Test Data

The generator (`scripts/generate-domains.js`) creates:

| File | Purpose |
|------|---------|
| `output/dinodns-records.txt` | Loaded into DinoDNS in-memory store at boot |
| `output/db.example.com` | RFC 1035 zone file served by CoreDNS |
| `output/Corefile` | CoreDNS configuration |
| `output/dnsperf.txt` | Query file: 50 % valid domains (NOERROR) + 50 % non-existent (NXDOMAIN) |

---

## Results

Results are saved to `load-test/results/` (local) or `s3://<bucket>/results/`
(AWS).  Each file contains raw DNSperf output including:

- Queries sent / completed
- Average, minimum, maximum latency
- Queries per second (QPS)
- NOERROR / NXDOMAIN / SERVFAIL breakdown

---

## Cleanup

```bash
# Local
make -f load-test/Makefile local-down

# AWS (if --no-destroy was used)
cd load-test/terraform && terraform destroy -auto-approve
```
