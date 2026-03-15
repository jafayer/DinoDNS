# main.tf – AWS ephemeral load-test infrastructure for DinoDNS vs CoreDNS
#
# Resources created:
#   - VPC + subnet + IGW (single AZ – minimises cross-AZ latency)
#   - Security groups
#   - ECR repository for the DinoDNS image
#   - S3 bucket for DNSperf result files
#   - IAM role + instance profile granting EC2 access to ECR and S3
#   - EC2 instances:
#       • dinodns  × var.dinodns_instance_count
#       • coredns  × var.coredns_instance_count
#       • dnsperf  × 2  (one targets DinoDNS, one targets CoreDNS)
#
# When more than one DNS-server instance is requested an AWS Network Load
# Balancer (UDP/TCP :53) is created in front of them so that DNSperf
# always speaks to a single stable endpoint.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# Random suffix so resources don't collide on re-deploy
# ---------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  suffix = random_id.suffix.hex
  name   = "${var.name_prefix}-${local.suffix}"

  # Resolve the effective DNS target IPs for each service.
  # If count == 1 we address the instance directly; if > 1 we use the NLB.
  dinodns_dns_target = var.dinodns_instance_count > 1 ? aws_lb.dinodns[0].dns_name : aws_instance.dinodns[0].private_ip
  coredns_dns_target = var.coredns_instance_count > 1 ? aws_lb.coredns[0].dns_name : aws_instance.coredns[0].private_ip
}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.name}-vpc" }
}

resource "aws_subnet" "main" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.subnet_cidr
  map_public_ip_on_launch = true

  # Pin to one AZ to eliminate cross-AZ latency
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = { Name = "${local.name}-subnet" }
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_route_table" "main" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-rt" }
}

resource "aws_route_table_association" "main" {
  subnet_id      = aws_subnet.main.id
  route_table_id = aws_route_table.main.id
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

# Allow all traffic within the test cluster (DNS queries + health checks)
resource "aws_security_group" "internal" {
  name        = "${local.name}-internal"
  description = "Allow all traffic within the load-test cluster"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-internal" }
}

# ---------------------------------------------------------------------------
# ECR repository (DinoDNS image is pushed here by run.sh before terraform apply)
# ---------------------------------------------------------------------------
resource "aws_ecr_repository" "dinodns" {
  name                 = "${local.name}-dinodns"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  # Auto-expire images older than 7 days
  lifecycle {
    ignore_changes = [tags]
  }

  tags = { Name = "${local.name}-ecr" }
}

resource "aws_ecr_lifecycle_policy" "dinodns" {
  repository = aws_ecr_repository.dinodns.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 7 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 7
      }
      action = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------------------
# S3 bucket for DNSperf results
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "results" {
  bucket        = "${local.name}-results"
  force_destroy = true  # destroyed with terraform destroy

  tags = { Name = "${local.name}-results" }
}

resource "aws_s3_bucket_public_access_block" "results" {
  bucket = aws_s3_bucket.results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# IAM: allow EC2 instances to pull from ECR and write/read S3 results
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
  tags               = { Name = "${local.name}-ec2-role" }
}

data "aws_iam_policy_document" "ec2_policy" {
  # ECR – pull images
  statement {
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = ["*"]
  }

  # S3 – read domain files, write results
  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.results.arn,
      "${aws_s3_bucket.results.arn}/*",
    ]
  }

  # SSM – for troubleshooting via Session Manager (no SSH key needed)
  statement {
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ec2" {
  name   = "${local.name}-ec2-policy"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2_policy.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ---------------------------------------------------------------------------
# Data: latest Amazon Linux 2023 AMI
# ---------------------------------------------------------------------------
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------------------------------------------------------------------------
# EC2: DinoDNS instances
# ---------------------------------------------------------------------------
resource "aws_instance" "dinodns" {
  count = var.dinodns_instance_count

  ami                    = data.aws_ami.al2023.id
  instance_type          = var.dinodns_instance_type
  subnet_id              = aws_subnet.main.id
  vpc_security_group_ids = [aws_security_group.internal.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data = templatefile("${path.module}/user_data/dinodns.sh.tpl", {
    aws_region    = var.aws_region
    ecr_image_url = "${aws_ecr_repository.dinodns.repository_url}:${var.dinodns_ecr_image_tag}"
    s3_bucket     = aws_s3_bucket.results.bucket
    dns_port      = 53
    cluster_mode  = tostring(var.dinodns_cluster_mode)
  })

  tags = { Name = "${local.name}-dinodns-${count.index}" }
}

# ---------------------------------------------------------------------------
# EC2: CoreDNS instances
# ---------------------------------------------------------------------------
resource "aws_instance" "coredns" {
  count = var.coredns_instance_count

  ami                    = data.aws_ami.al2023.id
  instance_type          = var.coredns_instance_type
  subnet_id              = aws_subnet.main.id
  vpc_security_group_ids = [aws_security_group.internal.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  user_data = templatefile("${path.module}/user_data/coredns.sh.tpl", {
    s3_bucket = aws_s3_bucket.results.bucket
    dns_port  = 53
  })

  tags = { Name = "${local.name}-coredns-${count.index}" }
}

# ---------------------------------------------------------------------------
# Optional NLBs (created only when instance_count > 1)
# ---------------------------------------------------------------------------

## DinoDNS NLB
resource "aws_lb" "dinodns" {
  count = var.dinodns_instance_count > 1 ? 1 : 0

  name               = "${local.name}-dino-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.main.id]

  tags = { Name = "${local.name}-dino-nlb" }
}

resource "aws_lb_target_group" "dinodns_udp" {
  count = var.dinodns_instance_count > 1 ? 1 : 0

  name        = "${local.name}-dino-udp"
  port        = 53
  protocol    = "UDP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    protocol = "TCP"
    port     = 53
  }
}

resource "aws_lb_target_group" "dinodns_tcp" {
  count = var.dinodns_instance_count > 1 ? 1 : 0

  name        = "${local.name}-dino-tcp"
  port        = 53
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    protocol = "TCP"
    port     = 53
  }
}

resource "aws_lb_listener" "dinodns_udp" {
  count = var.dinodns_instance_count > 1 ? 1 : 0

  load_balancer_arn = aws_lb.dinodns[0].arn
  port              = 53
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dinodns_udp[0].arn
  }
}

