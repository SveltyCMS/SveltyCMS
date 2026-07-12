/**
 * @file tests/unit/scripts/probe-deploy-testing-api.test.ts
 * @description Unit tests for deploy backdoor probe orchestration helpers.
 */

import { describe, expect, it } from "vitest";

function getOnlyFilter(argv: string[]): string | null {
  const arg = argv.find((a) => a.startsWith("--only="));
  return arg?.split("=")[1] ?? null;
}

function shouldRunBackdoor(only: string | null): boolean {
  return !only || only === "backdoor";
}

function shouldRunFull(only: string | null): boolean {
  return !only;
}

describe("security-audit --only=backdoor filter", () => {
  it("runs only backdoor probes when --only=backdoor", () => {
    const only = getOnlyFilter(["node", "security-audit.ts", "--only=backdoor", "--ci"]);
    expect(shouldRunBackdoor(only)).toBe(true);
    expect(shouldRunFull(only)).toBe(false);
  });

  it("runs full audit when --only is absent", () => {
    const only = getOnlyFilter(["node", "security-audit.ts", "--ci"]);
    expect(shouldRunBackdoor(only)).toBe(true);
    expect(shouldRunFull(only)).toBe(true);
  });
});
