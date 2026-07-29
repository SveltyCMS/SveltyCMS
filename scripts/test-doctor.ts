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

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildIntegrationServerEnv,
  cleanSqliteTestFiles,
  cleanupTestArtifacts,
  createIntegrationContext,
  ensurePortAvailable,
  stopChildProcessTree,
  waitForIntegrationHealth,
  writePrivateTestConfig,
} from "./integration-harness.ts";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const LIST_ONLY = args.includes("--list");
const UNIT_ONLY = args.includes("--unit-only");
const WITH_E2E = args.includes("--with-e2e");

// Docker container → adapter mapping
const DOCKER_ADAPTER_MAP: Record<string, { dbType: string; testFile: string }> = {
  sveltycmsMongodb: {
    dbType: "mongodb",
    testFile: "tests/integration/databases/mongodb-adapter.test.ts",
  },
  sveltycmsPostgresql: {
    dbType: "postgresql",
    testFile: "tests/integration/databases/postgresql-adapter.test.ts",
  },
  sveltycmsMariadb: {
    dbType: "mariadb",
    testFile: "tests/integration/databases/mariadb-adapter.test.ts",
  },
};

function detectDockerDbs(): { dbType: string; testFile: string }[] {
  try {
    const ps = execSync('docker ps --format "{{.Names}}"', {
      encoding: "utf8",
      timeout: 5000,
      cwd: ROOT,
    }).trim();
    const names = ps
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const found: { dbType: string; testFile: string }[] = [];
    for (const [key, val] of Object.entries(DOCKER_ADAPTER_MAP)) {
      const canonName = key.toLowerCase().replace(/[_-]/g, "");
      if (names.some((n: string) => n.toLowerCase().replace(/[_-]/g, "") === canonName)) {
        found.push(val);
      }
    }
    return found;
  } catch {
    return [];
  }
}

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
    bun run test:doctor       ← this command (unit + SQLite + Docker adapters)
    bun run test:unit
    bun run test:security     hooks defense-in-depth / auth / RBAC / file-server
    bun run test:smart        git-diff suite picker
    bun run test:e2e          CI-parity Playwright (build + :4173)
    bun run test:e2e:dev      Vite :5173 (fast, not CI-identical)
    bun run test:e2e:quick    reuse existing build

  Multi-DB integration (auto-detected by test:doctor — Docker must be running)
    docker compose -f tests/docker-compose.yml --profile postgresql up -d
    docker compose -f tests/docker-compose.yml --profile mongodb up -d
    docker compose -f tests/docker-compose.yml --profile mariadb up -d
    # test:doctor detects running containers and runs matching adapter tests

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

  // ── Start preview server for integration tests ────────────────────────────

  console.log("── Starting preview server for integration tests ──\n");
  cleanupTestArtifacts(ROOT);
  const ctx = createIntegrationContext(ROOT);
  writePrivateTestConfig(ctx);
  cleanSqliteTestFiles(ctx.root, ctx.dbType, ctx.dbName);
  await ensurePortAvailable(ctx.port, ctx.apiBaseUrl);

  let server = null;
  try {
    server = spawn("node", [buildIndex], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: buildIntegrationServerEnv(ctx),
    });
    server.stdout?.on("data", (d: Buffer) => process.stdout.write(`[server] ${d}`));
    server.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server] ${d}`));

    await waitForIntegrationHealth(ctx.apiBaseUrl, { testApiSecret: ctx.secrets.testApiSecret });
    console.log("\n✅ Server ready\n");
  } catch {
    await stopChildProcessTree(server, { label: "preview" });
    console.error("\n❌ Server failed to start. Check build and port 4173.\n");
    process.exit(1);
  }

  let intCode = 0;
  try {
    console.log("── Running: SQLite integration tests ──\n");
    intCode = await run("bun", ["test", "--timeout", "300000", "tests/integration/"], {
      DB_TYPE: process.env.DB_TYPE || "sqlite",
      TEST_MODE: "true",
      TEST_API_SECRET: ctx.secrets.testApiSecret,
    });
  } finally {
    await stopChildProcessTree(server, { label: "preview" });
  }

  cleanupTestArtifacts(ROOT);

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

  // ── Docker adapter tests (in-process, no preview server needed) ────────────
  const dockerDbs = detectDockerDbs();
  const dockerLabels: string[] = [];
  if (dockerDbs.length > 0) {
    console.log(
      `── Running: ${dockerDbs.map((d) => d.dbType).join(", ")} adapter tests (Docker) ──\n`,
    );
    for (const { dbType, testFile } of dockerDbs) {
      const label = `${dbType} adapter`;
      console.log(`  ▶ ${label}`);
      const code = await run("bun", ["test", "--timeout", "120000", testFile], {
        DB_TYPE: dbType,
        TEST_MODE: "true",
      });
      if (code !== 0) {
        console.error(`\n❌ ${label} tests failed.\n`);
        process.exit(code);
      }
      dockerLabels.push(dbType);
      console.log(`  ✔ ${label} passed\n`);
    }
  }

  console.log(`━━━ Doctor summary ━━━
  Local:  unit ✔  integration(sqlite) ✔${dockerLabels.map((d) => `  ${d} ✔`).join("")}${WITH_E2E ? "  e2e ✔" : ""}
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
