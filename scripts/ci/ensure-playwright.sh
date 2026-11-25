#!/usr/bin/env sh
# @file scripts/ci/ensure-playwright.sh
# @description Verify the exact Chromium + chrome-headless-shell revisions
#   declared by the installed `playwright` package exist before skipping
#   `playwright install chromium` / `--with-deps` in CI.

set -eu

# `playwright-core` declares an "exports" map that does not expose
# ./browsers.json, so resolving that subpath throws ERR_PACKAGE_PATH_NOT_EXPORTED
# on current releases and the whole E2E job dies before it can install anything.
# Resolve the package root through an exportable specifier and read the manifest
# from disk instead.
eval "$(node -e '
  const path = require("node:path");
  const fs = require("node:fs");
  const cwd = process.cwd();
  const resolveRealDirs = (specs, paths) => {
    const dirs = [];
    for (const spec of specs) {
      try {
        const hit = require.resolve(spec, { paths });
        dirs.push(path.dirname(hit), path.dirname(fs.realpathSync(hit)));
        break;
      } catch {
        // Export blocked or specifier absent — try next candidate.
      }
    }
    return dirs;
  };
  // Follow realpaths via `@playwright/test` so Bun isolated layouts (`.bun/`)
  // still find sibling `playwright` -> `playwright-core/browsers.json`.
  const testDirs = resolveRealDirs(["@playwright/test/package.json", "@playwright/test"], [cwd]);
  const pwSearchPaths = [...testDirs, cwd];
  const pwDirs = resolveRealDirs(["playwright/package.json", "playwright"], pwSearchPaths);
  const coreSearchPaths = [...pwDirs, ...pwSearchPaths];
  let coreDir = null;
  for (const spec of ["playwright-core/browsers.json", "playwright-core/package.json", "playwright-core"]) {
    try {
      let dir = path.dirname(fs.realpathSync(require.resolve(spec, { paths: coreSearchPaths })));
      while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, "browsers.json"))) {
          coreDir = dir;
          break;
        }
        dir = path.dirname(dir);
      }
      if (coreDir) break;
    } catch {
      // Export blocked or not installed — try next specifier.
    }
  }
  if (!coreDir) throw new Error("playwright-core/browsers.json not reachable");
  const { browsers } = JSON.parse(fs.readFileSync(path.join(coreDir, "browsers.json"), "utf8"));
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
