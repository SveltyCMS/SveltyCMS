/**
 * @file scripts/test-unit-changed.ts
 * @description Selective unit-test runner with an explicit, never-silent diff base.
 *
 * `vitest run --changed=@{upstream}` misbehaves the moment the branch has no upstream:
 * git fails, Vitest's provider swallows it or yields an empty "related" list, and
 * `passWithNoTests: true` (vitest.config.ts) turns "nothing ran" into exit code 0 — a
 * false green. This wrapper resolves the base through a documented fallback chain,
 * prints what it picked and how much it selected, and says so loudly when nothing is
 * affected.
 *
 * ### Usage
 *   bun run test:unit:changed                  # auto-resolve the diff base
 *   bun run test:unit:changed --base=main      # pin an explicit ref / tag / commit
 *   bun run test:unit:changed --silent=false   # extra args are forwarded to Vitest
 *
 * ### Base resolution — first usable ref wins
 *   @{upstream} → origin/next → origin/main → next → main → HEAD~1
 *   "Usable" = `git rev-parse --verify --quiet <ref>` resolves *and* the ref shares a
 *   merge base with HEAD (Vitest diffs `<ref>...HEAD`, which requires one).
 *
 * ### Scope (mirrors Vitest's GitVCSProvider.findChangedFiles)
 *   `git diff --name-only <base>...HEAD` + `git diff --cached --name-only` +
 *   `git ls-files --other --modified --exclude-standard`
 *
 * ### Contract
 *   exit 0  tests ran and passed — or the diff is genuinely empty / affects no test
 *           file (loud warning + gate pointer; never silent, never a false green)
 *   exit 1  Vitest failed (test failures, config errors, ...)
 *   exit 3  no diff base resolved (or a pinned --base= is unusable): nothing was
 *           verified. Distinct code so scripts cannot read it as green.
 *
 * ### Features:
 * - explicit fallback chain via `git rev-parse --verify --quiet` + merge-base guard
 * - scope report (affected test files + tests) from Vitest's JSON report
 * - loud "no affected tests" warning instead of Vitest's silent `passWithNoTests` exit 0
 * - `--base=<ref>` override
 * - no `svelte-kit sync`: this is the fast inner loop, the gate (`test:unit`) syncs
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gitOutput } from "./git-safe";

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, "..");
const VITEST_ENTRY = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const REPORT_PATH = join(ROOT, ".vitest", "test-unit-changed.json");

/**
 * First ref that resolves wins. `@{upstream}` first: it is the branch's real base.
 * `origin/*` before the local branches so a stale local `next`/`main` cannot widen
 * (or narrow) the scope silently.
 */
const BASE_CANDIDATES = [
  "@{upstream}",
  "origin/next",
  "origin/main",
  "next",
  "main",
  "HEAD~1",
] as const;

const BASE_FLAG = "--base=";

/** Distinct exit code: nothing was verified because no diff base could be resolved. */
const EXIT_NO_BASE = 3;

// ── Git helpers ──────────────────────────────────────────────────────────────

/**
 * `git rev-parse --verify --quiet <ref>` exits non-zero for an unresolvable ref and
 * prints the SHA when it resolves; `gitOutput` maps failure to "".
 * Vitest diffs `<ref>...HEAD` (merge-base form), so the ref must also share a merge
 * base with HEAD — otherwise a rebased/force-pushed remote crashes the run instead of
 * letting the chain fall through to the next candidate.
 */
function isRefUsable(ref: string): boolean {
  if (!gitOutput(["rev-parse", "--verify", "--quiet", ref])) return false;
  return gitOutput(["merge-base", ref, "HEAD"]) !== "";
}

function resolveBase(pinnedBase: string | null): string | null {
  if (pinnedBase) return isRefUsable(pinnedBase) ? pinnedBase : null;
  for (const ref of BASE_CANDIDATES) {
    if (isRefUsable(ref)) return ref;
  }
  return null;
}

/** `@{upstream}` is a sentinel — show the concrete branch it points at. */
function describeRef(ref: string): string {
  if (ref !== "@{upstream}") return ref;
  const concrete = gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  return concrete ? `@{upstream} → ${concrete}` : ref;
}

/**
 * Mirrors Vitest's `GitVCSProvider.findChangedFiles`: committed since the merge base
 * (`<base>...HEAD`), staged, and unstaged + untracked. An empty union means Vitest's
 * `related` list is empty, which makes `filterTestsBySource` select zero test files.
 */
