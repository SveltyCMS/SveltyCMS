/**
 * @file tests/unit/benchmarks/ci-regression-gate.test.ts
 * @description Unit tests for the CI performance gate policy.
 *
 * The gate turns benchmark latency into a merge signal: absolute budgets always
 * fail, relative drift warns on `next` and fails on `main`. These tests pin the
 * threshold behaviour without touching the filesystem.
 */

import { describe, expect, it } from "vitest";
import {
  budgetFor,
  evaluateSamples,
  type GateSample,
} from "../../../scripts/benchmark-matrix/ci-regression-gate";

const LABEL = "REST list p95";

function sample(value: number, budget = 5): GateSample {
  return { label: LABEL, value, budget };
}

describe("CI performance gate", () => {
  it("builds a baseline without failing on the first run", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(1)], {});

    expect(result.status).toBe("pass");
    expect(result.passed).toBe(true);
    expect(result.baselineRuns).toBe(0);
    expect(result.metrics[0]?.baseline).toBeNull();
    expect(result.metrics[0]?.changePct).toBeNull();
  });

  it("warns on moderate drift under the warn policy", () => {
    const result = evaluateSamples("sqlite", "warn", [sample(1.4)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("warn");
    expect(result.passed).toBe(true);
    expect(result.metrics[0]?.changePct).toBeCloseTo(40, 5);
    expect(result.metrics[0]?.severity).toBe("warn");
  });

  it("fails severe drift on the fail policy", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(3)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.failures).toBe(1);
  });

  it("downgrades severe drift to a warning under the warn policy", () => {
    const result = evaluateSamples("sqlite", "warn", [sample(3)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("warn");
    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
  });

  it("always fails an absolute budget breach", () => {
    const result = evaluateSamples("sqlite", "warn", [sample(6, 5)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("fail");
    expect(result.passed).toBe(false);
    expect(result.metrics[0]?.budgetExceeded).toBe(true);
    expect(result.metrics[0]?.reason).toContain("budget exceeded");
  });

  it("ignores improvements and sub-threshold noise", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(0.9)], { [LABEL]: [1, 1] });

    expect(result.status).toBe("pass");
    expect(result.metrics[0]?.severity).toBe("ok");
  });

  it("requires enough baseline samples before judging drift", () => {
    const result = evaluateSamples("sqlite", "fail", [sample(3)], { [LABEL]: [1] });

    expect(result.status).toBe("pass");
    expect(result.metrics[0]?.baseline).toBeNull();
  });

  it("resolves adapter budget overrides", () => {
    expect(budgetFor("sqlite", "dbRaw")).toBe(80);
    expect(budgetFor("postgresql", "dbRaw")).toBe(30);
    expect(budgetFor("sqlite", "collections")).toBe(5);
  });
});
