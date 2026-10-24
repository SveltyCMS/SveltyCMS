/**
 * @file tests/unit/scripts/check-flake-budget.test.ts
 * @description Pins the flake-budget arithmetic.
 *
 * The budget has two caps: an absolute retry count and a retry rate. The rate is
 * only meaningful once the shard is large enough that the rate budget allows at
 * least as many retries as the absolute budget — otherwise a 25-test shard fails
 * on a single retry (1/25 = 4 % > 3 %) even though `--max-flaky=2` permits it.
 * That false positive reded multiple CI runs (40081783303, 40079196911,
 * 40075323360, 40036613206).
 */

import { describe, expect, it } from "vitest";
import { evaluate, type Budget, type Totals } from "../../../scripts/check/check-flake-budget";

const budget: Budget = { maxFlaky: 2, maxFlakeRate: 3 };

function totals(overrides: Partial<Totals> = {}): Totals {
  return { passed: 0, failed: 0, flaky: 0, skipped: 0, ...overrides };
}

describe("flake budget", () => {
  it("allows a single retry in a small shard when maxFlaky permits it", () => {
    const result = evaluate(totals({ passed: 24, flaky: 1 }), budget);

    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("allows two retries only while the rate stays within budget", () => {
    // The parser folds flaky into `passed`, so executed = 67 here: 2/67 = 2.99 %.
    expect(evaluate(totals({ passed: 67, flaky: 2 }), budget).ok).toBe(true);
    // 2/66 = 3.03 % — two retries in a small shard are a real signal.
    expect(evaluate(totals({ passed: 66, flaky: 2 }), budget).ok).toBe(false);
  });

  it("fails on the absolute cap even when the rate is small", () => {
    const result = evaluate(totals({ passed: 197, flaky: 3 }), budget);

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("flaky 3 > budget 2");
  });

  it("fails on the rate once the shard is large and the rate is exceeded", () => {
    const result = evaluate(totals({ passed: 96, flaky: 4 }), {
      maxFlaky: 5,
      maxFlakeRate: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("flake rate"))).toBe(true);
  });

  it("fails any retry when the budget is zero (local pre-push)", () => {
    const result = evaluate(totals({ passed: 25, flaky: 1 }), {
      maxFlaky: 0,
      maxFlakeRate: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("flaky 1 > budget 0");
  });

  it("passes an empty report", () => {
    expect(evaluate(totals(), budget).ok).toBe(true);
  });
});
