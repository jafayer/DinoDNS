# Makefile – convenience targets for the DinoDNS load test
#
# Run from the repository root:
#   make -f load-test/Makefile <target>
#
# Or change into load-test/ and run:
#   make <target>

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -euo pipefail -c

ROOT_DIR  := $(shell cd "$(dir $(lastword $(MAKEFILE_LIST)))/.." && pwd)
LOAD_DIR  := $(ROOT_DIR)/load-test
OUTPUT_DIR := $(LOAD_DIR)/output
RESULTS_DIR := $(LOAD_DIR)/results

# Default domain count (override with: make local COUNT=50)
COUNT ?= 100
# Default test duration in seconds
DURATION ?= 30
# DNSperf client threads
CLIENTS ?= 10
# DNSperf max QPS (0 = unlimited)
MAX_QPS ?= 0
# DinoDNS cluster mode (set to "true" to enable)
DINODNS_CLUSTER ?= false

.PHONY: help generate local aws clean

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

generate: ## Generate random domain names (output written to load-test/output/)
	mkdir -p "$(OUTPUT_DIR)"
	node "$(LOAD_DIR)/scripts/generate-domains.js" \
	  --count "$(COUNT)" \
	  --output-dir "$(OUTPUT_DIR)"

local: generate ## Run the full load test locally with Docker Compose
	mkdir -p "$(RESULTS_DIR)"
	DINODNS_CLUSTER_MODE="$(DINODNS_CLUSTER)" \
	TEST_DURATION="$(DURATION)" \
	DNSPERF_CLIENTS="$(CLIENTS)" \
	DNSPERF_MAX_QPS="$(MAX_QPS)" \
	docker compose \
	  -f "$(LOAD_DIR)/docker-compose.yml" \
	  --project-directory "$(LOAD_DIR)" \
	  up --build --abort-on-container-exit \
	  --exit-code-from dnsperf-dinodns
	@echo ""
	@echo "=== DinoDNS results ==="
	@cat "$(RESULTS_DIR)/dnsperf-dinodns.txt" 2>/dev/null || echo "(no results yet)"
	@echo ""
	@echo "=== CoreDNS results ==="
	@cat "$(RESULTS_DIR)/dnsperf-coredns.txt" 2>/dev/null || echo "(no results yet)"

local-down: ## Tear down Docker Compose services
	docker compose -f "$(LOAD_DIR)/docker-compose.yml" --project-directory "$(LOAD_DIR)" down -v

aws: ## Run the full load test on AWS (requires AWS credentials)
	bash "$(LOAD_DIR)/scripts/run.sh" \
	  --count "$(COUNT)" \
	  --duration "$(DURATION)" \
	  --clients "$(CLIENTS)" \
	  --max-qps "$(MAX_QPS)"

clean: ## Remove generated output and result files
	rm -rf "$(OUTPUT_DIR)" "$(RESULTS_DIR)"
	@echo "Cleaned output and results."