function collectChangedPaths(base: string): string[] {
  const files = new Set<string>();
  for (const args of [
    ["diff", "--name-only", `${base}...HEAD`],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--other", "--modified", "--exclude-standard"],
  ]) {
    const out = gitOutput(args);
    if (!out) continue;
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed.replace(/\\/g, "/"));
    }
  }
  return [...files];
}

// ── Vitest JSON report ───────────────────────────────────────────────────────

interface VitestScope {
  files: number;
  tests: number;
}

function readScope(): VitestScope | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const report = parsed as { numTotalTests?: unknown; testResults?: unknown };
    const files = Array.isArray(report.testResults) ? report.testResults.length : 0;
    const tests = typeof report.numTotalTests === "number" ? report.numTotalTests : 0;
    return { files, tests };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `⚠️  Could not read Vitest's JSON report (${reason}) — affected-test scope unknown.`,
    );
    return null;
  }
}

// ── Output helpers ───────────────────────────────────────────────────────────

function isDocPath(file: string): boolean {
  return file.startsWith("docs/") || file.endsWith(".md") || file.endsWith(".mdx");
}

function warnNoAffectedTests(base: string, changedPaths: string[]): void {
  console.log("");
  console.log(`⚠️  No affected tests for base ${describeRef(base)} — nothing to run here;`);
  console.log("   use the gate (bun run test:unit) for full coverage.");
  const codePaths = changedPaths.filter((file) => !isDocPath(file));
  if (codePaths.length > 0) {
    const sample = codePaths.slice(0, 3).join(", ");
    console.log(
      `   ${codePaths.length} changed path(s) outside docs (${sample}) are not imported by any unit test.`,
    );
  }
  console.log("");
}

// ── CLI args ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  base: string | null;
  passthrough: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const passthrough: string[] = [];
  let base: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith(BASE_FLAG)) {
      base = arg.slice(BASE_FLAG.length) || null;
    } else {
      passthrough.push(arg);
    }
  }
  return { base, passthrough };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): number {
  const { base: pinnedBase, passthrough } = parseArgs(process.argv.slice(2));
  const base = resolveBase(pinnedBase);

  if (!base) {
    console.error("");
    console.error(`⚠️  No diff base could be resolved (tried: ${BASE_CANDIDATES.join(", ")}).`);
    if (pinnedBase) {
      console.error(`   --base=${pinnedBase} does not resolve, or shares no history with HEAD.`);
    }
    console.error("   Nothing was verified — this is NOT a green run.");
    console.error("   Use the gate for full coverage: bun run test:unit");
    console.error("");
    return EXIT_NO_BASE;
  }

  const changedPaths = collectChangedPaths(base);
  console.log(
    `🎯 test:unit:changed — base: ${describeRef(base)} · ${changedPaths.length} changed path(s) since base + worktree`,
  );

  if (changedPaths.length === 0) {
    warnNoAffectedTests(base, changedPaths);
    return 0;
  }

  mkdirSync(join(ROOT, ".vitest"), { recursive: true });
  rmSync(REPORT_PATH, { force: true });

  // Mirrors vitest.config.ts reporter selection; `--reporter=json` keeps the machine
  // readable report (affected file/test counts) next to the human one.
  const consoleReporter = process.env.CI ? "dot" : "default";
  const result = spawnSync(
    "node",
    [
      VITEST_ENTRY,
      "run",
      `--changed=${base}`,
      `--reporter=${consoleReporter}`,
      "--reporter=json",
      `--outputFile=${REPORT_PATH}`,
      ...passthrough,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );

  if (result.error) {
    console.error(`⚠️  Could not start Vitest (${result.error.message}).`);
    return 1;
  }

  const exitCode = result.status ?? 1;
  const scope = readScope();

  if (scope) {
    console.log(
      `ℹ️  scope: ${scope.files} test file(s) / ${scope.tests} test(s) affected since ${describeRef(base)}`,
    );
  }

  if (exitCode !== 0) return exitCode;

  if (scope && scope.files === 0) {
    warnNoAffectedTests(base, changedPaths);
    return 0;
  }

  if (!scope) {
    console.error(
      "⚠️  Vitest exited 0 but the affected-test scope could not be read — verify with the gate.",
    );
  }

  return 0;
}

process.exitCode = main();
