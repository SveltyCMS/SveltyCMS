#!/usr/bin/env bun
/**
 * @file scripts/test/check-integration-isolation.ts
 * @description
 * Makes integration-suite order dependence visible and forbidden.
 *
 * The integration tier shares ONE preview server and ONE database across the
 * whole run, so a suite that mutates state without resetting or declaring
 * itself shared can turn a real failure into an order-dependent 409 (the
 * MariaDB folder-conflict investigation). Every mutating suite must therefore
 * either seed/reset in `beforeAll`/`beforeEach`, or opt out explicitly.
 *
 * ### Features:
 * - scans `tests/integration/**\/*.test.ts` for HTTP mutations
 *   (`method: "POST"|"PATCH"|"PUT"|"DELETE"`), raw `action: "reset"|"seed"`
 *   bodies, and `testingAction("reset"|"seed"|"bulk-create-collections")`
 * - accepts a reset/seed call in `beforeAll`/`beforeEach`
 *   (`prepareAuthenticatedContext` without `skipReset`, `cleanupTestDatabase`,
 *   `resetDatabase`, `resetAndSeedDatabase`, `testingAction("reset")`)
 * - accepts `// isolation: shared — <reason>` on the line above the `describe`
 * - reports (never fails) mutating suites that never `afterAll` cleanup
 * - `--check` exits 1 with a `file:line` list; default mode prints a report
 *
 * Usage:
 *   bun run scripts/test/check-integration-isolation.ts            # report
 *   bun run scripts/test/check-integration-isolation.ts --check    # gate
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const TESTS_DIR = join(ROOT, "tests", "integration");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(
    [
      "Usage: bun run scripts/test/check-integration-isolation.ts [--check]",
      "",
      "  (default)  print the isolation report, always exit 0",
      "  --check    exit 1 when a mutating suite has no reset/seed and no",
      "             `// isolation: shared` marker",
    ].join("\n"),
  );
  process.exit(0);
}

const CHECK_MODE = args.has("--check");

// ── Detection patterns ──────────────────────────────────────────────────────
// A mutation is any state-changing call the suite issues against the shared
// server, plus the testing reset/seed actions themselves (a suite that only
// seeds still writes shared state).
const MUTATION_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "HTTP mutation", pattern: /\bmethod\s*:\s*["'`](?:POST|PATCH|PUT|DELETE)["'`]/i },
  {
    label: "testing action",
    pattern: /\btestingAction\s*\(\s*["'`](?:reset|seed|bulk-create-collections)["'`]/,
  },
  {
    label: "raw testing body",
    pattern: /\baction\s*:\s*["'`](?:reset|seed|bulk-create-collections)["'`]/,
  },
];

/** Reset/seed helpers that restore a known baseline before the suite mutates. */
const RESET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "resetAndSeedDatabase", pattern: /\bresetAndSeedDatabase\s*\(/ },
  { label: "resetDatabase", pattern: /\bresetDatabase\s*\(/ },
  { label: "cleanupTestDatabase", pattern: /\bcleanupTestDatabase\s*\(/ },
  { label: "initializeTestEnvironment", pattern: /\binitializeTestEnvironment\s*\(/ },
  { label: 'testingAction("reset")', pattern: /\btestingAction\s*\(\s*["'`]reset["'`]/ },
  { label: 'action: "reset"', pattern: /\baction\s*:\s*["'`]reset["'`]/ },
];

const SETUP_HOOK_PATTERN = /\b(beforeAll|beforeEach)\s*\(/g;
const AFTER_ALL_PATTERN = /\bafterAll\s*\(/;
const SHARED_MARKER_PATTERN = /\/\/\s*isolation:\s*shared\b(.*)$/;
const DESCRIBE_PATTERN = /\bdescribe(?:\.\w+)?\s*\(/;
/** Shortest reason we accept after `// isolation: shared`. */
const MIN_MARKER_REASON = 10;

// ── Filesystem walk ─────────────────────────────────────────────────────────

function collectTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(full, out);
      continue;
    }
    if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// ── Small source scanner (string/comment aware) ─────────────────────────────

/** Skip a quoted/template literal starting at `start`; returns its closing index. */
function skipString(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === quote) return i;
  }
  return source.length - 1;
}

/** Index of the paren closing the call whose `(` is at `openParen`. */
function findCallEnd(source: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      if (newline === -1) return source.length - 1;
      i = newline;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return source.length - 1;
      i = end + 1;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

// ── Analysis ────────────────────────────────────────────────────────────────

interface FileFinding {
  /** Project-relative, forward-slash path. */
  file: string;
  /** First mutation line (1-based). */
  line: number;
  mutations: number;
  hookResets: string[];
  looseResets: string[];
  sharedMarker: { line: number; reason: string } | null;
  invalidMarker: number | null;
  hasAfterAll: boolean;
}

function analyzeFile(file: string): FileFinding | null {
  const source = readFileSync(file, "utf8");
  // Split on CRLF too: Windows checkouts left a trailing `\r` on every line,
  // which made the `(.*)$` marker match fail and rejected valid declarations.
  const lines = source.split(/\r?\n/);

  const mutationHits: number[] = [];
  for (const { pattern } of MUTATION_PATTERNS) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    for (const match of source.matchAll(global)) {
      mutationHits.push(match.index ?? 0);
    }
  }
  if (mutationHits.length === 0) return null;
  mutationHits.sort((a, b) => a - b);

  // Reset calls inside beforeAll/beforeEach are the isolation contract.
  const hookSpans: Array<{ start: number; end: number }> = [];
  const hookNameByStart = new Map<number, string>();
  for (const match of source.matchAll(SETUP_HOOK_PATTERN)) {
    const openParen = (match.index ?? 0) + match[0].length - 1;
    hookSpans.push({ start: match.index ?? 0, end: findCallEnd(source, openParen) });
    hookNameByStart.set(match.index ?? 0, match[1]);
  }

  const hookResets: string[] = [];
  const looseResets: string[] = [];
  for (const { label, pattern } of RESET_PATTERNS) {
    const global = new RegExp(pattern.source, "g");
    for (const match of source.matchAll(global)) {
      const index = match.index ?? 0;
      if (hookSpans.some((span) => index >= span.start && index <= span.end)) {
        if (!hookResets.includes(label)) hookResets.push(label);
      } else if (!looseResets.includes(label)) {
        looseResets.push(label);
      }
    }
  }

  // `prepareAuthenticatedContext()` resets + seeds unless told to skip.
  const preparePattern = /\bprepareAuthenticatedContext\s*\(/g;
  for (const match of source.matchAll(preparePattern)) {
    const index = match.index ?? 0;
    const openParen = index + match[0].length - 1;
    const callEnd = findCallEnd(source, openParen);
    const callSource = source.slice(openParen, callEnd + 1);
    if (/\bskipReset\s*:\s*true\b/.test(callSource)) {
      if (!looseResets.includes("prepareAuthenticatedContext({ skipReset: true })")) {
        looseResets.push("prepareAuthenticatedContext({ skipReset: true })");
      }
      continue;
    }
    const label = "prepareAuthenticatedContext";
    if (hookSpans.some((span) => index >= span.start && index <= span.end)) {
      if (!hookResets.includes(label)) hookResets.push(label);
    } else if (!looseResets.includes(label)) {
      looseResets.push(label);
    }
  }

  // `// isolation: shared — reason`, on the line(s) directly above a describe.
  let sharedMarker: { line: number; reason: string } | null = null;
  let invalidMarker: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const markerMatch = lines[i].match(SHARED_MARKER_PATTERN);
    if (!markerMatch) continue;

    const reason = markerMatch[1].replace(/^[\s—–:-]+/, "").trim();
    let next = i + 1;
    let window = 0;
    while (next < lines.length && window < 3) {
      const trimmed = lines[next].trim();
      if (trimmed === "") {
        next++;
        window++;
        continue;
      }
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        next++;
        window++;
        continue;
      }
      break;
    }
    const sitsAboveDescribe = next < lines.length && DESCRIBE_PATTERN.test(lines[next]);

    if (reason.length >= MIN_MARKER_REASON && sitsAboveDescribe) {
      if (!sharedMarker) sharedMarker = { line: i + 1, reason };
    } else if (invalidMarker === null) {
      invalidMarker = i + 1;
    }
  }

  return {
    file: relative(ROOT, file).split("\\").join("/"),
    line: lineAt(source, mutationHits[0]),
    mutations: mutationHits.length,
    hookResets,
    looseResets,
    sharedMarker,
    invalidMarker,
    hasAfterAll: AFTER_ALL_PATTERN.test(source),
  };
}

// ── Report ──────────────────────────────────────────────────────────────────

const files = collectTestFiles(TESTS_DIR).sort();
const findings = files.map(analyzeFile).filter((f): f is FileFinding => f !== null);

const isolated = findings.filter((f) => f.hookResets.length > 0 || f.sharedMarker !== null);
const unguarded = findings.filter((f) => !isolated.includes(f));
const noCleanup = isolated.filter((f) => !f.hasAfterAll);

const pad = (value: number, width: number) => String(value).padStart(width);

console.log(
  `Integration isolation — ${files.length} test files scanned, ${findings.length} mutate shared state`,
);
console.log(
  `  isolated (reset/seed in setup): ${pad(isolated.filter((f) => f.hookResets.length > 0).length, 3)}`,
);
console.log(
  `  isolated (declared shared):     ${pad(isolated.filter((f) => f.hookResets.length === 0).length, 3)}`,
);
console.log(`  unguarded:                      ${pad(unguarded.length, 3)}`);
console.log(`  mutating without afterAll:      ${pad(noCleanup.length, 3)} (report only)`);

if (unguarded.length > 0) {
  console.log("\nUnguarded mutations (add a reset in beforeAll/beforeEach or mark the describe):");
  for (const finding of unguarded) {
    const notes: string[] = [];
    if (finding.looseResets.length > 0) {
      notes.push(`reset outside setup hooks: ${finding.looseResets.join(", ")}`);
    }
    if (finding.invalidMarker !== null) {
      notes.push(
        `isolation marker at line ${finding.invalidMarker} needs a reason on the line above the describe`,
      );
    }
    const suffix = notes.length > 0 ? `  ← ${notes.join("; ")}` : "";
    console.log(`  ${finding.file}:${finding.line}${suffix}`);
  }
}

if (noCleanup.length > 0) {
  console.log("\nMutating suites with no afterAll cleanup (report only):");
  for (const finding of noCleanup) {
    console.log(`  ${finding.file}:${finding.line}`);
  }
}

if (unguarded.length === 0) {
  console.log("\n✅ Every mutating integration suite resets, seeds, or declares itself shared.");
}

if (CHECK_MODE && unguarded.length > 0) {
  console.error(
    `\n❌ ${unguarded.length} integration suite(s) mutate shared state without isolation.`,
  );
  process.exit(1);
}
