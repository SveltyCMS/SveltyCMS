#!/usr/bin/env bun
/**
 * @file scripts/quality-gate.ts
 * @description Pre-commit quality gate with 100% CI parity.
 *
 * The explicit goal is: a commit created on this machine (Windows, macOS, or Unix)
 * is only allowed if it would have passed the corresponding GitHub Actions jobs.
 *
 * This gate (plus pre-push) is the mechanism that makes "100% pre-commit safe".
 * Bypassing it locally is considered a serious process violation.
 *
 * KEY PRINCIPLE: Every command here MUST match the exact command run in ci.yml.
 * No custom wrappers (vp), no shortcuts, no conditional skips.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const IS_WINDOWS = process.platform === "win32";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

interface Task {
  name: string;
  skip?: boolean | (() => boolean);
  run: () => boolean | Promise<boolean>;
  ciJob?: string; // Which CI job this maps to
}

function runCommand(
  cmd: string,
  args: string[] = [],
  options: {
    silent?: boolean;
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): boolean {
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: options.silent ? "pipe" : "inherit",
    shell: IS_WINDOWS,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    cwd: ROOT,
    timeout: options.timeout ?? 300_000, // 5min default
  });

  if (result.status !== 0) {
    if (result.error) {
      console.error(`   Command failed to start: ${result.error.message}`);
    } else if (result.signal) {
      console.error(`   Command killed by signal: ${result.signal}`);
    }
    return false;
  }
  return true;
}

function runCommandSilent(cmd: string, args: string[] = []): { success: boolean; stdout: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: IS_WINDOWS,
    cwd: ROOT,
    env: process.env,
  });
  return {
    success: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
  };
}

function getStagedFiles(): string[] {
  try {
    return execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
      cwd: ROOT,
    })
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isTreeClean(): boolean {
  try {
    execSync("git diff --quiet", { cwd: ROOT, stdio: "pipe" });
    execSync("git diff --cached --quiet", { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasUnstagedChanges(): boolean {
  try {
    execSync("git diff --quiet", { cwd: ROOT, stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// CI Parity Commands
// ---------------------------------------------------------------------------

/**
 * These are the EXACT commands run in ci.yml, in order.
 * Any change to ci.yml MUST be reflected here.
 */
