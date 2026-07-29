#!/usr/bin/env sh
# =============================================================================
# SveltyCMS Git Hooks Library — shared progress, error, and remediation helpers
# =============================================================================
# Source this file from .githooks/pre-commit and .githooks/pre-push:
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   . "$SCRIPT_DIR/lib.sh"
#
# NOTE: Uses printf for ANSI output because POSIX echo does NOT interpret
# \033 escape sequences. printf %b does — use it for all colored output.
# =============================================================================

# ── Terminal colors ────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD='\033[1m'; DIM='\033[2m'
  GREEN='\033[32m'; YELLOW='\033[33m'
  RED='\033[31m'; CYAN='\033[36m'; MAGENTA='\033[35m'; NC='\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; YELLOW=''; RED=''; CYAN=''; MAGENTA=''; NC=''
fi

# ── State ──────────────────────────────────────────────────────────
STEP=0
TOTAL=0
HOOK_START=$(date +%s 2>/dev/null || echo 0)
TMPDIR="${TMPDIR:-/tmp}"
LABEL_W=40

# ── Estimated durations for known steps (seconds) ──────────────────
# Used to show ETA when a step starts. Calibrated from real runs.
get_estimate_sec() {
  local label="$1"
  case "$label" in
    *Database*safety*)  echo 2  ;;
    *Format*|*lint*)    echo 3  ;;
    *Lint-staged*)      echo 3  ;;
    *Unit*)             echo 38 ;;
    *Build*|*build*)    echo 90 ;;
    *Integration*)      echo 150 ;;
    *)                  echo 30 ;;
  esac
}

pad() {
  local s="$1"; local len=${#s}
  if [ "$len" -ge "$LABEL_W" ]; then printf "%s" "$s"; return; fi
  printf "%s%*s" "$s" $(( LABEL_W - len )) ""
}

# ── Header ─────────────────────────────────────────────────────────
header() {
  local title="$1"
  local version
  version="$(git describe --tags --always 2>/dev/null || echo 'dev')"
  printf '\n%b\n%b\n' \
    "${BOLD}${MAGENTA}━━━ SveltyCMS ${title} ━━━${NC}  ${DIM}${version}${NC}" \
    ""
}

# ── Info / warning helpers ─────────────────────────────────────────
info()  { printf "  ${CYAN}ℹ${NC}  %s\n" "$1"; }
warn()  { printf "  ${YELLOW}⚠${NC}  %s\n" "$1"; }

# ── Run a step ─────────────────────────────────────────────────────
run() {
  STEP=$((STEP + 1))
  local label="$1"
  shift
  local padded
  padded="$(pad "$label")"
  local outfile="${TMPDIR}/svelty-hook.$$.${STEP}"
  local start_s
  start_s=$(date +%s 2>/dev/null || echo 0)

  local estimate_s
  estimate_s=$(get_estimate_sec "$label")

  # Run in background — capture output, show live ETA on the same line
  printf "  ${padded}  ETA ~${estimate_s}s        "
  "$@" > "$outfile" 2>&1 &
  local pid=$!

  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    local now
    now=$(date +%s 2>/dev/null || echo 0)
    local elapsed=$(( now - start_s ))
    printf "\r  ${padded}  ETA ~${estimate_s}s  ${elapsed}s elapsed "
  done

  wait "$pid"
  local code=$?
  local elapsed_s=$(( $(date +%s) - start_s ))
  local elapsed_str="${elapsed_s}s"
  [ "$elapsed_s" -le 1 ] && elapsed_str="<1s"
  [ "$elapsed_s" -ge 60 ] && elapsed_str="$(( elapsed_s / 60 ))m$(( elapsed_s % 60 ))s"

  # Clear the running line and print result
  printf "\r\033[K"

  if [ "$code" -eq 0 ]; then
    printf '%b\n' "  ${padded}  ${elapsed_str}  ${GREEN}✔${NC}"
    rm -f "$outfile"
    return 0
  fi

  # ── Failure only: show ✘ + error summary ───────────────────────
  printf '%b\n' "  ${padded}  ${elapsed_str}  ${RED}✘${NC}"

  case "$label" in
    *lint*|*Format*)
      grep -n -E "(error|warning)" "$outfile" 2>/dev/null | head -15
      if grep -q "format" "$outfile" 2>/dev/null; then
        warn "Run ${BOLD}bun run format${NC} to auto-fix, then stage and commit again."
      fi
      ;;
    *test*|*Unit*)
      local fails
      fails=$(grep -E "^❯|FAIL|FAILED|✗" "$outfile" 2>/dev/null | grep -v "node_modules" | head -20)
      if [ -n "$fails" ]; then
        printf '%b\n' "  ${BOLD}Failing tests:${NC}"
        printf '%s\n' "$fails" | while IFS= read -r line; do
          printf '%b\n' "    ${RED}✘${NC}  $line"
        done
      fi
      info "Run ${BOLD}bun run test:unit --reporter=verbose${NC} for full output."
      ;;
    *Security*)
      grep -E "\(fail\)|✗|FAIL" "$outfile" 2>/dev/null | head -15
      info "Run ${BOLD}bun run test:security${NC} to reproduce."
      ;;
    *Build*|*build*)
      grep -E "error|Error|FAIL" "$outfile" 2>/dev/null | grep -v "node_modules" | head -10
      info "Run ${BOLD}COMPILE_ALL_ADAPTERS=true bun run build${NC} to reproduce."
      ;;
    *)
      tail -10 "$outfile" | sed 's/^/    /'
      ;;
  esac

  rm -f "$outfile"
  return $code
}

