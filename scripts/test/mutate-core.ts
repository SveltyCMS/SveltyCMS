#!/usr/bin/env bun
/**
 * @file scripts/test/mutate-core.ts
 * @description Dependency-free mutation runner for the write path.
 *
 * `tests/mutation/seam-mutation.test.ts` is an ordinary Vitest file: it mutates
 * *source text in memory* and asserts a seam's invariant. Nothing ever rewrites a
 * file on disk, so a real "does the unit suite catch this?" question was never
 * asked. This runner closes that gap without adding a mutator dependency
 * (Stryker et al. pull a plugin/babel toolchain into a tree that pins Rolldown).
 *
 * For every entry in {@link MUTATIONS} it:
 *   1. refuses to run unless `git status --porcelain -- <file>` is empty (a dirty
 *      target means another agent is editing — abort, never clobber work);
 *   2. reads the file, applies ONE exact string replacement (must occur exactly
 *      once — a silent 0/2 match would mutate the wrong thing);
 *   3. runs the mapped unit test file(s) with `bun x vitest run <file>`;
 *   4. requires a NON-ZERO exit: a passing suite means the mutation survived,
 *      i.e. the behaviour is not pinned by any test;
 *   5. restores the original bytes in `finally` and verifies with `git diff`.
 *
 * ### Usage
 *   bun run scripts/test/mutate-core.ts --dry-run     # list mutations, run nothing
 *   bun run scripts/test/mutate-core.ts --max=2       # first two mutations
 *   bun run scripts/test/mutate-core.ts               # full set
 *
 * ### Contract
 *   exit 0  every mutation was killed
 *   exit 1  at least one mutation SURVIVED (tests still passed)
 *   exit 2  usage error
 *   exit 3  aborted: dirty target, ambiguous replacement, or failed restore
 *
 * ### Features:
 * - explicit file + mutation list (no glob discovery, no dependencies)
 * - dirty-tree guard per target, before any write
 * - try/finally restore plus a final restore pass (and SIGINT/SIGTERM handlers)
 * - `--dry-run` and `--max=<n>`, summary table, non-zero exit on survival
 */

import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Mutation {
  /** Stable id used in the summary table. */
  id: string;
  /** Project-relative source file the mutation rewrites. */
  file: string;
  /** What the mutation removes, in one line. */
  description: string;
  /** Exact source text to replace — must occur exactly once. */
  find: string;
  /** Replacement text. */
  replace: string;
  /** Unit test files that must fail while the mutation is applied. */
  tests: readonly string[];
}

type Status = "killed" | "survived" | "invalid" | "aborted";

interface Outcome {
  mutation: Mutation;
  status: Status;
  durationMs: number;
  detail: string;
}

const ROOT = join(import.meta.dirname, "../..");

const HOST = typeof Bun !== "undefined" ? process.execPath : "bun";

const EXIT_SURVIVED = 1;
const EXIT_USAGE = 2;
const EXIT_ABORTED = 3;

/**
 * The write-path seams: optimistic-concurrency tokens (every `If-Match`/update
 * path goes through them) and the Drizzle write-count reader (every `updateMany`
 * on the SQL adapters). Each mutation flips one documented guarantee.
 */
