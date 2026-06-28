#!/usr/bin/env bun
/**
 * @file scripts/quality-gate.ts
 * @description Pre-push quality gate — medium-weight checks before code reaches remote.
 *
 * This is the "Medium Loop" in SveltyCMS's tiered validation pipeline:
 *
 *   Fast Loop  (pre-commit)  → lint-staged: format, lint, slop on staged files  ~2-3s
 *   Medium Loop (pre-push)   → THIS SCRIPT: type check, full unit tests         ~15-45s
 *   Deep Loop  (CI pipeline) → ci.yml: production build, DB matrix, E2E         ~5-20min
 *
 * Runs: format verification, lint, slop scanner, type check, full unit tests.
 * Does NOT run: production builds, integration tests, E2E (those are CI's job).
 *
 * Invoked by: .githooks/pre-push
 * Manual run: bun run scripts/quality-gate.ts
 * Skip with: git push --no-verify
 *
 * KEY PRINCIPLE: Every static analysis command here matches what CI runs.
 * Builds and integration/E2E tests are deferred to CI where they run on
 * deterministic Linux runners with Docker-backed database matrices.
 */

import { spawnSync, execSync } from "node:child_process";

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

function hasUnstagedChanges(): boolean {
  try {
    execSync("git diff --quiet", { cwd: ROOT, stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
}

function getChangedFileExtensions(): Set<string> {
  try {
    // Check what file types changed in commits not yet pushed
    const output = execSync(
      "git diff --name-only @{u}..HEAD 2>nul || git diff --name-only HEAD~1..HEAD",
      {
        encoding: "utf8",
        cwd: ROOT,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const exts = new Set<string>();
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const dot = trimmed.lastIndexOf(".");
      if (dot >= 0) exts.add(trimmed.slice(dot));
    }
    return exts;
  } catch {
    // If we can't determine, assume everything changed
    return new Set([".ts", ".js", ".svelte", ".md", ".mdx"]);
  }
}

function getChangedPaths(): string[] {
  try {
    const output = execSync(
      "git diff --name-only @{u}..HEAD 2>nul || git diff --name-only HEAD~1..HEAD",
      {
        encoding: "utf8",
        cwd: ROOT,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("⚡ Running Pre-Push Quality Gate...\n");

  const changedExts = getChangedFileExtensions();
  const changedPaths = getChangedPaths();

  const hasTsOrSvelte =
    changedExts.has(".ts") || changedExts.has(".js") || changedExts.has(".svelte");
  const hasAdminTheme = changedPaths.some(
    (f) => f.startsWith("src/routes/(app)/") && f.endsWith(".svelte"),
  );
  const hasDocs = changedExts.has(".md") || changedExts.has(".mdx");

  console.log(`🔎 Changes detected:`);
  console.log(`   Source files (ts/js/svelte): ${hasTsOrSvelte ? "yes" : "no"}`);
  console.log(`   Admin theme routes:          ${hasAdminTheme ? "yes" : "no"}`);
  console.log(`   Documentation:               ${hasDocs ? "yes" : "no"}`);
  if (changedPaths.length <= 12) {
    console.log(`   Files: ${changedPaths.join(", ")}`);
  } else {
    console.log(`   Files: ${changedPaths.length} changed`);
  }

  // -------------------------------------------------------------------------
  // Task List — static analysis + unit tests (no builds, no integration)
  // -------------------------------------------------------------------------

  const tasks: Task[] = [
    {
      name: "Format Verification",
      ciJob: "format",
      run: () => runCommand("bun", ["run", "format"]),
    },
    {
      name: "Post-Format Tree Clean Check",
      ciJob: "format",
      run: () => {
        if (hasUnstagedChanges()) {
          console.error("\n❌ Working tree is dirty after formatting.");
          console.error("   Run 'bun run format' locally, commit the fixes, and retry.");
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
      name: "Docs Lint",
      ciJob: "docs-lint",
      skip: () => !hasDocs,
      run: () => runCommand("bun", ["run", "lint:docs"]),
    },
    {
      name: "Format + Lint Check",
      // Note: "bun run check" runs format verification + oxlint (not svelte-check).
      // Full type checking runs in CI via svelte-check.
      ciJob: "check",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "check"]),
    },
    {
      name: "Full Unit Tests",
      ciJob: "unit",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "test:unit"]),
    },
  ];

  const activeTasks = tasks.filter((t) => {
    if (typeof t.skip === "function") return !t.skip();
    return !t.skip;
  });

  console.log(`\n🚦 Running ${activeTasks.length} quality checks...\n`);

  const failedTasks: string[] = [];

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
      console.error(`\n❌ ${task.name} failed (${elapsed}ms). Fix above before pushing.`);
      failedTasks.push(task.name);
      // Continue running other tasks to show full picture, but will exit at end
    } else {
      console.log(`✅ ${task.name} passed (${elapsed}ms)\n`);
    }
  }

  if (failedTasks.length > 0) {
    console.error(`\n❌ ${failedTasks.length} task(s) failed:`);
    for (const name of failedTasks) console.error(`   - ${name}`);
    console.error("\n   Fix the issues above, commit, and push again.");
    console.error("   DO NOT bypass the gate — CI will reject the same issues.\n");
    process.exit(1);
  }

  // Show what CI will additionally test
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Pre-push quality gate passed — safe to push.           ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  CI will additionally run:                                  ║");
  console.log("║    🏗️  Production Build (COMPILE_ALL_ADAPTERS)              ║");
  console.log("║    🧪 DB Matrix (SQLite, MongoDB, MariaDB, PostgreSQL)     ║");
  console.log("║    🎭 E2E Playwright (sharded, 18 projects)                ║");
  console.log("║    📊 Benchmarks (on main branch / labeled PRs)            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
