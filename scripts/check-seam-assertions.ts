#!/usr/bin/env bun
/**
 * @file scripts/check-seam-assertions.ts
 * @description
 * Static seam-assertion lint. Promotes the "assert persistence, not just a toast"
 * rule from `docs/` into an enforced pre-commit check.
 *
 * The anti-pattern that let real bugs through: a mutation test performs a write
 * (create / edit / delete), then only asserts a success toast — never re-reading
 * the persisted state — so a silent no-op (the server answering 200 while nothing
 * changed) passes. This checker pins the test files that guard the recently-fixed
 * regressions and fails if one of them loses its persistence / failure-path seam.
 *
 * Features:
 * - Explicit `SEAM_CRITICAL_FILES` manifest of regression-guard test files.
 * - E2E / integration files must contain a PERSISTENCE signal (a re-read of
 *   server truth), never merely a toast/success assertion.
 * - Unit files must contain a FAILURE-PATH signal (they exercise the error /
 *   no-op branch, not just the happy path).
 * - `--scan` (warnings only, exit 0) sweeps `tests/e2e/**` for mutation specs
 *   that still lack a persistence re-check.
 *
 * Usage:
 *   bun run scripts/check-seam-assertions.ts
 *   bun run scripts/check-seam-assertions.ts --scan
 *
 * Exit: 0 when every seam-critical file passes, 1 otherwise. `--scan` always
 * exits 0 (findings are warnings).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();

/** Convert a platform path to forward slashes for stable manifest comparison. */
function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * The test files that guard the recently-fixed regressions. Each E2E /
 * integration file here must re-check persistence; each unit file must exercise
 * the failure path. Removing or renaming any of these is a hard failure.
 */
const SEAM_CRITICAL_FILES: ReadonlyArray<string> = [
  "tests/e2e/routes/collection-builder/content-entries.spec.ts",
  "tests/e2e/routes/user/token-actions.spec.ts",
  "tests/e2e/routes/login/extended-auth.spec.ts",
  "tests/integration/api/token.test.ts",
  "tests/integration/routes/collection-page-load.test.ts",
  "tests/unit/routes/token-routes-handler.test.ts",
  "tests/unit/utils/error-display.test.ts",
];

type FileKind = "e2e" | "integration" | "unit" | "other";

/**
 * Signals that prove an E2E / integration mutation test re-checked persistence
 * (a fresh read of server truth) rather than stopping at a toast.
 */
