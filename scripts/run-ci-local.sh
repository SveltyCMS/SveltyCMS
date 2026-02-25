#!/usr/bin/env bash
# Run the same commands as GitHub Actions CI locally to reproduce failures.
# Usage: ./scripts/run-ci-local.sh
# Output: scripts/ci-local-output.log

set -e
LOGFILE="scripts/ci-local-output.log"

run_step() {
    local name="$1"
    local cmd="$2"
    echo "" >> "$LOGFILE"
    echo "========================================" >> "$LOGFILE"
    echo "$name" >> "$LOGFILE"
    echo "========================================" >> "$LOGFILE"
    echo "Command: $cmd" >> "$LOGFILE"
    echo "OK: $name"
    if eval "$cmd" >> "$LOGFILE" 2>&1; then
        return 0
    else
        echo "FAILED: $name (see $LOGFILE)"
        return 1
    fi
}

echo "CI Local Reproducer - Output: $LOGFILE" | tee "$LOGFILE"

run_step "1. Install" "bun install --frozen-lockfile" || exit 1
run_step "2. Sync" "bun x svelte-kit sync" || exit 1
run_step "3. Paraglide" "bun run paraglide" || exit 1
run_step "4. Lint" "bun run lint" || exit 1
run_step "5. Check" "bun run check" || exit 1
run_step "6. Build" "bun run build" || exit 1
run_step "7. Unit tests" "bun test --preload ./tests/unit/setup.ts --max-concurrency 1 tests/unit/services tests/unit/utils tests/unit/stores tests/unit/widgets tests/unit/*.test.ts" || exit 1

echo "All CI steps passed. See $LOGFILE"
