/**
 * @file tests/unit/scripts/rule-registry.test.ts
 * @description Guards the single-owner fast-check registry: ids stay unique,
 * every declared script exists, and the AST-backed gates are classified as such.
 */

import { describe, expect, it } from "vitest";
import { FAST_CHECKS, assertRuleRegistryIntegrity } from "../../../scripts/check/rule-registry";

describe("fast-check rule registry", () => {
  it("declares unique check ids", () => {
    const ids = FAST_CHECKS.map((spec) => spec.id);

    expect(new Set(ids).size).toBe(FAST_CHECKS.length);
  });

  it("passes registry integrity (no duplicate ids, no missing scripts)", () => {
    expect(assertRuleRegistryIntegrity()).toEqual([]);
  });

  it("classifies the AST-backed rules", () => {
    const kindById = new Map(FAST_CHECKS.map((spec) => [spec.id, spec.kind]));

    // One process runs the module-graph linkmap and the tenant-scope lint over a
    // single workspace read; the standalone scripts remain for debugging.
    expect(kindById.get("check-ast-gates")).toBe("ast");
    expect(kindById.has("check-linkmap")).toBe(false);
    expect(kindById.has("lint-tenant-scope")).toBe(false);
  });
});