# ── Final summary ──────────────────────────────────────────────────
summary() {
  local ok="$1"
  local total="$2"
  local elapsed_s=$(( $(date +%s) - HOOK_START ))
  local min=$(( elapsed_s / 60 ))
  local sec=$(( elapsed_s % 60 ))
  local time_str="${min}m${sec}s"
  [ "$min" -eq 0 ] && time_str="${sec}s"

  printf '\n'
  if [ "$ok" -eq "$total" ]; then
    printf '%b\n' "${GREEN}${BOLD}   ✅ All checks passed (${ok}/${total}) in ${time_str}${NC}"
  else
    local failed=$(( total - ok ))
    printf '%b\n' "${RED}${BOLD}   ❌ ${failed}/${total} check(s) failed in ${time_str}${NC}"
  fi
  printf '\n'
  if [ "$ok" -ne "$total" ]; then
    info "Fix the issues above, then try again."
    info "Need help? → ${CYAN}https://github.com/SveltyCMS/SveltyCMS/discussions${NC}"
    printf '\n'
    return 1
  fi
  return 0
}

# ── Smart skip: only run unit tests when source/test files changed ──
has_changes() {
  local patterns="$*"
  local base
  base="$(git merge-base HEAD @{upstream} 2>/dev/null || echo 'HEAD~1')"
  git diff --name-only "$base" -- 2>/dev/null | grep -qE "$patterns"
}

# ── Detect Package Manager (Agnostic: bun, pnpm, yarn, npm) ────────
PM_NAME="bun"
RUN_CMD="bun run"
EXEC_CMD="bun x"

detect_pm() {
  if command -v bun >/dev/null 2>&1; then
    PM_NAME="bun"
    RUN_CMD="bun run"
    EXEC_CMD="bun x"
  elif command -v pnpm >/dev/null 2>&1; then
    PM_NAME="pnpm"
    RUN_CMD="pnpm run"
    EXEC_CMD="pnpm exec"
  elif command -v yarn >/dev/null 2>&1; then
    PM_NAME="yarn"
    RUN_CMD="yarn run"
    EXEC_CMD="yarn dlx"
  elif command -v npm >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
    PM_NAME="npm"
    RUN_CMD="npm run"
    EXEC_CMD="npx"
  else
    printf '%b\n' "${RED}❌ No JavaScript package manager found (bun, pnpm, yarn, npm)${NC}"
    exit 1
  fi
}

require_bun() {
  detect_pm
}
