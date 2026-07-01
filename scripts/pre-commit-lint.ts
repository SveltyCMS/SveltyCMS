#!/usr/bin/env bun
/**
 * @file scripts/pre-commit-lint.ts
 * @description Standalone pre-commit runner for SveltyCMS.
 *
 * Runs ALL checks **sequentially** in a single process to avoid OOM/SIGKILL
 * on Windows caused by lint-staged spawning too many concurrent bun processes.
 *
 * File arguments are batched (80 files per batch) to stay under the Windows
 * 8191-character command-line limit.
 *
 * Checks performed:
 *   - .ts/.js/.svelte → oxfmt → oxlint → slop-scanner
 *   - src/routes/(app)/** /*.svelte → lint-admin-theme
 *   - .md/.mdx → lint-docs
 *
 * Invoked by: .githooks/pre-commit
 * Manual:     bun run scripts/pre-commit-lint.ts
 */

import { spawnSync } from "node:child_process";

const IS_WINDOWS = process.platform === "win32";
const SEPARATOR = "─".repeat(50);
/** Windows max cmdline is ~8191 chars; leave room for the command itself */
const BATCH_SIZE = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string[], label: string): boolean {
  console.log(`\n${SEPARATOR}\n ${label}\n${SEPARATOR}`);
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
  if (result.status !== 0) {
    console.error(`❌ ${label} failed (exit ${result.status})`);
    return false;
  }
  return true;
}

function runBatched(cmdPrefix: string[], files: string[], label: string): boolean {
  if (files.length === 0) return true;
  let allOk = true;
  const totalBatches = Math.ceil(files.length / BATCH_SIZE);
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchLabel =
      totalBatches > 1
        ? `${label} (batch ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches})`
        : label;
    const ok = run([...cmdPrefix, ...batch], batchLabel);
    if (!ok) allOk = false;
  }
  return allOk;
}

function gitCmd(args: string): { stdout: string; stderr: string; status: number } {
  const parts = args.split(" ");
  const result = spawnSync("git", parts, { encoding: "utf-8" });
  return {
    stdout: (result.stdout ?? "").toString(),
    stderr: (result.stderr ?? "").toString(),
    status: result.status ?? 0,
  };
}

function hasUnstagedChanges(): boolean {
  const r = gitCmd("diff --name-only");
  const r2 = gitCmd("ls-files --others --exclude-standard");
  return (r.stdout.trim() + r2.stdout.trim()).length > 0;
}

// ---------------------------------------------------------------------------
// Get staged files
// ---------------------------------------------------------------------------

const stagedResult = gitCmd("diff --cached --name-only --diff-filter=ACM");
const stagedFiles = stagedResult.stdout
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  console.log("No staged files to check.");
  process.exit(0);
}

console.log(`\n📦 ${stagedFiles.length} staged files`);

// ---------------------------------------------------------------------------
// Categorize files
// ---------------------------------------------------------------------------

const sourceFiles = stagedFiles.filter((f) => /\.(ts|js|svelte)$/i.test(f));
const appSvelteFiles = stagedFiles.filter(
  (f) => /^src[\\/]routes[\\/]\(app\)/.test(f) && /\.svelte$/i.test(f),
);
const docFiles = stagedFiles.filter((f) => /\.(md|mdx)$/i.test(f));

console.log(`   📄 source: ${sourceFiles.length}`);
console.log(`   🎨 app:    ${appSvelteFiles.length}`);
console.log(`   📝 docs:   ${docFiles.length}`);

// ---------------------------------------------------------------------------
// Stash unstaged changes (so only staged content is checked)
// ---------------------------------------------------------------------------

let needsStashPop = false;
if (hasUnstagedChanges()) {
  const stashResult = gitCmd("stash push --keep-index --message pre-commit-lint");
  if (stashResult.status === 0) {
    needsStashPop = true;
  }
}

// ---------------------------------------------------------------------------
// Run checks (all checks run even if some fail; results aggregated)
// ---------------------------------------------------------------------------

const results: boolean[] = [];

try {
  if (sourceFiles.length > 0) {
    results.push(runBatched(["bun", "x", "oxfmt"], sourceFiles, "oxfmt"));
    results.push(runBatched(["bun", "x", "oxlint", "--deny-warnings"], sourceFiles, "oxlint"));
    results.push(
      runBatched(
        ["bun", "run", "scripts/slop-scanner.ts", "--strict", "--files"],
        sourceFiles,
        "slop-scanner",
      ),
    );
  }

  if (appSvelteFiles.length > 0) {
    results.push(
      runBatched(["bun", "run", "scripts/lint-admin-theme.ts"], appSvelteFiles, "lint-admin-theme"),
    );
  }

  if (docFiles.length > 0) {
    results.push(runBatched(["bun", "run", "tests/lint-docs.ts"], docFiles, "lint-docs"));
  }
} finally {
  // Restore unstaged changes — always runs, even on early exit or throw
  if (needsStashPop) {
    const popResult = gitCmd("stash pop");
    if (popResult.status !== 0) {
      console.error("⚠️  Failed to pop stash. Manual cleanup may be needed: git stash pop");
    }
    needsStashPop = false;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (results.length === 0) {
  console.log("\n⚠️  No applicable checks for staged files.");
  process.exit(0);
}

if (results.some((r) => !r)) {
  console.error("\n❌ Pre-commit lint failed.");
  process.exit(1);
}

console.log("\n✅ Pre-commit lint passed.");
