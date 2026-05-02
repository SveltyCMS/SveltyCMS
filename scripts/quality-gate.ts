/**
 * @file scripts/quality-gate.ts
 * @description High-performance parallel quality gate for SveltyCMS.
 * Performs incremental testing, global linting, and type checking in parallel.
 */
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";

const run = (cmd: string, args: string[]) => {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: "inherit", shell: true });
    proc.on("close", (code) => resolve(code === 0));
  });
};

async function main() {
  console.log("⚡ Starting High-Performance Quality Gate...\n");

  // 1. Identify staged files to determine "Related" tests
  const stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACMR")
    .toString()
    .split("\n")
    .filter((f) => f.match(/\.(ts|js|svelte)$/));

  if (stagedFiles.length === 0) {
    console.log("⏩ No code changes detected. Skipping gate.");
    process.exit(0);
  }

  // 2. Mandatory Codegen (Pre-requisite for tests and type checking)
  console.log("🛠️  Compiling i18n messages...");
  await run("bun", ["run", "paraglide"]);

  // 3. Start Tasks in Parallel
  const tasks = [
    // Task A: Rust-powered Global Lint & Format
    run("bunx", ["oxfmt", "src", "--write"]),
    run("bunx", ["oxlint", "src", "--fix", "--no-error-on-unmatched-pattern"]),

    // Task B: Incremental Unit Testing
    run("bun", ["vitest", "related", ...stagedFiles, "--run", "--reporter=dot"]),

    // Task C: Type Check & Lightweight Build Verification
    (async () => {
      const checkPassed = await run("bun", ["run", "check"]);
      if (!checkPassed) return false;

      // 🚀 Run a production build check to catch security leaks (.server guards)
      console.log("🏗️ Verifying Production Build Integrity (Security Guards)...");
      return run("bun", ["run", "build"]);
    })(),
  ];

  const results = await Promise.all(tasks);

  if (results.every((r) => r === true)) {
    console.log("\n✨ All quality gates passed! Commit allowed.");
    process.exit(0);
  } else {
    console.error("\n❌ Quality gate FAILED. Please fix the errors above.");
    process.exit(1);
  }
}

main();
