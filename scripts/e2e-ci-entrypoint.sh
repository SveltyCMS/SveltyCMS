#!/usr/bin/env bash
# scripts/e2e-ci-entrypoint.sh
#
# Runs inside the svelty-e2e Podman container. Mirrors the exact sequence
# `.github/workflows/ci.yml` uses for the `e2e` job (lines ~503–532):
#
#   1. bun install --prefer-offline
#   2. (caller pre-builds; this script also rebuilds if build/ is missing)
#   3. bun x playwright install --with-deps chromium   (unless SKIP_PW_INSTALL=1)
#   4. node build/index.js &                            (server in background)
#   5. bun x wait-on tcp:127.0.0.1:4173 --timeout 120000 --interval 500
#   6. bun x playwright test --project=<PROJECT> [--shard=...] [--fully-parallel]
#
# Env (all pre-set by the runner script unless overridden):
#   PROJECT     required. e.g. "users", "visual-regression", "builder"
#   SHARD        optional. e.g. "1/2"
#   EXTRA_ARGS   optional. e.g. "--grep 'Invite User'"
#   SKIP_PW_INSTALL  set to "1" to skip the (slow) playwright browser install
#   SKIP_BUILD       set to "1" to skip bun install + build (for re-runs)
#
# Exits non-zero if any step that matters fails.

set -euo pipefail

: "${PROJECT:?PROJECT env var is required (e.g. users, visual-regression, builder)}"
SHARD="${SHARD:-}"
EXTRA_ARGS="${EXTRA_ARGS:-}"

echo "▶ [entrypoint] PROJECT=$PROJECT SHARD=$SHARD EXTRA_ARGS=$EXTRA_ARGS"
echo "▶ [entrypoint] whoami=$(whoami) pwd=$(pwd)"
echo "▶ [entrypoint] bun=$(bun --version) node=$(node --version)"

# ── 1. Install deps ───────────────────────────────────────────────────────
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "▶ [entrypoint] bun install --prefer-offline"
  bun install --prefer-offline
fi

# ── 2. Build (CI: `bun run build`) ────────────────────────────────────────
# Re-build unless build/ already exists AND SKIP_BUILD=1.
if [ "${SKIP_BUILD:-0}" != "1" ] || [ ! -d build ]; then
  echo "▶ [entrypoint] bun run build"
  bun run build
fi
if [ ! -f build/index.js ]; then
  echo "✗ [entrypoint] build/index.js missing after build step" >&2
  exit 1
fi

# ── 3. Install Playwright chromium browser (OS deps already baked in) ──────
# We use `playwright install` (NOT `--with-deps`) because:
#  - The Containerfile pre-installs all chromium OS libs (no sudo needed).
#  - `--with-deps` would try to `sudo apt-get install`, which fails for the
#    non-root pwuser (no passwordless sudo). CI uses `--with-deps` because it
#    runs as a user with passwordless sudo; we deliberately don't grant that.
# This step only downloads the browser binary (~150MB) into the named volume.
if [ "${SKIP_PW_INSTALL:-0}" != "1" ]; then
  echo "▶ [entrypoint] bun x playwright install chromium"
  bun x playwright install chromium
fi

# ── 4. Start the production server in the background ──────────────────────
# CI sets CI=true so playwright.config.ts disables its webServer block
# (line ~246); the workflow starts `node build/index.js` manually instead.
echo "▶ [entrypoint] starting node build/index.js in background"
node build/index.js > preview.log 2>&1 &
SERVER_PID=$!

# ── 5. Wait for the server to be reachable ─────────────────────────────────
echo "▶ [entrypoint] waiting for tcp:127.0.0.1:4173"
if ! bun x wait-on tcp:127.0.0.1:4173 --timeout 120000 --interval 500; then
  echo "✗ [entrypoint] server did not come up; preview.log tail:" >&2
  tail -n 50 preview.log >&2 || true
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

# ── 6. Run Playwright (mirrors CI lines 528–532) ───────────────────────────
PW_CMD=(bun x playwright test --project="$PROJECT")
if [ -n "$SHARD" ]; then
  PW_CMD+=(--shard="$SHARD")
fi
PW_CMD+=(--fully-parallel)
# shellcheck disable=SC2086
PW_CMD+=($EXTRA_ARGS)

echo "▶ [entrypoint] running: ${PW_CMD[*]}"
set +e
"${PW_CMD[@]}"
PW_EXIT=$?
set -e

echo "▶ [entrypoint] playwright exit=$PW_EXIT"

# ── 7. Stop the server ─────────────────────────────────────────────────────
echo "▶ [entrypoint] stopping server (pid $SERVER_PID)"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

echo "▶ [entrypoint] preview.log tail:"
tail -n 20 preview.log || true

exit "$PW_EXIT"
