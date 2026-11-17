#!/usr/bin/env sh
# @file scripts/ci/ensure-playwright.sh
# @description Verify the exact Chromium + chrome-headless-shell revisions
#   declared by the installed `playwright` package exist before skipping
#   `playwright install chromium` / `--with-deps` in CI.

set -eu

eval "$(node -e '
  const path = require("node:path");
  const pwDir = path.dirname(require.resolve("playwright"));
  const { browsers } = require(require.resolve("playwright-core/browsers.json", { paths: [pwDir] }));
  const fullRev = browsers.find((b) => b.name === "chromium")?.revision || "";
  const headRev = browsers.find((b) => b.name === "chromium-headless-shell")?.revision || fullRev;
  console.log(`FULL_REV=${fullRev} HEAD_REV=${headRev}`);
')"

if [ -z "${FULL_REV:-}" ] || [ -z "${HEAD_REV:-}" ]; then
  echo "❌ Could not resolve Chromium revisions from playwright-core/browsers.json" >&2
  exit 1
fi

headless_bin="$(find "$HOME/.cache/ms-playwright/chromium_headless_shell-${HEAD_REV}" -type f -name chrome-headless-shell 2>/dev/null | head -1 || true)"
browser_bin="$(find "$HOME/.cache/ms-playwright/chromium-${FULL_REV}" -type f -name chrome -path '*chrome-linux*' 2>/dev/null | head -1 || true)"

if [ -z "$headless_bin" ] || [ -z "$browser_bin" ]; then
  echo "⚠️ Chromium rev ${FULL_REV} or headless-shell rev ${HEAD_REV} missing — installing Chromium."
  timeout 110 bun x playwright install chromium
  headless_bin="$(find "$HOME/.cache/ms-playwright/chromium_headless_shell-${HEAD_REV}" -type f -name chrome-headless-shell 2>/dev/null | head -1 || true)"
  browser_bin="$(find "$HOME/.cache/ms-playwright/chromium-${FULL_REV}" -type f -name chrome -path '*chrome-linux*' 2>/dev/null | head -1 || true)"
fi

if [ -n "$browser_bin" ] && [ -n "$headless_bin" ] && ! ldd "$browser_bin" "$headless_bin" 2>/dev/null | grep -q 'not found'; then
  echo "✅ Chromium (${FULL_REV}) and headless-shell (${HEAD_REV}) ready — skipping apt."
  exit 0
fi

echo "⚠️ Missing shared libraries — installing Chromium with deps."
timeout 110 bun x playwright install --with-deps chromium
