/**
 * @file scripts/lint/lint-rule-budgets.ts
 * @description Two-level ratchet (per-file caps + rule total) for two documented
 * rules the tree does not yet satisfy globally: explicit `any` and
 * `throw new AppError(...)`.
 *
 * A per-area cap alone is porous: a single file can absorb hundreds of new
 * `any` escapes while another file in the same area shrinks and the area total
 * holds. The baseline therefore records a cap for every file with at least
 * {@link PER_FILE_CAP_THRESHOLD} occurrences, and the gate fails when
 *   - a file's count exceeds its recorded cap, or
 *   - the rule total exceeds the recorded `total`.
 * A file absent from the baseline (new, or previously below the threshold) is
 * allowed `threshold - 1` occurrences, so sub-threshold files do not need an
 * entry. Lowering a count and running `--update` ratchets both levels down
 * permanently.
 *
 * Per-area counts stay in the baseline and in every violation record for
 * context, but they are no longer the failure boundary. Baselines written
 * before the per-file schema (no `files` key) keep the legacy per-area gate so
 * older fixtures and untouched baselines still work; `--update` always writes
 * the two-level schema.
 *
 * `raise()` vs `AppError`: `AGENTS.md` defines `raise()` as the handler-facing
 * constructor and allows `throw new AppError` inside services / adapters where
 * a typed error must cross a boundary. This gate keeps that decision honest by
 * preventing new direct throws.
 *
 * Usage:
 *   bun run scripts/lint/lint-rule-budgets.ts            # check
 *   bun run scripts/lint/lint-rule-budgets.ts --update   # regenerate baseline
 *
 * Features:
 * - Per-file caps (`files`) plus a per-rule `total`; per-area counts kept as context
 * - Deterministic `--update`: sorted POSIX paths and sorted area keys
 * - Comment lines ignored (documenting a rule is not a violation)
 * - `--update` records decreases; the check never fails on a decrease
 * - Exported `checkRuleBudgets()` / `loadBudgetBaseline()` so the aggregated
 *   source-lint gate reads the baseline once and emits identical violation text
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSourceFiles } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

/**
 * Files with at least this many occurrences are recorded in the baseline. A file
 * below it is allowed `threshold - 1` occurrences without an entry.
 */
export const PER_FILE_CAP_THRESHOLD = 3;

export interface BudgetRule {
  /** Human-readable rule name. */
  label: string;
  /** Regex source (global, counted per occurrence). */
  pattern: string;
  /**
   * Per-file caps keyed by repo-relative POSIX path, sorted. Only files at or
   * above `fileThreshold` are listed. Absent on legacy (area-only) baselines.
   */
  files?: Record<string, number>;
  /** Threshold used when `files` was recorded; defaults to {@link PER_FILE_CAP_THRESHOLD}. */
  fileThreshold?: number;
  /** Per-area occurrence counts (context; not a failure boundary in two-level mode). */
  areas: Record<string, number>;
  /** Rule-wide cap. */
  total: number;
}

export interface BudgetBaseline {
  generatedAt: string;
  note: string;
  rules: Record<string, BudgetRule>;
}

export type BudgetViolationScope = "area" | "file" | "total";

export interface BudgetViolation {
  /** Top-level area, or the file's area for a per-file violation. */
  area: string;
  budget: number;
  current: number;
  rule: string;
  /** Absent on legacy per-area violations so their formatting stays unchanged. */
  scope?: BudgetViolationScope;
  /** Repo-relative POSIX path when `scope === "file"`. */
  file?: string;
}

/** Counts collected from the tree for one rule. */
export interface RuleCounts {
  areas: Record<string, number>;
  files: Record<string, number>;
  total: number;
}

/** The recorded bounds a rule is compared against. */
export interface BudgetRuleBounds {
  areas: Record<string, number>;
  files?: Record<string, number>;
  fileThreshold?: number;
  total: number;
}

export const BUDGET_BASELINE_RELATIVE_PATH = "scripts/lint/rule-budgets.json";

