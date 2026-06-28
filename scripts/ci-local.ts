/**
 * @file scripts/ci-local.ts
 * @description
 * Local CI runner — 100% parity with GitHub Actions CI pipeline.
 *
 * Runs the full integration test matrix against your already-running
 * Docker Desktop databases (MongoDB, MariaDB, PostgreSQL) plus SQLite,
 * then executes the complete Playwright E2E suite.
 *
 * ### Prerequisites:
 *   - Docker Desktop running with MongoDB (27017), MariaDB (3306),
 *     PostgreSQL (5432) containers up and accessible at 127.0.0.1
 *   - `bun run build` must succeed (handled automatically)
 *
 * ### Usage:
 *   bun run scripts/ci-local.ts                    # full matrix + E2E
 *   bun run scripts/ci-local.ts --db=sqlite        # single DB only
 *   bun run scripts/ci-local.ts --skip-e2e         # skip Playwright
 *
 * ### Features:
 *   - Mirrors ci.yml §4 (DB Matrix) and §5-7 (E2E) exactly
 *   - Fail-fast: stops on first failure
 *   - Elapsed time tracking per step
 *   - Summary table at the end
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();

// ── CLI Argument Parsing ────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const singleDb = getArg("--db");
const skipE2E = argv.includes("--skip-e2e");

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(
  cmd: string,
  args: string[],
  opts: {
    silent?: boolean;
    env?: Record<string, string>;
    ignoreExit?: boolean;
  } = {},
): SpawnSyncReturns<Buffer> {
  if (!opts.silent) {
    console.log(`  $ ${cmd} ${args.join(" ")}`);
  }
  return spawnSync(cmd, args, {
    stdio: opts.silent ? "pipe" : "inherit",
    shell: true,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    cwd: ROOT,
  });
}

function ok(result: SpawnSyncReturns<Buffer>): boolean {
  return result.status === 0;
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

function ensureTestSecret(): string {
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  const authDir = join(ROOT, "tests", "e2e", ".auth");
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf-8").trim();

  const secret = `SVELTYCMS_LOCAL_CI_${Date.now()}_${randomUUID().slice(0, 8)}`;
  writeFileSync(secretPath, secret);
  return secret;
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

interface StepResult {
  name: string;
  passed: boolean;
  duration: string;
}

async function main() {
  const pipelineStart = Date.now();
  const results: StepResult[] = [];
  const testSecret = ensureTestSecret();
  process.env.TEST_API_SECRET = testSecret;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              SveltyCMS Local CI Simulator                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(
    `  Target DB:    ${singleDb || "full matrix (sqlite, mongodb, mariadb, postgresql)"}`,
  );
  console.log(`  E2E Tests:    ${skipE2E ? "skipped" : "enabled"}`);
  console.log(`  Databases:    Using Docker Desktop (already running)`);
  console.log("");

  const backupDir = join(ROOT, ".tmp_config_backup");
  const pathsToBackup = [
    {
      src: join(ROOT, "config", "private.ts"),
      dest: join(backupDir, "private.ts"),
      type: "file",
    },
    {
      src: join(ROOT, "config", "private.test.ts"),
      dest: join(backupDir, "private.test.ts"),
      type: "file",
    },
    {
      src: join(ROOT, "config", "database"),
      dest: join(backupDir, "database"),
      type: "dir",
    },
  ];

  console.log("💾 Backing up local configuration...");
  if (existsSync(backupDir)) {
    rmSync(backupDir, { recursive: true, force: true });
  }
  mkdirSync(backupDir, { recursive: true });

  for (const p of pathsToBackup) {
    if (existsSync(p.src)) {
      cpSync(p.src, p.dest, { recursive: true });
    }
  }

  const restoreConfig = () => {
    console.log("⏪ Restoring local configuration...");
    for (const p of pathsToBackup) {
      if (existsSync(p.dest)) {
        if (p.type === "dir") {
          rmSync(p.src, { recursive: true, force: true });
        }
        cpSync(p.dest, p.src, { recursive: true });
      } else {
        rmSync(p.src, { recursive: true, force: true });
      }
    }
    rmSync(backupDir, { recursive: true, force: true });
    console.log("   ✓ Local configuration restored.");
  };

  try {
    // ── Step 0: Quality Gates ────────────────────────────────────────────────
    console.log("🛡️  Step 0: Quality Gates (Format, Lint, Type Check, Unit Tests)");
    const qualityChecks = [
      { name: "Format Check", cmd: "bun", args: ["run", "format"] },
      { name: "Lint Check", cmd: "bun", args: ["run", "lint"] },
      { name: "Type Check", cmd: "bun", args: ["run", "check"] },
      { name: "Unit Tests", cmd: "bun", args: ["run", "test:unit"] },
    ];

    let t: number;
    for (const check of qualityChecks) {
      console.log(`\n  ── 🔎 ${check.name} ──`);
      t = Date.now();
      const r = run(check.cmd, check.args);
      const passed = ok(r);
      results.push({ name: check.name, passed, duration: elapsed(t) });
      if (!passed) {
        console.error(`  ❌ ${check.name} failed.`);
        printSummary(results, pipelineStart);
        process.exit(1);
      }
    }
    console.log("");

    // Clear active state for E2E setup wizard and build parity with CI
    const dirsToClear = [
      join(ROOT, "config", "private.ts"),
      join(ROOT, "config", "private.test.ts"),
      join(ROOT, "config", "database"),
      join(ROOT, "tests", "e2e", ".auth", "user.json"),
      join(ROOT, "logs"),
    ];
    for (const path of dirsToClear) {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force: true });
      }
    }
    mkdirSync(join(ROOT, "config", "database"), { recursive: true });

    // ── Step 1: Build ───────────────────────────────────────────────────────
    console.log("🏗️  Step 1: Production Build (with COMPILE_ALL_ADAPTERS)");
    t = Date.now();
    const buildResult = run("bun", ["run", "build"], {
      env: { COMPILE_ALL_ADAPTERS: "true" },
    });
    const buildPassed = ok(buildResult);
    results.push({
      name: "Production Build",
      passed: buildPassed,
      duration: elapsed(t),
    });
    if (!buildPassed) {
      printSummary(results, pipelineStart);
      process.exit(1);
    }

    // ── Step 2: Integration DB Matrix ─────────────────────────────────────
    const databases = singleDb ? [singleDb] : ["sqlite", "mongodb", "mariadb", "postgresql"];

    console.log(`\n🧪 Step 2: Integration Tests (${databases.join(", ")})`);
    for (const db of databases) {
      console.log(`\n  ── 🗄️  ${db.toUpperCase()} ──`);
      t = Date.now();
      const r = run("bun", ["run", "scripts/run-integration-tests.ts", `--db=${db}`, "--no-build"]);
      const passed = ok(r);
      results.push({
        name: `Integration (${db})`,
        passed,
        duration: elapsed(t),
      });
      if (!passed) {
        console.error(`  ❌ ${db} integration tests failed.`);
        break; // fail-fast
      }
    }

    // ── Step 3: Playwright E2E ────────────────────────────────────────────
    if (!skipE2E && results.every((r) => r.passed)) {
      console.log("\n🎭 Step 3: Playwright E2E Suite");

      // Ensure browsers are installed
      run("bun", ["x", "playwright", "install", "--with-deps", "chromium"], {
        silent: true,
        ignoreExit: true,
      });

      // Clear state again just in case previous integration tests left garbage
      for (const path of dirsToClear) {
        if (existsSync(path)) {
          rmSync(path, { recursive: true, force: true });
        }
      }
      mkdirSync(join(ROOT, "config", "database"), { recursive: true });

      const e2eProjects = [
        "wizard",
        "auth-setup",
        "signup",
        "content",
        "system",
        "a11y",
        "rbac",
        "language",
        "branding",
        "visual-regression",
        "users",
        "builder",
        "permissions",
        "firstuser",
        "config-routes",
        "admin",
        "dashboard",
        "appearance",
        "media",
      ];
      for (const project of e2eProjects) {
        console.log(`\n  ── 🎭 ${project} ──`);
        t = Date.now();
        const r = run("bun", ["x", "playwright", "test", `--project=${project}`]);
        const passed = ok(r);
        results.push({
          name: `E2E (${project})`,
          passed,
          duration: elapsed(t),
        });
        if (!passed) break; // fail-fast
      }
    } else if (skipE2E) {
      console.log("\n⏩ Step 3: Playwright E2E (skipped via --skip-e2e)");
    }
  } finally {
    restoreConfig();
  }

  printSummary(results, pipelineStart);
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

function printSummary(results: StepResult[], pipelineStart: number) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                     CI Results Summary                       ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const name = r.name.padEnd(30);
    console.log(`║  ${icon} ${name} ${r.duration.padStart(8)}            ║`);
  }
  console.log("╠══════════════════════════════════════════════════════════════╣");

  const allPassed = results.every((r) => r.passed);
  const total = elapsed(pipelineStart);
  if (allPassed) {
    console.log(`║  ✅ ALL PASSED                       Total: ${total.padStart(8)}  ║`);
  } else {
    const failCount = results.filter((r) => !r.passed).length;
    console.log(`║  ❌ ${failCount} FAILED                         Total: ${total.padStart(8)}  ║`);
  }
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("💥 CI Local script crashed:", err);
  process.exit(1);
});
