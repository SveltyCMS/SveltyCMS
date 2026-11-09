/**
 * @file tests/unit/ci/rule-budgets-per-file.test.ts
 * @description Pins the two-level rule-budget comparison: per-file caps plus the
 * rule total, including the threshold allowance for files that were not in the
 * baseline and the legacy per-area fallback.
 */

import { describe, expect, it } from "vitest";
import {
  PER_FILE_CAP_THRESHOLD,
  buildRuleBudget,
  compareRuleBudgets,
  formatBudgetViolation,
  type BudgetRuleBounds,
  type RuleCounts,
} from "../../../scripts/lint/lint-rule-budgets";

/** Derives areas and the total from a synthetic per-file count map. */
function counts(files: Record<string, number>, total?: number): RuleCounts {
  const areas: Record<string, number> = {};
  let sum = 0;

  for (const [path, count] of Object.entries(files)) {
    const parts = path.split("/");
    const area = parts.length > 2 ? (parts[1] ?? "root") : "root";
    areas[area] = (areas[area] ?? 0) + count;
    sum += count;
  }

  return { areas, files, total: total ?? sum };
}

/** Two-level bounds; `files` present means the per-file gate is active. */
function bounds(
  files: Record<string, number>,
  total: number,
  fileThreshold = PER_FILE_CAP_THRESHOLD,
): BudgetRuleBounds {
  return { areas: {}, files, fileThreshold, total };
}

describe("compareRuleBudgets — per-file caps", () => {
  it("passes a file within its recorded cap", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 3 }),
      bounds({ "src/services/a.ts": 3 }, 3),
      "explicit any",
    );

    expect(violations).toEqual([]);
  });

  it("flags one file over its cap with file, current, cap and delta", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 5 }),
      bounds({ "src/services/a.ts": 3 }, 5),
      "explicit any",
    );

    expect(violations).toEqual([
      {
        area: "services",
        budget: 3,
        current: 5,
        file: "src/services/a.ts",
        rule: "explicit any",
        scope: "file",
      },
    ]);
    expect(formatBudgetViolation(violations[0]!)).toBe(
      "explicit any · src/services/a.ts: 5 (cap 3, +2)",
    );
  });

  it("passes when a file and the total decrease", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 1 }),
      bounds({ "src/services/a.ts": 7 }, 40),
      "explicit any",
    );

    expect(violations).toEqual([]);
  });

  it("fails a new file at the threshold against the threshold - 1 allowance", () => {
    const violations = compareRuleBudgets(
      counts({ "src/routes/new-page.ts": PER_FILE_CAP_THRESHOLD }),
      bounds({}, PER_FILE_CAP_THRESHOLD),
      "explicit any",
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: "src/routes/new-page.ts",
      budget: PER_FILE_CAP_THRESHOLD - 1,
      current: PER_FILE_CAP_THRESHOLD,
      scope: "file",
    });
    expect(formatBudgetViolation(violations[0]!)).toBe(
      `explicit any · src/routes/new-page.ts: ${PER_FILE_CAP_THRESHOLD} (cap ${PER_FILE_CAP_THRESHOLD - 1}, +1)`,
    );
  });

  it("passes a new file below the threshold when the total stays within its cap", () => {
    const violations = compareRuleBudgets(
      counts({ "src/routes/new-page.ts": PER_FILE_CAP_THRESHOLD - 1 }),
      bounds({}, PER_FILE_CAP_THRESHOLD - 1),
      "explicit any",
    );

    expect(violations).toEqual([]);
  });
});

describe("compareRuleBudgets — rule total", () => {
  it("flags a total above the recorded total", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 3, "src/services/b.ts": 3 }),
      bounds({ "src/services/a.ts": 3, "src/services/b.ts": 3 }, 5),
      "explicit any",
    );

    expect(violations).toEqual([
      { area: "total", budget: 5, current: 6, rule: "explicit any", scope: "total" },
    ]);
    expect(formatBudgetViolation(violations[0]!)).toBe("explicit any · total: 6 (budget 5, +1)");
  });

  it("passes a total at exactly the recorded total", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 5 }),
      bounds({ "src/services/a.ts": 5 }, 5),
      "explicit any",
    );

    expect(violations).toEqual([]);
  });
});

describe("compareRuleBudgets — legacy baseline", () => {
  it("falls back to the per-area gate when the baseline has no files map", () => {
    const violations = compareRuleBudgets(
      counts({ "src/services/a.ts": 2 }),
      { areas: { services: 1 }, total: 1 },
      "explicit any",
    );

    expect(violations).toEqual([{ area: "services", budget: 1, current: 2, rule: "explicit any" }]);
    expect(formatBudgetViolation(violations[0]!)).toBe("explicit any · services: 2 (budget 1)");
  });
});

describe("buildRuleBudget", () => {
  it("records only files at or above the threshold, with sorted keys", () => {
    const budget = buildRuleBudget(
      [
        { path: "src/services/s.ts", source: "const s: any = 1;\n" },
        { path: "src/routes/b.ts", source: "const b: any = 1;\n" },
        {
          path: "src/routes/a.ts",
          source: "const a: any = 1;\nconst c = a as any;\n",
        },
      ],
      {
        label: "explicit any",
        pattern: /:\s*any\b|\bas\s+any\b|<any>|any\[\]/g,
        source: "fixture",
      },
      2,
    );

    expect(budget.fileThreshold).toBe(2);
    expect(Object.keys(budget.files ?? {})).toEqual(["src/routes/a.ts"]);
    expect(Object.keys(budget.areas)).toEqual(["routes", "services"]);
    expect(budget.areas).toEqual({ routes: 3, services: 1 });
    expect(budget.total).toBe(4);
  });
});
