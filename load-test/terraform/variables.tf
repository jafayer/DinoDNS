# variables.tf – all user-tunable parameters for the load test

# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix applied to every resource name."
  type        = string
  default     = "dinodns-loadtest"
}

# ---------------------------------------------------------------------------
# Test parameters
# ---------------------------------------------------------------------------

variable "domain_count" {
  description = "Number of random domain names to generate (equal split NOERROR/NXDOMAIN)."
  type        = number
  default     = 100
}

variable "test_duration" {
  description = "How long DNSperf should run (seconds)."
  type        = number
  default     = 30
}

variable "dnsperf_clients" {
  description = "Number of concurrent DNSperf client threads."
  type        = number
  default     = 10
}

variable "dnsperf_max_qps" {
  description = "Maximum queries per second sent by each DNSperf instance (0 = unlimited)."
  type        = number
  default     = 0
}

variable "dnsperf_wait_timeout" {
  description = "Seconds to wait for each DNS server to become ready before running DNSperf."
  type        = number
  default     = 300
}

# ---------------------------------------------------------------------------
# DinoDNS compute
# ---------------------------------------------------------------------------

variable "dinodns_instance_type" {
  description = "EC2 instance type for DinoDNS nodes (vertical scaling)."
  type        = string
  default     = "t3.small"
}

variable "dinodns_instance_count" {
  description = "Number of DinoDNS instances (horizontal scaling)."
  type        = number
  default     = 1
}

variable "dinodns_cluster_mode" {
  description = "Enable Node.js cluster mode inside each DinoDNS instance (uses all vCPUs)."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# CoreDNS compute
# ---------------------------------------------------------------------------

variable "coredns_instance_type" {
  description = "EC2 instance type for CoreDNS nodes (vertical scaling)."
  type        = string
  default     = "t3.small"
}

variable "coredns_instance_count" {
  description = "Number of CoreDNS instances (horizontal scaling)."
  type        = number
  default     = 1
}

# ---------------------------------------------------------------------------
# DNSperf compute
# ---------------------------------------------------------------------------

variable "dnsperf_instance_type" {
  description = "EC2 instance type for DNSperf nodes."
  type        = string
  default     = "t3.small"
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the test VPC."
  type        = string
  default     = "10.99.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the single test subnet."
  type        = string
  default     = "10.99.1.0/24"
}

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------

variable "dinodns_ecr_image_tag" {
  description = "Docker image tag pushed to ECR by run.sh."
  type        = string
  default     = "latest"
}
