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

import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();

// ── DB allowlist — prevents injection via --db= ─────────────────────────

const VALID_DBS = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;

// ── CLI Argument Parsing ────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const singleDb = getArg("--db");
const skipE2E = argv.includes("--skip-e2e");

if (singleDb && !(VALID_DBS as readonly string[]).includes(singleDb)) {
  console.error(`❌ Invalid --db value: "${singleDb}". Valid: ${VALID_DBS.join(", ")}`);
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface RunResult {
  status: number | null;
  passed: boolean;
}

function run(
  cmd: string,
  args: string[],
  opts: {
    silent?: boolean;
    env?: Record<string, string>;
    ignoreExit?: boolean;
  } = {},
): Promise<RunResult> {
  if (!opts.silent) {
    console.log(`  $ ${cmd} ${args.join(" ")}`);
  }

  return new Promise((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      stdio: opts.silent ? "pipe" : "inherit",
      shell: false, // shell: false prevents injection via --db= or other args
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      cwd: ROOT,
    };

    // Bun requires shell:true on Windows for .ts scripts via `bun run`
    const useShell = process.platform === "win32";
    if (useShell) {
      spawnOpts.shell = true;
      // Re-validate args when shell is required — all args come from this file's constants
      spawnOpts.windowsVerbatimArguments = true;
    }

    const proc = spawn(cmd, args, spawnOpts);

    proc.on("error", (err) => {
      if (opts.ignoreExit) {
        resolve({ status: 1, passed: false });
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      const passed = opts.ignoreExit ? true : code === 0;
      resolve({ status: code, passed });
    });
  });
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

async function runChecked(
  name: string,
  cmd: string,
  args: string[],
  opts: { env?: Record<string, string>; ignoreExit?: boolean } = {},
): Promise<StepResult> {
  const startMs = Date.now();
  const result = await run(cmd, args, opts);
  return { name, passed: result.passed, duration: elapsed(startMs) };
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

/** Read E2E project names from playwright.config.ts — stays in sync automatically. */
function getE2EProjects(): string[] {
  try {
    const configPath = join(ROOT, "playwright.config.ts");
    if (!existsSync(configPath)) return [];
    const content = readFileSync(configPath, "utf-8");
    const matches = content.matchAll(/name:\s*"([^"]+)"/g);
    const exclude = new Set(["wizard", "auth-setup", "firstuser"]);
    return [...matches].map((m) => m[1]).filter((n) => !exclude.has(n));
  } catch {
    return [];
  }
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

  // ── Backup config inside try block — if backup fails, nothing runs ──
  const backupDir = join(ROOT, ".tmp_config_backup");
  const pathsToBackup = [
    {
      src: join(ROOT, "config", "private.ts"),
      dest: join(backupDir, "private.ts"),
      type: "file" as const,
    },
    {
      src: join(ROOT, "config", "private.test.ts"),
      dest: join(backupDir, "private.test.ts"),
      type: "file" as const,
    },
    {
      src: join(ROOT, "config", "database"),
      dest: join(backupDir, "database"),
      type: "dir" as const,
    },
  ];

  const restoreConfig = () => {
    console.log("⏪ Restoring local configuration...");
    for (const p of pathsToBackup) {
      if (existsSync(p.dest)) {
        if (p.type === "dir") rmSync(p.src, { recursive: true, force: true });
        cpSync(p.dest, p.src, { recursive: true });
      } else if (existsSync(p.src)) {
        rmSync(p.src, { recursive: true, force: true });
      }
    }
    rmSync(backupDir, { recursive: true, force: true });
    console.log("   ✓ Local configuration restored.");
  };

  // Handle Ctrl+C — set flag synchronously, let the main loop notice
  let interrupted = false;
  process.on("SIGINT", () => {
    interrupted = true;
    console.log("\n⚠️  SIGINT received — finishing current step, then restoring config...");
  });

  try {
    // Backup must succeed before any work begins
    console.log("💾 Backing up local configuration...");
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    mkdirSync(backupDir, { recursive: true });
    for (const p of pathsToBackup) {
      if (existsSync(p.src)) cpSync(p.src, p.dest, { recursive: true });
    }

    // ── Step 0: Quality Gates ────────────────────────────────────────────────
    console.log("🛡️  Step 0: Quality Gates (Format, Lint, Type Check, Unit Tests)");
    const qualityChecks = [
      { name: "Format Check", cmd: "bun", args: ["run", "format"] },
      { name: "Lint Check", cmd: "bun", args: ["run", "lint"] },
      { name: "Type Check", cmd: "bun", args: ["run", "check"] },
      { name: "Unit Tests", cmd: "bun", args: ["run", "test:unit"] },
    ];

    for (const check of qualityChecks) {
      if (interrupted) break;
      console.log(`\n  ── 🔎 ${check.name} ──`);
      const r = await runChecked(check.name, check.cmd, check.args);
      results.push(r);
      if (!r.passed) {
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
      if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    }
    mkdirSync(join(ROOT, "config", "database"), { recursive: true });

    // ── Step 1: Build ───────────────────────────────────────────────────────
    if (!interrupted) {
      console.log("🏗️  Step 1: Production Build (with COMPILE_ALL_ADAPTERS)");
      const r = await runChecked("Production Build", "bun", ["run", "build"], {
        env: { COMPILE_ALL_ADAPTERS: "true" },
      });
      results.push(r);
      if (!r.passed) {
        printSummary(results, pipelineStart);
        process.exit(1);
      }
    }

    // ── Step 2: Integration DB Matrix ─────────────────────────────────────
    const databases = singleDb ? [singleDb] : [...VALID_DBS];

    if (!interrupted) {
      console.log(`\n🧪 Step 2: Integration Tests (${databases.join(", ")})`);
      for (const db of databases) {
        if (interrupted) break;
        console.log(`\n  ── 🗄️  ${db.toUpperCase()} ──`);
        const r = await runChecked(`Integration (${db})`, "bun", [
          "run",
          "scripts/run-integration-tests.ts",
          `--db=${db}`,
          "--no-build",
        ]);
        results.push(r);
        if (!r.passed) {
          console.error(`  ❌ ${db} integration tests failed.`);
          break;
        }
      }
    }

    // ── Step 3: Playwright E2E ────────────────────────────────────────────
    if (!interrupted && !skipE2E && results.every((r) => r.passed)) {
      console.log("\n🎭 Step 3: Playwright E2E Suite");

      // Install browsers (non-fatal if already installed)
      await run("bun", ["x", "playwright", "install", "--with-deps", "chromium"], {
        silent: true,
        ignoreExit: true,
      });

      // Clear state again for clean E2E run
      for (const path of dirsToClear) {
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
      }
      mkdirSync(join(ROOT, "config", "database"), { recursive: true });

      const e2eProjects = getE2EProjects();
      console.log(`  Projects: ${e2eProjects.join(", ")}`);

      for (const project of e2eProjects) {
        if (interrupted) break;
        console.log(`\n  ── 🎭 ${project} ──`);
        const r = await runChecked(`E2E (${project})`, "bun", [
          "x",
          "playwright",
          "test",
          `--project=${project}`,
        ]);
        results.push(r);
        if (!r.passed) break;
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