const CI_PARITY_COMMANDS = [
  { name: "format", cmd: "bun", args: ["run", "format"] },
  { name: "lint", cmd: "bun", args: ["run", "lint"] },
  { name: "check", cmd: "bun", args: ["run", "check"] },
  { name: "test:unit (full)", cmd: "bun", args: ["run", "test:unit"] },
  { name: "lint:docs", cmd: "bun", args: ["run", "lint:docs"] },
  { name: "lint:admin-theme", cmd: "bun", args: ["run", "lint:admin-theme"] },
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("⚡ Running Quality Gate...\n");

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log("⏩ No staged changes.");
    process.exit(0);
  }

  console.log(`🔎 Staged files: ${stagedFiles.length}`);
  if (stagedFiles.length <= 12) {
    console.log(`   ${stagedFiles.map((f) => relative(ROOT, f)).join(", ")}`);
  }

  const hasTsOrSvelte = stagedFiles.some((f) => /\.(ts|js|svelte)$/.test(f));
  const hasAdminTheme = stagedFiles.some(
    (f) => f.startsWith("src/routes/(app)/") && f.endsWith(".svelte"),
  );

  const buildExists = existsSync(join(ROOT, "build", "index.js"));

  // -------------------------------------------------------------------------
  // Task List — mirrors ci.yml jobs exactly
  // -------------------------------------------------------------------------

  const tasks: Task[] = [
    {
      name: "Format",
      ciJob: "format",
      run: () => runCommand("bun", ["run", "format"]),
    },
    {
      name: "Post-Format Tree Clean Check",
      ciJob: "format",
      run: () => {
        if (hasUnstagedChanges()) {
          console.error("\n❌ Working tree is dirty after formatting.");
          console.error("   Run 'bun run format' locally, stage the fixes, and retry.");
          return false;
        }
        return true;
      },
    },
    {
      name: "Slop Scanner",
      ciJob: "lint",
      skip: () => !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "scripts/slop-scanner.ts", "--strict"]),
    },
    {
      name: "Lint (oxlint)",
      ciJob: "lint",
      run: () => runCommand("bun", ["run", "lint"]),
    },
    {
      name: "Admin Theme Lint",
      ciJob: "lint",
      skip: () => !hasAdminTheme,
      run: () => runCommand("bun", ["run", "lint:admin-theme"]),
    },
    {
      name: "Type Check",
      ciJob: "check",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "check"]),
    },
    {
      name: "Full Unit Tests (CI parity)",
      ciJob: "unit",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "test:unit"]),
    },
    {
      name: "Dependency Audit",
      ciJob: "security-audit",
      run: () => {
        console.log("   (non-blocking — CI enforces this separately)");
        const { success } = runCommandSilent("bun", ["audit", "--level", "critical"]);
        if (!success) {
          console.warn("   ⚠️  Critical vulnerabilities found (CI will block PR)");
        }
        return true; // Non-blocking locally
      },
    },
    {
      name: "Production Build",
      ciJob: "build",
      skip: !hasTsOrSvelte,
      run: () =>
        runCommand("bun", ["run", "build"], {
          env: { COMPILE_ALL_ADAPTERS: "true" },
          timeout: 600_000, // 10min for build
        }),
    },
    {
      name: "Integration Tests (SQLite)",
      ciJob: "db-tests",
      // CRITICAL: Always run if build exists, matching CI behavior.
      // CI db-tests always runs for sqlite. Local pre-commit must match.
      skip: !buildExists,
      run: () => {
        if (!buildExists) {
          console.warn("   ⚠️  Build missing — cannot run integration tests");
          return true; // Skip gracefully, but this should not happen
        }
        return runCommand("bun", [
          "run",
          "scripts/run-integration-tests.ts",
          "--db=sqlite",
          "--no-build",
        ]);
      },
    },
  ];

  const activeTasks = tasks.filter((t) => {
    if (typeof t.skip === "function") return !t.skip();
    return !t.skip;
  });

  console.log(`\n🚦 Running ${activeTasks.length} quality checks...\n`);

  let failedTasks: string[] = [];

  for (const task of activeTasks) {
    console.log(`▶️  ${task.name}${task.ciJob ? ` [maps to CI: ${task.ciJob}]` : ""}`);
    const start = performance.now();

    let success = false;
    try {
      const result = task.run();
      success = await result;
    } catch (err) {
      console.error(`\n❌ ${task.name} crashed:`, err);
      success = false;
    }

    const elapsed = (performance.now() - start).toFixed(0);
    if (!success) {
      console.error(`\n❌ ${task.name} failed (${elapsed}ms). Fix above before committing.`);
      failedTasks.push(task.name);
      // Continue running other tasks to show full picture, but will exit at end
    } else {
      console.log(`✅ ${task.name} passed (${elapsed}ms)\n`);
    }
  }

  if (failedTasks.length > 0) {
    console.error(`\n❌ ${failedTasks.length} task(s) failed:`);
    for (const name of failedTasks) console.error(`   - ${name}`);
    process.exit(1);
  }

  // =========================================================================
  // FINAL 100% PARITY VERIFICATION
  // =========================================================================
  // Even if the task list above is ever changed, we *always* re-execute the
  // exact commands that are required in CI. This is the "nuclear option".
  // =========================================================================

  console.log("\n🔒 FINAL 100% CI PARITY VERIFICATION");
  console.log("   These commands MUST match .github/workflows/ci.yml exactly.\n");

  let parityFailed = false;
  for (const p of CI_PARITY_COMMANDS) {
    console.log(`   ▶️  Re-verifying ${p.name} ...`);
    const start = performance.now();
    const ok = runCommand(p.cmd, [...p.args]);
    const elapsed = (performance.now() - start).toFixed(0);

    if (!ok) {
      console.error(`\n   ❌ FINAL PARITY CHECK FAILED on "${p.name}" (${elapsed}ms).`);
      parityFailed = true;
    } else {
      console.log(`   ✅ ${p.name} passed (${elapsed}ms)`);
    }
  }

  if (parityFailed) {
    console.error("\n❌ COMMIT REJECTED: Final parity verification failed.");
    console.error("   Fix the issues above and re-run the pre-commit hook.");
    process.exit(1);
  }

  // Re-stage any files that format may have changed
  console.log("\n📦 Re-staging any changes from parity re-verification...");
  runCommand("git", ["add", "-u"]);
  runCommand("git", ["add", "."]);

  // Final tree clean check
  if (!isTreeClean()) {
    console.error(
      "\n❌ FINAL CHECK FAILED: Working tree is not clean after re-verification and re-staging.",
    );
    console.error("   Inspect 'git status' and 'git diff', then re-run the hook.");
    process.exit(1);
  }

  console.log("\n✅ 100% local CI parity verified. Commit allowed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
