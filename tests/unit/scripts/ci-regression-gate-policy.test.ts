/**
 * @file tests/unit/scripts/ci-regression-gate-policy.test.ts
 * @description Pins the benchmark gate policy.
 *
 * Absolute SLA budgets always fail. Relative drift is a noisy signal on shared
 * runners, so it only hard-fails on `main` / `merge_group`; pushes to `next` and
 * PRs warn. The old rule (`event !== "pull_request"` ⇒ fail) failed run
 * 40082653599 on 1.1 ms of VM jitter against a 25 ms budget.
 */

import { afterEach, describe, expect, it } from "vitest";
import { resolvePolicy } from "../../../scripts/benchmark-matrix/ci-regression-gate";

const originalRef = process.env.GITHUB_REF;
const originalEvent = process.env.GITHUB_EVENT_NAME;

afterEach(() => {
  if (originalRef === undefined) delete process.env.GITHUB_REF;
  else process.env.GITHUB_REF = originalRef;
  if (originalEvent === undefined) delete process.env.GITHUB_EVENT_NAME;
  else process.env.GITHUB_EVENT_NAME = originalEvent;
});

describe("benchmark gate policy", () => {
  it("honours an explicit policy", () => {
    expect(resolvePolicy("fail")).toBe("fail");
    expect(resolvePolicy("warn")).toBe("warn");
  });

  it("fails relative drift on main", () => {
    process.env.GITHUB_REF = "refs/heads/main";
    process.env.GITHUB_EVENT_NAME = "push";
    expect(resolvePolicy(undefined)).toBe("fail");
  });

  it("fails relative drift in the merge queue", () => {
    process.env.GITHUB_REF = "refs/heads/next";
    process.env.GITHUB_EVENT_NAME = "merge_group";
    expect(resolvePolicy(undefined)).toBe("fail");
  });

  it("warns on a push to next", () => {
    process.env.GITHUB_REF = "refs/heads/next";
    process.env.GITHUB_EVENT_NAME = "push";
    expect(resolvePolicy(undefined)).toBe("warn");
  });

  it("warns on pull requests and when the environment is absent", () => {
    process.env.GITHUB_REF = "refs/pull/42/merge";
    process.env.GITHUB_EVENT_NAME = "pull_request";
    expect(resolvePolicy(undefined)).toBe("warn");

    delete process.env.GITHUB_REF;
    delete process.env.GITHUB_EVENT_NAME;
    expect(resolvePolicy(undefined)).toBe("warn");
  });
});