export function budgetBaselinePath(root = process.cwd()): string {
  return join(root, BUDGET_BASELINE_RELATIVE_PATH);
}

/** Reads the recorded ratchet; `null` when the file is missing or unparsable. */
export function loadBudgetBaseline(root = process.cwd()): BudgetBaseline | null {
  try {
    return JSON.parse(readFileSync(budgetBaselinePath(root), "utf8")) as BudgetBaseline;
  } catch {
    return null; // catch-allow: the caller reports the missing baseline and its --update command
  }
}

const RULES: Record<string, { label: string; pattern: RegExp; source: string }> = {
  any: {
    label: "explicit any",
    pattern: /:\s*any\b|\bas\s+any\b|<any>|any\[\]/g,
    source: ":\\s*any\\b|\\bas\\s+any\\b|<any>|any\\[\\]",
  },
  appError: {
    label: "throw new AppError()",
    pattern: /throw\s+new\s+AppError\(/g,
    source: "throw\\s+new\\s+AppError\\(",
  },
};

function areaOf(path: string): string {
  const parts = path.split("/");
  return parts.length > 2 ? parts[1] : "root";
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/** Code-unit comparison: deterministic across locales and platforms. */
function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => comparePaths(a, b)));
}

function countOccurrences(source: string, pattern: RegExp): number {
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    if (isComment(line)) continue;
    const matches = line.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/** Counts non-comment occurrences per area for one rule. */
export function countRule(files: SourceFile[], pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const file of files) {
    const count = countOccurrences(file.source, pattern);
    if (count === 0) continue;
    const area = areaOf(file.path);
    counts[area] = (counts[area] ?? 0) + count;
  }

  return counts;
}

/** Counts non-comment occurrences per repo-relative POSIX path. */
export function countRuleByFile(files: SourceFile[], pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const file of files) {
    const count = countOccurrences(file.source, pattern);
    if (count > 0) counts[file.path] = count;
  }

  return counts;
}

/** One pass producing both views plus the rule total. */
export function countRuleDetails(files: SourceFile[], pattern: RegExp): RuleCounts {
  const perFile = countRuleByFile(files, pattern);
  const areas: Record<string, number> = {};
  let total = 0;

  for (const [path, count] of Object.entries(perFile)) {
    const area = areaOf(path);
    areas[area] = (areas[area] ?? 0) + count;
    total += count;
  }

  return { areas, files: perFile, total };
}

/** Compares current counts to the baseline; only increases are violations. */
export function findBudgetViolations(
  current: Record<string, number>,
  budget: Record<string, number>,
  rule: string,
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  for (const [area, value] of Object.entries(current)) {
    const allowed = budget[area] ?? 0;
    if (value > allowed) violations.push({ area, budget: allowed, current: value, rule });
  }
  return violations.sort((a, b) => b.current - b.budget - (a.current - a.budget));
}

function compareViolations(a: BudgetViolation, b: BudgetViolation): number {
  const delta = b.current - b.budget - (a.current - a.budget);
  if (delta !== 0) return delta;
  return comparePaths(a.file ?? a.area, b.file ?? b.area);
}

/**
 * Pure comparison: fails a file above its cap and the rule above its total.
 *
 * Legacy baselines (no `files`) fall back to the per-area gate; `--update`
 * always writes the two-level schema.
 */
export function compareRuleBudgets(
  current: RuleCounts,
  budget: BudgetRuleBounds,
  rule: string,
): BudgetViolation[] {
  if (budget.files === undefined) {
    return findBudgetViolations(current.areas, budget.areas, rule);
  }

  const threshold = budget.fileThreshold ?? PER_FILE_CAP_THRESHOLD;
  const allowance = Math.max(0, threshold - 1);
  const violations: BudgetViolation[] = [];

  for (const [file, count] of Object.entries(current.files)) {
    const cap = budget.files[file] ?? allowance;
    if (count > cap) {
      violations.push({
        area: areaOf(file),
        budget: cap,
        current: count,
        file,
        rule,
        scope: "file",
      });
    }
  }

  if (current.total > budget.total) {
    violations.push({
      area: "total",
      budget: budget.total,
      current: current.total,
      rule,
      scope: "total",
    });
  }

  return violations.sort(compareViolations);
}

