#!/usr/bin/env bun
/**
 * @file scripts/test-doctor.ts
 * @description
 * Single local entrypoint: print the real gate map, then run unit + SQLite
 * integration (the default "am I green before push?" check).
 *
 * ### Features:
 * - prints local hooks vs GitHub Actions gate map (no ghost commands)
 * - runs unit (Vitest) + SQLite integration by default
 * - --list: map only, no tests
 * - --unit-only: skip integration
 * - --with-e2e: also run Playwright CI-parity suite (slow)
 *
 * Usage:
 *   bun run test:doctor
 *   bun run test:doctor --list
 *   bun run test:doctor --unit-only
 *   bun run test:doctor --with-e2e
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const LIST_ONLY = args.includes("--list");
const UNIT_ONLY = args.includes("--unit-only");
const WITH_E2E = args.includes("--with-e2e");

function printGateMap(): void {
  console.log(`
━━━ SveltyCMS Test Doctor — Gate Map ━━━

LOCAL (always safe for live config/private.ts — uses private.test.ts)

  Pre-commit  (~40s)   bun run precommit
    1. scripts/check-test-db-safety.ts
    2. bun run check          (format + lint)
    3. bun run gate:fast      (lint-staged)
    4. bun run test:unit      (Vitest; skipped if only docs)

  Pre-push    (~5 min) bun run gate   OR   bun run prepush
    1. COMPILE_ALL_ADAPTERS=true bun run build
    2. bun test --timeout 300000 tests/integration/   (SQLite)

  Manual shortcuts
    bun run test:doctor       ← this command (unit + SQLite integration)
    bun run test:unit
    bun run test:security     hooks defense-in-depth / auth / RBAC / file-server
    bun run test:smart        git-diff suite picker
    bun run test:e2e          CI-parity Playwright (build + :4173)
    bun run test:e2e:dev      Vite :5173 (fast, not CI-identical)
    bun run test:e2e:quick    reuse existing build

  Multi-DB integration (Docker required except SQLite)
    docker compose -f tests/docker-compose.yml --profile postgresql up -d
    DB_TYPE=postgresql bun test --timeout 300000 tests/integration/
    # same for mongodb | mariadb

GITHUB ACTIONS (.github/workflows/ci.yml) — full matrix

  bootstrap → whitebox (format/lint/check/unit/CVE/secrets/backdoor)
            → build (4 adapters)
            → db-tests × 4 (sqlite, mongodb, postgresql, mariadb)
            → bench-core × 4
            → e2e-prep (wizard + auth-setup)
            → e2e × 6 named groups
            → all-green

NOT real commands (removed / never reintroduce in docs):
  scripts/quality-gate.ts, scripts/security-regression.ts,
  scripts/run-integration-tests.ts, scripts/precheck-shared.ts,
  bun run ci:local, bun run verify:full, bun run mutate

Private config policy: local runners must not read/write config/private.ts.
`);
}

function run(cmd: string, cargs: string[], env: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, cargs, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      console.error(`Failed to spawn ${cmd}:`, err);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  printGateMap();

  if (LIST_ONLY) {
    process.exit(0);
  }

  console.log("── Running: unit tests (Vitest) ──\n");
  const unitCode = await run("bun", ["run", "test:unit"]);
  if (unitCode !== 0) {
    console.error("\n❌ Unit tests failed. Fix before integration.\n");
    process.exit(unitCode);
  }
  console.log("\n✔ Unit tests passed\n");

  if (UNIT_ONLY) {
    console.log("── --unit-only: skipping integration ──\n");
    console.log("Next: bun run gate   (build + SQLite integration) before push\n");
    process.exit(0);
  }

  // Integration harness needs a production build for the preview server.
  const buildIndex = join(ROOT, "build", "index.js");
  if (!existsSync(buildIndex)) {
    console.log("── No build/index.js — building with COMPILE_ALL_ADAPTERS=true ──\n");
    const buildCode = await run("bun", ["run", "build"], {
      COMPILE_ALL_ADAPTERS: "true",
    });
    if (buildCode !== 0) {
      console.error("\n❌ Build failed.\n");
      process.exit(buildCode);
    }
  } else {
    console.log(
      "── Reusing existing build/ (pass a clean tree or delete build/ to force rebuild) ──\n",
    );
  }

  console.log("── Running: SQLite integration (harness starts preview) ──\n");
  const intCode = await run("bun", ["test", "--timeout", "300000", "tests/integration/"], {
    DB_TYPE: process.env.DB_TYPE || "sqlite",
    TEST_MODE: "true",
  });
  if (intCode !== 0) {
    console.error("\n❌ Integration tests failed.\n");
    console.error("Tips: free port 4173; ensure config/private.test.ts DB_NAME contains 'test'.");
    console.error("      bun run scripts/check-test-db-safety.ts\n");
    process.exit(intCode);
  }
  console.log("\n✔ SQLite integration passed\n");

  if (WITH_E2E) {
    console.log("── Running: E2E (CI-parity, --no-build) ──\n");
    const e2eCode = await run("bun", ["run", "scripts/run-e2e.ts", "--no-build"]);
    if (e2eCode !== 0) {
      console.error("\n❌ E2E failed.\n");
      process.exit(e2eCode);
    }
    console.log("\n✔ E2E passed\n");
  }

  console.log(`━━━ Doctor summary ━━━
  Local:  unit ✔  integration(sqlite) ✔${WITH_E2E ? "  e2e ✔" : ""}
  CI will still run:  4× DB  ·  4× bench  ·  6× E2E groups
  Before push:        bun run gate   (if you have not built recently)
  Focused re-run:     bun run test:smart
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
