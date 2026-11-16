/**
 * @file tests/unit/ci/check-pinned-actions.test.ts
 * @description Contract test ensuring all GitHub Actions references in workflow
 * and action definitions are pinned by immutable commit SHAs (OpenSSF Scorecard).
 */

import { describe, expect, it } from "vitest";
import { scanPinnedActions } from "../../../scripts/check/check-pinned-actions";
import { assertRuleRegistryIntegrity } from "../../../scripts/check/rule-registry";

describe("check-pinned-actions", () => {
  it("verifies all repository actions are pinned to commit SHAs", () => {
    const result = scanPinnedActions();
    expect(result.scannedFiles).toBeGreaterThanOrEqual(7);
    expect(result.totalActions).toBeGreaterThanOrEqual(68);
    expect(result.violations).toEqual([]);
  });

  it("passes rule registry integrity check including check-pinned-actions", () => {
    const errors = assertRuleRegistryIntegrity();
    expect(errors).toEqual([]);
  });
});
