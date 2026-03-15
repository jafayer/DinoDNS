# syntax=docker/dockerfile:1
#
# Thin image that ships dnsperf and a small helper script.
# Based on Ubuntu 22.04 which has dnsperf in the default apt repos.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        dnsperf \
        dnsutils \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Query file will be mounted at /etc/dnsperf/dnsperf.txt
RUN mkdir -p /etc/dnsperf

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