/** Compares every rule's current counts against the recorded baseline. */
export function checkRuleBudgets(files: SourceFile[], baseline: BudgetBaseline): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  for (const [key, rule] of Object.entries(RULES)) {
    const budget = baseline.rules[key];
    if (!budget) {
      violations.push({ area: "(missing baseline)", budget: 0, current: 1, rule: rule.label });
      continue;
    }
    const current = countRuleDetails(files, rule.pattern);
    violations.push(...compareRuleBudgets(current, budget, rule.label));
  }
  return violations;
}

/** One violation, formatted for both this CLI and the aggregated gate. */
export function formatBudgetViolation(violation: BudgetViolation): string {
  if (violation.scope === "file" && violation.file !== undefined) {
    const delta = violation.current - violation.budget;
    return `${violation.rule} · ${violation.file}: ${violation.current} (cap ${violation.budget}, +${delta})`;
  }
  if (violation.scope === "total") {
    const delta = violation.current - violation.budget;
    return `${violation.rule} · total: ${violation.current} (budget ${violation.budget}, +${delta})`;
  }
  return `${violation.rule} · ${violation.area}: ${violation.current} (budget ${violation.budget})`;
}

/** Builds one rule's deterministic baseline entry from an already-read tree. */
export function buildRuleBudget(
  files: SourceFile[],
  rule: { label: string; pattern: RegExp; source: string },
  threshold = PER_FILE_CAP_THRESHOLD,
): BudgetRule {
  const current = countRuleDetails(files, rule.pattern);
  const tracked: Record<string, number> = {};

  for (const [path, count] of Object.entries(current.files)) {
    if (count >= threshold) tracked[path] = count;
  }

  return {
    label: rule.label,
    pattern: rule.source,
    fileThreshold: threshold,
    areas: sortRecord(current.areas),
    files: sortRecord(tracked),
    total: current.total,
  };
}

function buildBaseline(files: SourceFile[]): BudgetBaseline {
  const rules: Record<string, BudgetRule> = {};
  for (const [key, rule] of Object.entries(RULES)) {
    rules[key] = buildRuleBudget(files, rule);
  }
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: `Two-level ratchet: per-file caps for files with >= ${PER_FILE_CAP_THRESHOLD} occurrences plus the rule total. A new file is allowed ${PER_FILE_CAP_THRESHOLD - 1}. Run --update after lowering a count.`,
    rules,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const files = readSourceFiles();
  const update = process.argv.includes("--update");

  if (update) {
    const baseline = buildBaseline(files);
    const baselinePath = budgetBaselinePath();
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    for (const rule of Object.values(baseline.rules)) {
      console.log(
        `📌 ${rule.label}: ${rule.total} occurrences across ${Object.keys(rule.areas).length} areas (${Object.keys(rule.files ?? {}).length} files >= ${rule.fileThreshold})`,
      );
    }
    console.log(`✅ baseline written to ${baselinePath}`);
    return;
  }

  const baseline = loadBudgetBaseline();
  if (!baseline) {
    console.error(
      `❌ Missing ${budgetBaselinePath()}. Run: bun run scripts/lint/lint-rule-budgets.ts --update`,
    );
    process.exitCode = 1;
    return;
  }

  const violations = checkRuleBudgets(files, baseline);

  if (violations.length === 0) {
    console.log("✅ rule budgets: every file cap and rule total is within its baseline.");
    return;
  }

  console.error(`❌ rule budget exceeded: ${violations.length}`);
  for (const violation of violations) {
    console.error(`   ${formatBudgetViolation(violation)}`);
  }
  console.error(
    "\n   Reduce the count instead of raising the baseline; after a reduction run --update to ratchet down.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
