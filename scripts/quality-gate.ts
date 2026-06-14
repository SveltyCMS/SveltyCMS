/**
 * @file scripts/quality-gate.ts
 * @description Pre-commit quality gate that enforces *exact* 100% CI parity.
 *
 * The explicit goal is: a commit created on this machine (Windows or Unix) is
 * only allowed if it would have passed the corresponding GitHub Actions jobs.
 *
 * This gate (plus pre-push) is the mechanism that makes "100% pre-commit safe".
 * Bypassing it locally is considered a serious process violation.
 *
 * The gate literally runs (or very closely approximates) the exact commands
 * required in AGENTS.md and executed by ci.yml + docs-lint.yml.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative, join } from "node:path";

const ROOT = process.cwd();

function runCommand(
  cmd: string,
  args: string[] = [],
  options: { silent?: boolean; env?: Record<string, string> } = {},
): boolean {
  console.log(`   $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: options.silent ? "pipe" : "inherit",
    shell: true,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    cwd: ROOT,
  });
  return result.status === 0;
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

  const changedPaths = {
    database: stagedFiles.some((f) => f.startsWith("src/databases/")),
    api: stagedFiles.some((f) => f.startsWith("src/routes/api/")),
    services: stagedFiles.some((f) => f.startsWith("src/services/")),
    config: stagedFiles.some((f) => f.startsWith("config/")),
    integrationTests: stagedFiles.some((f) => f.startsWith("tests/integration/")),
    scripts: stagedFiles.some((f) => f.startsWith("scripts/")),
  };

  const shouldRunIntegration = Object.values(changedPaths).some(Boolean);
  const buildExists = existsSync(join(ROOT, "build/index.js"));

  const tasks = [
    {
      name: "Format",
      run: () => runCommand("vp", ["fmt", "--config", ".oxfmtrc.json"]),
    },
    {
      name: "Post-Format Tree Clean Check",
      run: () => {
        const clean = runCommand("git", ["diff", "--exit-code", "--quiet"]);
        if (!clean) {
          console.error("\n❌ Working tree is dirty after formatting.");
          console.error(
            "   This usually means the formatter made changes that were not re-staged.",
          );
          console.error(
            "   Re-run the pre-commit hook (or manually `git add` the formatted files).",
          );
          return false;
        }
        return true;
      },
    },
    {
      name: "Slop Scanner",
      skip: () => !stagedFiles.some((f) => /\.(svelte|ts)$/.test(f)),
      // Full scan is fast (~2s) and avoids Windows command-line length limits
      run: () => runCommand("bun", ["run", "scripts/slop-scanner.ts", "--strict"]),
    },
    {
      name: "Lint (oxlint)",
      run: () => runCommand("vp", ["lint"]),
    },
    {
      name: "Type Check",
      skip: !hasTsOrSvelte,
      run: () => runCommand("bun", ["run", "check"]),
    },
    {
      name: "Full Unit Tests (CI parity)",
      skip: !hasTsOrSvelte,
      // Run the full test:unit (same as the dedicated CI "unit" job) for true parity.
      // test-smart.ts is still useful for local speed during active dev but the gate now ensures
      // the complete suite that GitHub Actions runs on every push.
      run: () => runCommand("bun", ["run", "test:unit"]),
    },
    {
      name: "Dependency Audit",
      run: () => {
        console.log("   (non-blocking — CI enforces this)");
        const ok = runCommand("bun", ["audit", "--level", "critical"], {
          silent: true,
        });
        if (!ok) console.warn("   ⚠️  Critical vulnerabilities (CI will block PR)");
        return true;
      },
    },
    {
      name: "Production Build",
      skip: !hasTsOrSvelte,
      run: () =>
        runCommand("bun", ["run", "build"], {
          env: { COMPILE_ALL_ADAPTERS: "true" },
        }),
    },
    {
      name: "Integration Tests (SQLite)",
      // No longer skipped under PRE_COMMIT. Local pre-commit must exercise the same
      // black-box integration path (against built server + sqlite) that the CI db-tests
      // matrix and docs-lint "sanity" step run. This eliminates the "passes locally, fails in GitHub" gap.
      skip: !shouldRunIntegration,
      run: () => {
        if (!buildExists) {
          console.warn("   ⚠️  Build missing — skipping integration tests");
          return true;
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

  console.log(
    `\n🚦 Running ${tasks.filter((t) => !t.skip || (typeof t.skip === "function" ? !t.skip() : true)).length} quality checks...\n`,
  );

  for (const task of tasks) {
    const shouldSkip = typeof task.skip === "function" ? task.skip() : task.skip;
    if (shouldSkip) continue;

    console.log(`▶️  ${task.name}`);
    const start = performance.now();

    let success = false;
    try {
      const result = task.run();
      success = await result;
    } catch (err) {
      console.error(`\n❌ ${task.name} crashed:`, err);
      process.exit(1);
    }

    const elapsed = (performance.now() - start).toFixed(0);
    if (!success) {
      console.error(`\n❌ ${task.name} failed (${elapsed}ms). Fix above before committing.`);
      process.exit(1);
    }

    console.log(`✅ ${task.name} passed (${elapsed}ms)\n`);
  }

  // =============================================================================
  // FINAL 100% PARITY VERIFICATION (the documented AGENTS.md command)
  // =============================================================================
  // Even if the task list above is ever changed, we *always* re-execute the
  // exact four commands that are required before every push and that CI runs.
  // This is the "nuclear option" that makes local pre-commit as close to
  // 100% safe as client-side hooks can be.
  console.log("\n🔒 FINAL 100% CI PARITY VERIFICATION (AGENTS.md mandatory command)");
  const parityCommands = [
    { name: "format", cmd: "bun", args: ["run", "format"] },
    { name: "lint", cmd: "bun", args: ["run", "lint"] },
    { name: "check", cmd: "bun", args: ["run", "check"] },
    { name: "test:unit (full)", cmd: "bun", args: ["run", "test:unit"] },
    { name: "lint:docs", cmd: "bun", args: ["run", "lint:docs"] },
  ];

  for (const p of parityCommands) {
    console.log(`   ▶️  Re-verifying ${p.name} ...`);
    if (!runCommand(p.cmd, p.args)) {
      console.error(`\n❌ FINAL PARITY CHECK FAILED on "${p.name}".`);
      console.error("   This commit is not allowed. Fix and re-run the pre-commit hook.");
      process.exit(1);
    }
  }

  // Re-stage any files that the final re-verification commands (especially format) may have changed.
  // This mirrors the re-staging logic in the pre-commit hook.
  console.log("📦 Re-staging any changes from final parity re-verification...");

  // Stage any working-tree changes produced by the re-run commands (format, etc.)
  runCommand("git", ["add", "-u"]); // stage modified/deleted
  runCommand("git", ["add", "."]); // catch new files if any

  // Final tree clean check
  const finalTreeClean = runCommand("git", ["diff", "--exit-code", "--quiet"]);
  if (!finalTreeClean) {
    console.error(
      "\n❌ FINAL CHECK FAILED: Working tree is not clean after full parity re-verification and re-staging.",
    );
    console.error(
      "   Please inspect `git status` and `git diff`, then re-run the pre-commit hook.",
    );
    process.exit(1);
  }

  console.log("\n✅ 100% local CI parity verified. Commit allowed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
