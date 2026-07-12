/**
 * @file tests/unit/plugins/unified-data-hub/native-virtual-stitch.test.ts
 * @description v2.0 native → virtual enrichment stitch tests.
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  assertNativeStitchKeyBudget,
  normalizeStitchKeys,
} from "@plugins/unified-data-hub/server/native-virtual-stitch";

describe("native virtual stitch", () => {
  it("deduplicates and normalizes keys", () => {
    expect(normalizeStitchKeys(["1", "2", "1", ""])).toEqual(["1", "2"]);
  });

  it("enforces key budget", () => {
    expect(() => assertNativeStitchKeyBudget(101)).toThrow(FederationError);
  });

  it("returns empty for no keys", () => {
    expect(normalizeStitchKeys([])).toEqual([]);
  });
});