const PERSISTENCE_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "waitForResponse", re: /waitForResponse/ },
  { name: "navigation", re: /\bgoto\s*\(/ },
  { name: "count-assertion", re: /\btoHaveCount\b/ },
  { name: "reload", re: /\.reload\s*\(/ },
  { name: "re-read-await", re: /expect\s*\(\s*await\b/ },
  { name: "api-re-read", re: /\.request\.get\s*\(/ },
  { name: "re-read-contains", re: /\.toContain\s*\(/ },
];

/**
 * Signals that prove a unit test exercised the failure / no-op path rather than
 * only the happy path.
 */
const FAILURE_PATH_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "deletedCount === 0", re: /deletedCount\s*===\s*0/ },
  { name: "toThrow", re: /\.?toThrow\b/ },
  { name: "rejects", re: /\.?rejects\b/ },
  { name: "404", re: /404/ },
  { name: "status === 404", re: /status\s*===\s*404/ },
  { name: "invalid", re: /\binvalid\b/i },
  { name: "not", re: /\bnot\b/ },
];

/** Return the index of the `)` matching the `(` at `openIndex`, or -1. */
function matchingParenIndex(content: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (quote !== null) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Byte offsets of mutation (write) requests in `content`. */
function mutationPositions(content: string): number[] {
  const positions: number[] = [];
  for (const m of content.matchAll(/method\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/gi)) {
    positions.push(m.index ?? 0);
  }
  for (const m of content.matchAll(/\.request\.(?:post|put|patch|delete)\s*\(/gi)) {
    positions.push(m.index ?? 0);
  }
  for (const m of content.matchAll(
    /method\s*\(\s*\)\s*===\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/gi,
  )) {
    positions.push(m.index ?? 0);
  }
  return positions.sort((a, b) => a - b);
}

/** Byte offsets of read (GET / navigation / reload) requests in `content`. */
function readPositions(content: string): number[] {
  const positions: number[] = [];
  for (const m of content.matchAll(/\.request\.get\s*\(/gi)) {
    positions.push(m.index ?? 0);
  }
  for (const m of content.matchAll(/\bgoto\s*\(/g)) {
    positions.push(m.index ?? 0);
  }
  for (const m of content.matchAll(/\.reload\s*\(/g)) {
    positions.push(m.index ?? 0);
  }
  // `safeFetch(...)` / `fetch(...)` that is a GET (no mutation method on the call).
  const fetchRe = /\b(?:safeFetch|fetch)\s*\(/g;
  for (const m of content.matchAll(fetchRe)) {
    const open = (m.index ?? 0) + m[0].lastIndexOf("(");
    const close = matchingParenIndex(content, open);
    if (close === -1) continue;
    if (!/method\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i.test(content.slice(open, close + 1))) {
      positions.push(open);
    }
  }
  return positions.sort((a, b) => a - b);
}

/** True when a read request occurs after a mutation request in `content`. */
function hasReadAfterMutation(content: string): boolean {
  const mutations = mutationPositions(content);
  if (mutations.length === 0) return false;
  const reads = readPositions(content);
  return reads.some((r) => mutations.some((m) => r > m));
}

/** Names of the persistence signals present in `content`. */
export function detectPersistenceSignals(content: string): string[] {
  const found = PERSISTENCE_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.name);
  if (found.length === 0 && hasReadAfterMutation(content)) {
    found.push("read-after-mutation");
  }
  return found;
}

/** Names of the failure-path signals present in `content`. */
export function detectFailurePathSignals(content: string): string[] {
  return FAILURE_PATH_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.name);
}

export function hasPersistenceSignal(content: string): boolean {
  return detectPersistenceSignals(content).length > 0;
}

export function hasFailurePathSignal(content: string): boolean {
  return detectFailurePathSignals(content).length > 0;
}

/** True when the file appears to issue a mutation (write) request. */
export function appearsToMutate(content: string): boolean {
  if (/\.request\.(?:post|put|patch|delete)\s*\(/i.test(content)) return true;
  if (/method\s*\(\s*\)\s*===\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i.test(content)) return true;
  if (/method\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/i.test(content)) return true;
  return false;
}

function kindOf(relPath: string): FileKind {
  if (relPath.includes("/e2e/")) return "e2e";
  if (relPath.includes("/integration/")) return "integration";
  if (relPath.includes("/unit/")) return "unit";
  return "other";
}

export interface SeamFileResult {
  file: string;
  kind: FileKind;
  pass: boolean;
  matched: string[];
  required: string;
}

export interface SeamCheckOptions {
  /** Repo root. Defaults to `process.cwd()`. */
  rootDir?: string;
  /** Run the E2E mutation sweep (warnings only). */
  scan?: boolean;
}

export interface SeamCheckResult {
  ok: boolean;
  results: SeamFileResult[];
  warnings: string[];
}

/** Recursively collect files ending in `suffix` under `dir`, skipping VCS/build dirs. */
function walkDir(dir: string, suffix: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full, suffix, out);
    } else if (entry.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out;
}

/** Core check: manifest validation plus the optional `--scan` sweep. */
export function checkSeamAssertions(options: SeamCheckOptions = {}): SeamCheckResult {
  const rootDir = resolve(options.rootDir ?? ROOT);
  const results: SeamFileResult[] = [];
  const warnings: string[] = [];

  for (const relFile of SEAM_CRITICAL_FILES) {
    const abs = join(rootDir, ...relFile.split("/"));
    const kind = kindOf(relFile);
    const required = kind === "unit" ? "failure-path signal" : "persistence signal";

    if (!existsSync(abs)) {
      results.push({ file: relFile, kind, pass: false, matched: [], required });
      continue;
    }

    const content = readFileSync(abs, "utf8");
    const matched =
      kind === "unit" ? detectFailurePathSignals(content) : detectPersistenceSignals(content);

    results.push({
      file: relFile,
      kind,
      pass: matched.length > 0,
      matched,
      required,
    });
  }

  if (options.scan) {
    for (const abs of walkDir(join(rootDir, "tests", "e2e"), ".spec.ts")) {
      const relFile = toPosix(relative(rootDir, abs));
      const content = readFileSync(abs, "utf8");
      if (appearsToMutate(content) && !hasPersistenceSignal(content)) {
        warnings.push(
          `${relFile} appears to mutate (POST/PATCH/PUT/DELETE) but lacks a persistence re-check`,
        );
      }
    }
  }

  return { ok: results.every((r) => r.pass), results, warnings };
}

function printReport(result: SeamCheckResult, scan: boolean): void {
  console.log("\nSeam-assertion check\n");
  for (const r of result.results) {
    const icon = r.pass ? "✓" : "✗";
    const detail = r.pass ? r.matched.join(", ") : "missing";
    console.log(`  ${icon} ${r.file} (${r.kind}) — ${r.required}: ${detail}`);
  }

  const passed = result.results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${result.results.length} seam-critical files pass.`);

  if (scan && result.warnings.length > 0) {
    console.log(`\nScan warnings (${result.warnings.length}):`);
    for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  } else if (scan) {
    console.log("\nScan: no toast-only mutation specs found.");
  }

  if (!result.ok) {
    console.error(
      "\n❌ A seam-critical mutation test lost its persistence/failure-path assertion.\n" +
        "   The old bug re-check: a write may toast success while nothing changed.\n" +
        "   Restore the re-read (waitForResponse / reload / goto / toHaveCount /\n" +
        "   read-after-mutation) for E2E/integration, or the failure-path signal\n" +
        "   (rejects / toThrow / 404 / deletedCount === 0 / not) for unit files.",
    );
  }
}

const isDirectCLI =
  typeof process !== "undefined" &&
  (process.argv?.[1]?.includes("check-seam-assertions") ||
    process.argv?.[1]?.endsWith("check-seam-assertions.ts"));

if (isDirectCLI) {
  const scan = process.argv.includes("--scan");
  const result = checkSeamAssertions({ rootDir: ROOT, scan });
  printReport(result, scan);
  process.exit(result.ok ? 0 : 1);
}