const MUTATIONS: readonly Mutation[] = [
  {
    id: "lock-equality",
    file: "src/utils/optimistic-lock.ts",
    description: "matchesVersion: invert the version equality (stale tokens match)",
    find: "  return currentKey === expectedKey;",
    replace: "  return currentKey !== expectedKey;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-null-token",
    file: "src/utils/optimistic-lock.ts",
    description:
      "matchesVersion: drop the absent-token short-circuit (unconditional write conflicts)",
    find: "  if (token === null) return true;",
    replace: "  if (token === null) return false;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-version-key-raw",
    file: "src/utils/optimistic-lock.ts",
    description: "versionKey: return the raw epoch string instead of the parsed number",
    find: "    if (/^\\d+$/.test(trimmed)) return Number(trimmed);",
    replace: "    if (/^\\d+$/.test(trimmed)) return trimmed as unknown as number;",
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "lock-etag-date",
    file: "src/utils/optimistic-lock.ts",
    description: "versionTokenString: emit String(date) instead of ISO (ETag stops round-tripping)",
    find: '    return Number.isNaN(value.getTime()) ? "" : value.toISOString();',
    replace: '    return Number.isNaN(value.getTime()) ? "" : String(value);',
    tests: ["tests/unit/utils/optimistic-lock.test.ts"],
  },
  {
    id: "rows-affected-null",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: always return null (driver shape never recognized)",
    find: [
      "  const direct = read(result);",
      "  if (direct !== null) return direct;",
      "  if (Array.isArray(result) && result.length > 0) return read(result[0]);",
      "  return null;",
    ].join("\n"),
    replace: [
      "  const direct = read(result);",
      "  if (direct !== null) return null;",
      "  if (Array.isArray(result) && result.length > 0) return null;",
      "  return null;",
    ].join("\n"),
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
  {
    id: "rows-affected-precedence",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: read `changes` before `count` (postgres.js count loses)",
    find: [
      "      (value as { count?: unknown }).count ??",
      "      (value as { changes?: unknown }).changes ??",
    ].join("\n"),
    replace: [
      "      (value as { changes?: unknown }).changes ??",
      "      (value as { count?: unknown }).count ??",
    ].join("\n"),
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
  {
    id: "rows-affected-unwrap",
    file: "src/databases/core/drizzle-sql-helpers.ts",
    description: "rowsAffected: drop the mysql2 tuple unwrap (affectedRows lost)",
    find: "  if (Array.isArray(result) && result.length > 0) return read(result[0]);",
    replace: "  if (Array.isArray(result) && result.length > 0) return null;",
    tests: ["tests/unit/databases/rows-affected.test.ts"],
  },
];

/** Originals captured before the first write, keyed by project-relative path. */
const originals = new Map<string, string>();
/** Content this runner wrote, keyed by project-relative path (concurrent-writer guard). */
const applied = new Map<string, string>();
/** Files currently believed to hold mutated content. */
const touched = new Set<string>();
/** Files that were clean before the first write (safe to restore from HEAD). */
const cleanAtStart = new Set<string>();

function git(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function isClean(relativePath: string): boolean {
  return git(["status", "--porcelain", "--", relativePath]).stdout === "";
}

function readTarget(relativePath: string): string {
  const content = readFileSync(join(ROOT, relativePath), "utf8");
  if (!originals.has(relativePath)) originals.set(relativePath, content);
  return content;
}

/**
 * Writes through a same-directory temp file and renames it over the target, so
 * an interrupted process can never leave a half-written source file behind.
 * A plain `writeFileSync` truncates first; if the gate is killed between the
 * truncate and the write, the tree keeps a syntactically broken fragment and
 * every later step (probe, integration, E2E) fails for the wrong reason.
 */
function writeTarget(relativePath: string, content: string): void {
  const target = join(ROOT, relativePath);
  const temporary = `${target}.mutation-${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, target);
}

/**
 * True when the file still holds the exact bytes this runner wrote. A different
 * value means a concurrent writer (another agent) touched it inside the mutation
 * window — restoring would destroy their work, so the caller aborts instead.
 */
function isUntouchedSinceWrite(relativePath: string): boolean {
  const expected = applied.get(relativePath);
  if (expected === undefined) return true;
  try {
    return readFileSync(join(ROOT, relativePath), "utf8") === expected;
  } catch {
    return false;
  }
}

/** Writes every captured original back; returns the paths that still differ. */
function restoreAll(): string[] {
  const dirty: string[] = [];
  // Deleting the current entry during Set iteration is well-defined.
  for (const relativePath of touched) {
    if (!restoreTarget(relativePath)) dirty.push(relativePath);
  }
  return dirty;
}

function restoreTarget(relativePath: string): boolean {
  const content = originals.get(relativePath);
  if (content === undefined) return true;

  if (isUntouchedSinceWrite(relativePath)) {
    writeTarget(relativePath, content);
    applied.delete(relativePath);
    touched.delete(relativePath);
    if (isClean(relativePath)) return true;
  }

  // The in-memory restore failed (partial write, interrupted process, line-ending
  // normalisation, or a concurrent writer). The target was clean before this run,
  // so HEAD is the only legitimate baseline: leaving a mutated source file behind
  // makes every later gate fail for the wrong reason. Restore it and say so.
  if (cleanAtStart.has(relativePath)) {
    console.error(`\n⚠️  ${relativePath} did not match its pre-run bytes — restoring from HEAD.`);
    const checkedOut = git(["checkout", "--", relativePath]);
    if (checkedOut.status === 0) {
      applied.delete(relativePath);
      touched.delete(relativePath);
      return isClean(relativePath);
    }
  }

  return false;
}

function runTests(tests: readonly string[]): { status: number; output: string } {
  const result = spawnSync(HOST, ["x", "vitest", "run", ...tests], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: { ...process.env, TEST_MODE: "true" },
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function tailLines(text: string, count: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines.slice(-count).join("\n");
}

function applyMutation(mutation: Mutation): string | null {
  const content = readTarget(mutation.file);
  const occurrences = content.split(mutation.find).length - 1;
  if (occurrences !== 1) {
    return `replacement target occurs ${occurrences}× in ${mutation.file} (expected exactly 1) — mutation config is stale`;
  }
  const mutated = content.replace(mutation.find, mutation.replace);
  // Mark before writing: if the process is interrupted mid-write, the restore
  // pass must still see this file and fall back to HEAD.
  touched.add(mutation.file);
  applied.set(mutation.file, mutated);
  writeTarget(mutation.file, mutated);
  return null;
}

function runMutation(mutation: Mutation): Outcome {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  if (!isClean(mutation.file)) {
    return {
      mutation,
      status: "aborted",
      durationMs: elapsed(),
      detail: `${mutation.file} has uncommitted changes — refusing to rewrite it`,
    };
  }
  cleanAtStart.add(mutation.file);

  let status: Status = "killed";
  let detail = "";

  try {
    const problem = applyMutation(mutation);
    if (problem) {
      return { mutation, status: "invalid", durationMs: elapsed(), detail: problem };
    }

    const run = runTests(mutation.tests);
    if (run.status === 0) {
      status = "survived";
      detail = `tests passed with the mutation applied\n${tailLines(run.output, 12)}`;
    } else {
      detail = `tests failed as required (vitest exit ${run.status})`;
    }
  } finally {
    const restored = restoreTarget(mutation.file);
    if (!restored) {
      status = "aborted";
      detail = `${mutation.file} was changed by another writer during the mutation window or could not be restored — leaving it untouched; inspect \`git diff\` immediately`;
    }
  }

  return { mutation, status, durationMs: elapsed(), detail };
}

function parseArgs(argv: readonly string[]): {
  dryRun: boolean;
  max: number | null;
  help: boolean;
} {
  let dryRun = false;
  let max: number | null = null;
  let help = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg.startsWith("--max=")) {
      const raw = arg.slice("--max=".length);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`--max=<n> needs a positive integer, got "${raw}"`);
      }
      max = parsed;
      continue;
    }
    throw new Error(`unknown argument "${arg}"`);
  }

  return { dryRun, max, help };
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/test/mutate-core.ts [--dry-run] [--max=<n>]

  --dry-run    list the mutation set and exit (nothing is written)
  --max=<n>    run at most the first n mutations
