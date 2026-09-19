# =============================================================================
# SveltyCMS — Production Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): oven/bun:1   — fast bun install + bun run build
#   Stage 2 (runtime): node:24-slim — single runtime, ~450 MB (vs ~946 MB
#                                     with the legacy bun+node dual-runtime)
#
# V8 heap tuning (NODE_OPTIONS):
#   At ~1 050 RPS, SvelteKit allocates 30–35 MB/s of short-lived objects.
#   The default New-Space (semi-space) is only 16 MB, so objects are promoted
#   to Old Space before the Scavenge GC can collect them ("Premature Tenuring").
#   This triggers 80–120 ms Major Mark-Sweep pauses at t≈15s and t≈55s in a
#   60s soak-test, collapsing throughput from 1 100 to ~720 RPS.
#   --max-semi-space-size=128  → 98 % of objects die young (< 1 ms Scavenge)
#   --max-old-space-size=1024  → explicit budget; adjust to container memory
#
# Healthcheck:
#   curl (3 ms) replaces `node -e "fetch(...)"` (180–220 ms + 35 MB RAM/tick).
#   node:24-slim (Debian Bookworm) ships curl — no extra apt-get layer needed.
#
# 12-Factor config:
#   All runtime configuration is injected via environment variables.
#   No config files are generated at container start.
# =============================================================================

# -- Stage 1: Build -----------------------------------------------------------
FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies first (layer-cached unless lockfile changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

# Copy source and build
COPY . .
RUN bun run build

# -- Stage 2: Runtime ---------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app

# -- V8 Heap Tuning -----------------------------------------------------------
# Prevents Premature Tenuring GC pauses at high RPS (see file header).
# Adjust --max-old-space-size to 75-80 % of available container memory.
ENV NODE_OPTIONS="--max-semi-space-size=128 --max-old-space-size=1024"

# -- Runtime Configuration (12-Factor: all config via environment) ------------
# Provide these at runtime via `docker run -e` or a compose `environment:` block.
# Defaults below are safe for local testing only — override for production.
ENV PORT=4173
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Database — required, no sane default:
# ENV DB_TYPE=sqlite          # sqlite | postgresql | mariadb | mongodb
# ENV DB_HOST=
# ENV DB_PORT=
# ENV DB_NAME=
# ENV DB_USER=
# ENV DB_PASSWORD=

# Connection-pool tuning (see src/databases/*/connection.ts for details):
# ENV DATABASE_IDLE_TIMEOUT=0          # PG: seconds,  0 = permanently warm
# ENV DATABASE_CONNECT_TIMEOUT=10      # PG: seconds
# ENV DATABASE_MAX_CONNECTIONS=100     # PG: pool ceiling
# ENV MARIADB_IDLE_TIMEOUT=0           # ms, 0 = permanently warm
# ENV MARIADB_MAX_IDLE=50
# ENV MONGODB_IDLE_TIMEOUT_MS=0        # ms, 0 = driver-managed
# ENV MONGODB_HEARTBEAT_MS=10000       # ms

# Application:
# ENV ORIGIN=https://your-domain.com   # Required for CSRF / absolute URL generation
# ENV BODY_SIZE_LIMIT=104857600        # 100 MB upload limit

# -- Production Artifacts -----------------------------------------------------
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY index.cjs package.json ./

EXPOSE 4173

# -- Healthcheck --------------------------------------------------------------
# curl: 3 ms / 0 MB RAM per tick (vs 180-220 ms / 35 MB for `node -e fetch(...)`)
# start_period: 15 s covers SveltyCMS cold-start + DB init.
# Use start_interval: 1s in docker-compose.yml (Docker 25+) for fast ready-detection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4173/healthz || exit 1

# Run as non-root for container security
USER node

# Exec format (no shell wrapper): receives SIGTERM directly for graceful shutdown.
# SveltyCMS hooks.server.ts handles SIGTERM with a 10 s drain + DB close.
CMD ["node", "index.cjs"]