resource "aws_lb_listener" "dinodns_tcp" {
  count = var.dinodns_instance_count > 1 ? 1 : 0

  load_balancer_arn = aws_lb.dinodns[0].arn
  port              = 53
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dinodns_tcp[0].arn
  }
}

resource "aws_lb_target_group_attachment" "dinodns_udp" {
  count = var.dinodns_instance_count > 1 ? var.dinodns_instance_count : 0

  target_group_arn = aws_lb_target_group.dinodns_udp[0].arn
  target_id        = aws_instance.dinodns[count.index].id
  port             = 53
}

resource "aws_lb_target_group_attachment" "dinodns_tcp" {
  count = var.dinodns_instance_count > 1 ? var.dinodns_instance_count : 0

  target_group_arn = aws_lb_target_group.dinodns_tcp[0].arn
  target_id        = aws_instance.dinodns[count.index].id
  port             = 53
}

## CoreDNS NLB
resource "aws_lb" "coredns" {
  count = var.coredns_instance_count > 1 ? 1 : 0

  name               = "${local.name}-core-nlb"
  internal           = true
  load_balancer_type = "network"
  subnets            = [aws_subnet.main.id]

  tags = { Name = "${local.name}-core-nlb" }
}

resource "aws_lb_target_group" "coredns_udp" {
  count = var.coredns_instance_count > 1 ? 1 : 0

  name        = "${local.name}-core-udp"
  port        = 53
  protocol    = "UDP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    protocol = "TCP"
    port     = 53
  }
}

resource "aws_lb_target_group" "coredns_tcp" {
  count = var.coredns_instance_count > 1 ? 1 : 0

  name        = "${local.name}-core-tcp"
  port        = 53
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    protocol = "TCP"
    port     = 53
  }
}

resource "aws_lb_listener" "coredns_udp" {
  count = var.coredns_instance_count > 1 ? 1 : 0

  load_balancer_arn = aws_lb.coredns[0].arn
  port              = 53
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.coredns_udp[0].arn
  }
}

resource "aws_lb_listener" "coredns_tcp" {
  count = var.coredns_instance_count > 1 ? 1 : 0

  load_balancer_arn = aws_lb.coredns[0].arn
  port              = 53
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.coredns_tcp[0].arn
  }
}

resource "aws_lb_target_group_attachment" "coredns_udp" {
  count = var.coredns_instance_count > 1 ? var.coredns_instance_count : 0

  target_group_arn = aws_lb_target_group.coredns_udp[0].arn
  target_id        = aws_instance.coredns[count.index].id
  port             = 53
}

resource "aws_lb_target_group_attachment" "coredns_tcp" {
  count = var.coredns_instance_count > 1 ? var.coredns_instance_count : 0

  target_group_arn = aws_lb_target_group.coredns_tcp[0].arn
  target_id        = aws_instance.coredns[count.index].id
  port             = 53
}

# ---------------------------------------------------------------------------
# EC2: DNSperf – targeting DinoDNS
# ---------------------------------------------------------------------------
resource "aws_instance" "dnsperf_dinodns" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.dnsperf_instance_type
  subnet_id              = aws_subnet.main.id
  vpc_security_group_ids = [aws_security_group.internal.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # Explicit dependency so DNS servers are created (and IPs allocated) first
  depends_on = [aws_instance.dinodns, aws_instance.coredns, aws_lb.dinodns]

  user_data = templatefile("${path.module}/user_data/dnsperf.sh.tpl", {
    dns_server    = local.dinodns_dns_target
    dns_port      = 53
    s3_bucket     = aws_s3_bucket.results.bucket
    result_key    = "results/dnsperf-dinodns.txt"
    test_duration = var.test_duration
    clients       = var.dnsperf_clients
    max_qps       = var.dnsperf_max_qps
    aws_region    = var.aws_region
    wait_timeout  = var.dnsperf_wait_timeout
  })

  tags = { Name = "${local.name}-dnsperf-dinodns" }
}

# ---------------------------------------------------------------------------
# EC2: DNSperf – targeting CoreDNS
# ---------------------------------------------------------------------------
resource "aws_instance" "dnsperf_coredns" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.dnsperf_instance_type
  subnet_id              = aws_subnet.main.id
  vpc_security_group_ids = [aws_security_group.internal.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  depends_on = [aws_instance.dinodns, aws_instance.coredns, aws_lb.coredns]

  user_data = templatefile("${path.module}/user_data/dnsperf.sh.tpl", {
    dns_server    = local.coredns_dns_target
    dns_port      = 53
    s3_bucket     = aws_s3_bucket.results.bucket
    result_key    = "results/dnsperf-coredns.txt"
    test_duration = var.test_duration
    clients       = var.dnsperf_clients
    max_qps       = var.dnsperf_max_qps
    aws_region    = var.aws_region
    wait_timeout  = var.dnsperf_wait_timeout
  })

  tags = { Name = "${local.name}-dnsperf-coredns" }
}
