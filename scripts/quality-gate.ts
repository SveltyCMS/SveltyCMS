/**
 * @file scripts/quality-gate.ts
 * @description Fast, incremental pre-commit quality gate.
 *
 *  This script performs a series of automated checks on staged files before allowing a commit.
 */

import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const run = (cmd: string, args: string[] = [], options: { silent?: boolean } = {}) => {
  return new Promise<boolean>((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: options.silent ? "pipe" : "inherit",
      shell: true,
    });

    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
};

async function main() {
  console.log("⚡ Running Quality Gate...\n");

  // 1. Get staged files
  const stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACMR")
    .toString()
    .trim()
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    console.log("⏩ No staged changes. Skipping quality gate.");
    process.exit(0);
  }

  console.log(`🔎 Staged files: ${stagedFiles.length}`);
  if (stagedFiles.length < 10) {
    console.log(`📄 Files: ${stagedFiles.join(", ")}`);
  }

  const hasTsOrSvelte = stagedFiles.some((f) => /\.(ts|js|svelte)$/.test(f));
  const hasDatabaseChanges = stagedFiles.some((f) => f.includes("src/databases/"));
  const hasApiChanges = stagedFiles.some((f) => f.includes("src/routes/api/"));
  const hasServiceChanges = stagedFiles.some((f) => f.includes("src/services/"));
  const hasConfigChanges = stagedFiles.some((f) => f.includes("config/"));
  const hasIntegrationTestChanges = stagedFiles.some((f) => f.includes("tests/integration/"));
  const hasScriptChanges = stagedFiles.some((f) => f.includes("scripts/"));

  const shouldRunIntegration =
    hasDatabaseChanges ||
    hasApiChanges ||
    hasServiceChanges ||
    hasConfigChanges ||
    hasIntegrationTestChanges ||
    hasScriptChanges;

  const buildExists = existsSync("build/index.js");

  // 2. Sequential checks (clearer output)
  const tasks = [
    { name: "Format", run: () => run("bunx oxfmt src --write") },
    {
      name: "Lint",
      run: () => run("bunx oxlint src --fix --no-error-on-unmatched-pattern"),
    },
    {
      name: "Type Check",
      skip: !hasTsOrSvelte,
      run: () => run("bun run check"),
    },
    {
      name: "Unit Tests",
      skip: !hasTsOrSvelte,
      run: () =>
        stagedFiles.join(" ").length > 6000
          ? run("bun run test:unit")
          : run("bun vitest related", [...stagedFiles, "--run", "--reporter=dot"]),
    },
    {
      name: "Integration Tests (SQLite)",
      skip: !shouldRunIntegration,
      run: () =>
        buildExists
          ? run("bun run scripts/run-integration-tests.ts --filter=sqlite --no-build")
          : (console.warn(
              "⚠️ Build missing! Skipping integration tests. Run 'bun run build' to enable.",
            ),
            Promise.resolve(true)),
    },
  ];

  for (const task of tasks) {
    if (task.skip) continue;

    console.log(`\n▶️ Running ${task.name}...`);
    let success = false;
    try {
      success = await task.run();
    } catch (e) {
      console.error(`\n❌ ${task.name} failed with a fatal error:`, e);
      process.exit(1);
    }

    if (!success) {
      console.error(`\n❌ ${task.name} failed. Please fix the issues above.`);
      process.exit(1);
    }
    console.log(`✅ ${task.name} passed.`);
  }

  console.log("\n✨ Quality gate passed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
