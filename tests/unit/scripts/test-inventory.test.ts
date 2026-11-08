/**
 * @file tests/unit/scripts/test-inventory.test.ts
 * @description Contract tests for the executed-test inventory floor ratchet.
 *
 * The ratchet exists because a green suite only proves that the tests which ran
 * passed. These tests pin the two properties that make it trustworthy: areas are
 * derived deterministically from file paths, and any per-area or total drop is
 * reported as a violation while growth is accepted.
 */

import { describe, expect, it } from "vitest";
import {
  areaForTestFile,
  collectTestInventory,
  compareInventory,
  type InventoryLayer,
  type VitestJsonReport,
} from "../../../scripts/check/check-test-inventory";

const NOW = "2026-11-07T00:00:00.000Z";

function layer(areas: Record<string, number>, generatedAt = NOW): InventoryLayer {
  const rows = Object.fromEntries(
    Object.entries(areas).map(([area, tests]) => [area, { files: 1, tests }]),
  );
  return {
    generatedAt,
    totals: {
      files: Object.keys(areas).length,
      tests: Object.values(areas).reduce((a, b) => a + b, 0),
    },
    areas: rows,
  };
}

describe("test-inventory areas", () => {
  it("maps nested unit paths to their second directory segment", () => {
    expect(areaForTestFile("tests/unit/api/users.test.ts")).toBe("unit/api");
    expect(areaForTestFile("tests/unit/security/csrf.test.ts")).toBe("unit/security");
    expect(areaForTestFile("tests/unit/scripts/rule-registry.test.ts")).toBe("unit/scripts");
  });

  it("maps a top-level unit file to the layer itself", () => {
    expect(areaForTestFile("tests/unit/helpers.test.ts")).toBe("unit");
  });

  it("normalizes Windows separators and other layers", () => {
    expect(areaForTestFile("D:\\repo\\tests\\unit\\sdk\\read.test.ts")).toBe("unit/sdk");
    expect(areaForTestFile("tests/e2e/routes/login.spec.ts")).toBe("e2e/routes");
    expect(areaForTestFile("src/widgets/custom/foo/tests/foo.test.ts")).toBe("widgets");
    expect(areaForTestFile("somewhere/else.test.ts")).toBe("other");
  });
});

describe("collectTestInventory", () => {
  it("counts files and assertions per area", () => {
    const report: VitestJsonReport = {
      numTotalTests: 5,
      testResults: [
        {
          name: "D:/repo/tests/unit/api/a.test.ts",
          assertionResults: [{}, {}],
        },
        {
          name: "D:/repo/tests/unit/api/b.test.ts",
          assertionResults: [{}],
        },
        {
          name: "D:/repo/tests/unit/security/c.test.ts",
          assertionResults: [{}, {}],
        },
      ],
    };

    const inventory = collectTestInventory(report, NOW);

    expect(inventory?.totals).toEqual({ files: 3, tests: 5 });
    expect(inventory?.areas["unit/api"]).toEqual({ files: 2, tests: 3 });
    expect(inventory?.areas["unit/security"]).toEqual({ files: 1, tests: 2 });
  });

  it("fails closed when the report carries no per-file results", () => {
    expect(collectTestInventory({ numTotalTests: 0, testResults: [] }, NOW)).toBeNull();
    expect(collectTestInventory({}, NOW)).toBeNull();
  });
});

describe("compareInventory", () => {
  const baseline = layer({ "unit/api": 10, "unit/security": 5 });

  it("accepts an unchanged or grown inventory", () => {
    const grown = layer({ "unit/api": 12, "unit/security": 5, "unit/new": 3 });

    expect(compareInventory(baseline, grown).violations).toEqual([]);
  });

  it("reports a per-area drop even when the total grows elsewhere", () => {
    const shifted = layer({ "unit/api": 14, "unit/security": 1 });

    const { violations } = compareInventory(baseline, shifted);

    expect(violations).toContain('Area "unit/security" dropped from 5 to 1 (-4)');
  });

  it("reports an area that stopped executing entirely", () => {
    const missing = layer({ "unit/api": 10 });

    const { violations } = compareInventory(baseline, missing);

    expect(violations).toContain('Area "unit/security" no longer executed (baseline 5 tests)');
  });

  it("reports a total drop and lists the changed areas", () => {
    const smaller = layer({ "unit/api": 9, "unit/security": 5 });

    const { violations, changed } = compareInventory(baseline, smaller);

    expect(
      violations.some((violation) => violation.startsWith("Total executed tests dropped")),
    ).toBe(true);
    expect(changed).toContainEqual({ area: "unit/api", base: 10, curr: 9 });
  });
});
