# syntax=docker/dockerfile:1
#
# Builds DinoDNS from the current source tree (current branch).
# Uses tsx for zero-config TypeScript execution.

FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files needed at runtime
COPY tsconfig.json ./
COPY src/ ./src/
COPY load-test/docker/dinodns/server.ts ./load-test/docker/dinodns/server.ts

# Records will be mounted / written here at runtime
RUN mkdir -p /etc/dinodns

EXPOSE 53/udp
EXPOSE 53/tcp

# tsx executes TypeScript directly – no separate compile step required
CMD ["npx", "tsx", "load-test/docker/dinodns/server.ts"]
