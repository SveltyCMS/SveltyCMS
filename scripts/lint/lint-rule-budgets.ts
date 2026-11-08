/**
 * @file scripts/lint/lint-rule-budgets.ts
 * @description Per-area ratchet for two documented rules the tree does not yet
 * satisfy globally: explicit `any` and `throw new AppError(...)`.
 *
 * A big-bang migration is not safe (1,808+ `any`, 700+ AppError throws), but
 * unchecked growth is how the rule became fiction. The baseline is the current
 * per-area count; the gate fails when any area goes **up**. Lowering an area and
 * running `--update` ratchets the budget down permanently.
 *
 * `raise()` vs `AppError`: `AGENTS.md` now defines `raise()` as the
 * handler-facing constructor and allows `throw new AppError` inside services /
 * adapters where a typed error must cross a boundary. This gate keeps that
 * decision honest by preventing new direct throws.
 *
 * Usage:
 *   bun run scripts/lint/lint-rule-budgets.ts            # check
 *   bun run scripts/lint/lint-rule-budgets.ts --update   # regenerate baseline
 *
 * Features:
 * - Per-top-level-area budgets (`src/databases`, `src/routes`, …)
 * - Comment lines ignored (documenting a rule is not a violation)
 * - `--update` records decreases; the check never fails on a decrease
 * - Exported `checkRuleBudgets()` / `loadBudgetBaseline()` so the aggregated
 *   source-lint gate reads the baseline once and emits identical violation text
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSourceFiles } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface BudgetRule {
  /** Human-readable rule name. */
  label: string;
  /** Regex source (global, counted per occurrence). */
  pattern: string;
  areas: Record<string, number>;
  total: number;
}

export interface BudgetBaseline {
  generatedAt: string;
  note: string;
  rules: Record<string, BudgetRule>;
}

export interface BudgetViolation {
  area: string;
  budget: number;
  current: number;
  rule: string;
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

/** Counts non-comment occurrences per area for one rule. */
export function countRule(files: SourceFile[], pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const file of files) {
    const area = areaOf(file.path);
    for (const line of file.source.split(/\r?\n/)) {
      if (isComment(line)) continue;
      const matches = line.match(pattern);
      if (matches) counts[area] = (counts[area] ?? 0) + matches.length;
    }
  }

  return counts;
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

/** Compares every rule's current per-area counts against the recorded baseline. */
export function checkRuleBudgets(files: SourceFile[], baseline: BudgetBaseline): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  for (const [key, rule] of Object.entries(RULES)) {
    const current = countRule(files, rule.pattern);
    const budget = baseline.rules[key];
    if (!budget) {
      violations.push({ area: "(missing baseline)", budget: 0, current: 1, rule: rule.label });
      continue;
    }
    violations.push(...findBudgetViolations(current, budget.areas, rule.label));
  }
  return violations;
}

/** One violation, formatted for both this CLI and the aggregated gate. */
export function formatBudgetViolation(violation: BudgetViolation): string {
  return `${violation.rule} · ${violation.area}: ${violation.current} (budget ${violation.budget})`;
}

function buildBaseline(files: SourceFile[]): BudgetBaseline {
  const rules: Record<string, BudgetRule> = {};
  for (const [key, rule] of Object.entries(RULES)) {
    const areas = countRule(files, rule.pattern);
    rules[key] = {
      label: rule.label,
      pattern: rule.source,
      areas,
      total: Object.values(areas).reduce((sum, n) => sum + n, 0),
    };
  }
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: "Ratchet: the gate fails only when an area grows. Run --update after lowering a count.",
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
        `📌 ${rule.label}: ${rule.total} occurrences across ${Object.keys(rule.areas).length} areas`,
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
    console.log("✅ rule budgets: no area above its baseline.");
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