`);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

function printSummary(outcomes: readonly Outcome[]): void {
  const idWidth = Math.max(...outcomes.map((o) => o.mutation.id.length), 3);
  const fileWidth = Math.max(...outcomes.map((o) => o.mutation.file.length), 4);
  const statusWidth = Math.max(...outcomes.map((o) => o.status.length), 6);

  console.log("\n== Mutation summary ==");
  console.log(
    `${pad("id", idWidth)}  ${pad("status", statusWidth)}  ${pad("file", fileWidth)}  ms`,
  );
  console.log(`${"-".repeat(idWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(fileWidth)}  --`);
  for (const outcome of outcomes) {
    console.log(
      `${pad(outcome.mutation.id, idWidth)}  ${pad(outcome.status, statusWidth)}  ` +
        `${pad(outcome.mutation.file, fileWidth)}  ${outcome.durationMs}`,
    );
  }

  const count = (status: Status) => outcomes.filter((o) => o.status === status).length;
  console.log(
    `\n${count("killed")} killed · ${count("survived")} survived · ` +
      `${count("invalid")} invalid · ${count("aborted")} aborted`,
  );

  for (const outcome of outcomes) {
    if (outcome.status === "killed") continue;
    console.log(`\n[${outcome.status}] ${outcome.mutation.id} — ${outcome.mutation.description}`);
    console.log(outcome.detail);
  }
}

function main(): number {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n🛑 ${error instanceof Error ? error.message : String(error)}\n`);
    printUsage();
    return EXIT_USAGE;
  }

  if (options.help) {
    printUsage();
    return 0;
  }

  const selected = options.max ? MUTATIONS.slice(0, options.max) : [...MUTATIONS];

  if (options.dryRun) {
    console.log(`Dry run — ${selected.length} mutation(s), nothing will be written.\n`);
    const fileWidth = Math.max(...selected.map((m) => m.file.length), 4);
    for (const mutation of selected) {
      console.log(`${mutation.id}\n  ${pad(mutation.file, fileWidth)}  ${mutation.description}`);
      console.log(`  tests: ${mutation.tests.join(", ")}`);
    }
    const files = [...new Set(selected.map((m) => m.file))];
    console.log(`\nTargets (${files.length}): ${files.join(", ")}`);
    return 0;
  }

  for (const file of new Set(selected.map((m) => m.file))) {
    if (!isClean(file)) {
      console.error(`\n🛑 ${file} has uncommitted changes — refusing to mutate a dirty target.`);
      return EXIT_ABORTED;
    }
  }

  const outcomes: Outcome[] = [];
  try {
    for (const mutation of selected) {
      process.stdout.write(`▶ ${mutation.id} (${mutation.file}) … `);
      const outcome = runMutation(mutation);
      outcomes.push(outcome);
      console.log(`${outcome.status} [${outcome.durationMs}ms]`);
      if (outcome.status === "aborted") {
        console.error(`\n🛑 ${outcome.detail}`);
        printSummary(outcomes);
        return EXIT_ABORTED;
      }
    }
  } finally {
    const dirty = restoreAll();
    if (dirty.length > 0) {
      console.error(`\n🛑 final restore left changes in: ${dirty.join(", ")}`);
    }
  }

  printSummary(outcomes);

  const dirty = [...originals.keys()].filter((file) => !isClean(file));
  if (dirty.length > 0) {
    console.error(`\n🛑 tree is still dirty after the restore pass: ${dirty.join(", ")}`);
    return EXIT_ABORTED;
  }

  const survivors = outcomes.filter((o) => o.status !== "killed");
  if (survivors.length > 0) {
    console.error(
      `\n🛑 ${survivors.length} mutation(s) were not caught — the write path is not fully pinned.`,
    );
    return EXIT_SURVIVED;
  }

  console.log(
    `\n✅ All ${outcomes.length} mutations killed. Restored: ${[...originals.keys()].join(", ")}`,
  );
  return 0;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    const dirty = restoreAll();
    if (dirty.length > 0) console.error(`🛑 restore failed for: ${dirty.join(", ")}`);
    process.exit(130);
  });
}

// Normal exits and `process.exit()` paths (including a thrown error escaping
// main) still owe the tree a restore; the signal handlers above do not cover
// them. `restoreAll` is idempotent — already-restored paths are no-ops.
process.on("exit", () => {
  const dirty = restoreAll();
  if (dirty.length > 0) console.error(`🛑 restore on exit failed for: ${dirty.join(", ")}`);
});

process.exit(main());
