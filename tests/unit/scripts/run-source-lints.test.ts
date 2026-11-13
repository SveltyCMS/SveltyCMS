/**
 * @file tests/unit/scripts/run-source-lints.test.ts
 * @description Pins the single-process aggregation of the source lints.
 *
 * Each rule has its own fixture suite; this test proves the shared gate surfaces
 * the offenses with the expected prefix and fails closed, so folding a rule out
 * of its own `FAST_CHECKS` entry cannot silently drop it.
 */

import { describe, expect, it } from "vitest";
import { runSourceLints } from "../../../scripts/check/run-source-lints";
import type { BudgetBaseline } from "../../../scripts/lint/lint-rule-budgets";

function file(path: string, source: string) {
  return { path, source };
}

/** A zero-budget ratchet, so any occurrence in the fixture areas is an offense. */
function budgetWith(areas: Record<string, number> = {}): BudgetBaseline {
  return {
    generatedAt: "2026-01-01",
    note: "fixture",
    rules: {
      any: { label: "explicit any", pattern: "", areas, total: 0 },
      appError: { label: "throw new AppError()", pattern: "", areas: {}, total: 0 },
    },
  };
}

/** Every dynamic-color recipe the design rule requires, as an `@utility`. */
const SAFELIST_CSS = ["primary", "secondary", "tertiary", "success", "warning", "error", "surface"]
  .flatMap((color) => [
    `preset-filled-${color}-500`,
    `preset-outlined-${color}-500`,
    `preset-ghost-${color}-500`,
    `preset-tonal-${color}`,
  ])
  .map((name) => `@utility ${name} { /* fixture */ }`)
  .join("\n");

const CSS = [file("src/app.css", SAFELIST_CSS)];

describe("run-source-lints", () => {
  it("passes a clean source set", () => {
    const report = runSourceLints(
      [
        file(
          "src/services/clean.ts",
          "import { nowISODateString } from '@utils/date';\nexport const t = nowISODateString();\n",
        ),
      ],
      { designCssSources: CSS },
    );

    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it("surfaces a direct ISO-now call with the date-helpers prefix", () => {
    const report = runSourceLints(
      [file("src/services/clock.ts", "export const t = new Date().toISOString();\n")],
      { designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.dateCallOffenses).toHaveLength(1);
    expect(report.violations[0]).toContain("date-helpers src/services/clock.ts:1");
  });

  it("surfaces an ungated module-scope timer", () => {
    const report = runSourceLints(
      [file("src/services/timers.ts", "setInterval(() => {}, 1000);\n")],
      { designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.timerOffenses.length).toBeGreaterThan(0);
    expect(
      report.violations.some((v) => v.startsWith("global-timers src/services/timers.ts")),
    ).toBe(true);
  });

  it("reports every rule family in one pass", () => {
    const report = runSourceLints(
      [
        file("src/services/a.ts", "export const t = new Date().toISOString();\n"),
        file("src/services/b.ts", "setInterval(() => {}, 1000);\n"),
      ],
      { designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.violations.length).toBeGreaterThanOrEqual(2);
    expect(report.violations.some((v) => v.startsWith("date-helpers "))).toBe(true);
    expect(report.violations.some((v) => v.startsWith("global-timers "))).toBe(true);
  });

  it("surfaces a duplicate data-testid with the duplicate-testids prefix", () => {
    const report = runSourceLints(
      [
        file("src/components/media/media-grid.svelte", `<div data-testid="media-grid" />`),
        file(
          "src/routes/(app)/mediagallery/+page.svelte",
          `<AdminCard data-testid="media-grid"><MediaGrid /></AdminCard>`,
        ),
      ],
      { budgetBaseline: budgetWith(), designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.duplicateTestIdOffenses).toHaveLength(1);
    expect(
      report.violations.some((v) =>
        v.startsWith("duplicate-testids src/routes/(app)/mediagallery/+page.svelte:1"),
      ),
    ).toBe(true);
  });

  it("surfaces an ungated secret with the anonymous-leaks prefix", () => {
    const report = runSourceLints(
      [
        file(
          "src/routes/login/auth.remote.ts",
          [
            'import { command } from "$app/server";',
            "",
            'export const forgotPW = command("unchecked", async (input: { token: string }) => {',
            '  const resetLink = "/login?token=" + input.token;',
            "  return { success: true, resetLink };",
            "});",
            "",
          ].join("\n"),
        ),
      ],
      { budgetBaseline: budgetWith(), designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.anonymousLeakOffenses).toHaveLength(1);
    expect(report.anonymousLeakOffenses[0]?.key).toBe("resetLink");
    expect(
      report.violations.some((v) =>
        v.startsWith("anonymous-leaks src/routes/login/auth.remote.ts:"),
      ),
    ).toBe(true);
  });

  it("surfaces a dead legacy class with the design prefix", () => {
    const report = runSourceLints(
      [file("src/components/x/legacy-button.svelte", `<button class="variant-filled">Go</button>`)],
      { budgetBaseline: budgetWith(), designCssSources: CSS },
    );

    expect(report.ok).toBe(false);
    expect(report.designResult.deadClassOffenses).toHaveLength(1);
    expect(
      report.violations.some((v) => v.startsWith("design src/components/x/legacy-button.svelte:1")),
    ).toBe(true);
  });

  it("surfaces an area above its ratchet with the rule-budgets prefix", () => {
    const report = runSourceLints([file("src/services/budget.ts", "const value: any = 1;\n")], {
      budgetBaseline: budgetWith(),
      designCssSources: CSS,
    });

    expect(report.ok).toBe(false);
    expect(report.budgetViolations).toEqual([
      { area: "services", budget: 0, current: 1, rule: "explicit any" },
    ]);
    expect(
      report.violations.some((v) => v === "rule-budgets explicit any · services: 1 (budget 0)"),
    ).toBe(true);
  });

  it("fails closed when the budget baseline is missing", () => {
    const report = runSourceLints([file("src/services/clean.ts", "export const ok = true;\n")], {
      budgetBaseline: null,
      designCssSources: CSS,
    });

    expect(report.ok).toBe(false);
    expect(report.budgetBaselineMissing).toBe(true);
    expect(report.violations.some((v) => v.startsWith("rule-budgets "))).toBe(true);
  });

  it("passes a clean set across all nine rules", () => {
    const report = runSourceLints(
      [
        file("src/components/x/clean-card.svelte", `<div data-testid="clean-card"><slot /></div>`),
        file("src/routes/(app)/home/+page.svelte", `<CleanCard />`),
        file(
          "src/routes/home/form.remote.ts",
          [
            'import { command } from "$app/server";',
            'export const ping = command("unchecked", async (input: { name: string }) => {',
            "  return { ok: input.name };",
            "});",
            "",
          ].join("\n"),
        ),
        file(
          "src/services/clean.ts",
          "import { nowISODateString } from '@utils/date';\nexport const t = nowISODateString();\n",
        ),
      ],
      { budgetBaseline: budgetWith(), designCssSources: CSS },
    );

    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
