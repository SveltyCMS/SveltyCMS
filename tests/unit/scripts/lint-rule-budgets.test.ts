/**
 * @file tests/unit/scripts/lint-rule-budgets.test.ts
 * @description Fixtures for the per-area rule-budget ratchet.
 */

import { describe, expect, it } from "vitest";
import { countRule, findBudgetViolations } from "../../../scripts/lint/lint-rule-budgets";

const file = (path: string, source: string) => ({ path, source });

describe("countRule", () => {
  it("counts per top-level area and ignores comments", () => {
    const counts = countRule(
      [
        file("src/databases/a.ts", "const a: any = 1;\nconst b = x as any;\n"),
        file("src/routes/b.ts", "const c: any = 2;\n// const d: any = 3;\n"),
        file("src/hooks.server.ts", "const e: any = 4;\n"),
      ],
      /:\s*any\b|\bas\s+any\b|<any>|any\[\]/g,
    );

    expect(counts).toEqual({ databases: 2, routes: 1, root: 1 });
  });
});

describe("findBudgetViolations", () => {
  it("flags only areas above their budget", () => {
    const violations = findBudgetViolations(
      { databases: 3, routes: 1, services: 0 },
      { databases: 2, routes: 5, services: 0 },
      "explicit any",
    );

    expect(violations).toEqual([
      { area: "databases", budget: 2, current: 3, rule: "explicit any" },
    ]);
  });

  it("accepts a decrease", () => {
    const violations = findBudgetViolations({ databases: 1 }, { databases: 4 }, "explicit any");

    expect(violations).toEqual([]);
  });
});
