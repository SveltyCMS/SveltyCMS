/**
 * @file scripts/quality-gate.ts
 * @description Fast, incremental pre-commit quality gate.
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

  const hasTsOrSvelte = stagedFiles.some((f) => /\.(ts|js|svelte)$/.test(f));
  const hasDatabaseChanges = stagedFiles.some((f) => f.includes("src/databases/"));
  const buildExists = existsSync("build/index.js");

  // 2. Parallel fast checks
  const tasks = [
    // Format + Lint (very fast)
    run("bunx oxfmt src --write"),
    run("bunx oxlint src --fix --no-error-on-unmatched-pattern"),

    // Type checking (important but can be lighter)
    hasTsOrSvelte ? run("bun run check") : Promise.resolve(true),

    // Incremental tests only on changed files
    hasTsOrSvelte
      ? stagedFiles.join(" ").length > 6000
        ? Promise.all([
            run("bun vitest run", ["--reporter=dot"]),
            run("bun run test:unit:bun"),
          ]).then((results) => results.every((r) => r === true))
        : Promise.all([
            run("bun vitest related", [...stagedFiles, "--run", "--reporter=dot"]),
            run("bun run test:unit:bun"), // Unfortunately bun test doesn't have 'related' yet
          ]).then((results) => results.every((r) => r === true))
      : Promise.resolve(true),

    // 🚀 NEW: Database Smoke Test (SQLite Integration)
    // Only runs if database files changed and a build exists
    hasDatabaseChanges && buildExists
      ? run("bun run scripts/run-integration-tests.ts --filter=sqlite --no-build")
      : Promise.resolve(true),
  ];

  const results = await Promise.all(tasks);

  if (results.every((r) => r === true)) {
    console.log("\n✅ Quality gate passed.\n");
    process.exit(0);
  } else {
    console.error("\n❌ Quality gate failed. Please fix the issues above.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Quality gate crashed:", err);
  process.exit(1);
});
