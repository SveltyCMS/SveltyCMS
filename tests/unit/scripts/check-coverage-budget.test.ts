/**
 * @file tests/unit/scripts/check-coverage-budget.test.ts
 * @description Pins the per-area coverage ratchet without touching the real
 * `.vitest/coverage/coverage-final.json` report.
 *
 * The gate splits the P0 statement coverage into deterministic areas so a small
 * area cannot hide behind a large one. Fixtures cover the grouping rules, the
 * covered/total aggregation, the 0.5 pp tolerance boundary, baseline-only and
 * report-only areas, and the actionable missing-report error.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE_PP,
  aggregateCoverage,
  buildBaseline,
  classifyArea,
  evaluateBudget,
  formatBudgetTable,
  loadBudgetBaseline,
  loadCoverageReport,
  measureFile,
  parseCoverageReport,
  toRepoRelative,
  type AreaCoverage,
  type BudgetBaseline,
  type CoverageFs,
  type CoverageReport,
  type CoverageSummary,
  type RawCoverageEntry,
} from "../../../scripts/test/check-coverage-budget";

/** Build a raw Istanbul entry: one statement per hit value, one line each. */
function entry(path: string, hits: ReadonlyArray<number>): RawCoverageEntry {
  const statementMap: Record<string, { start: { line: number } }> = {};
  const s: Record<string, number> = {};
  hits.forEach((hit, index) => {
    statementMap[String(index)] = { start: { line: index + 1 } };
    s[String(index)] = hit;
  });
  return { path, statementMap, s };
}

function area(percent: number): AreaCoverage {
  return {
    statements: 100,
    coveredStatements: percent,
    lines: 100,
    coveredLines: percent,
    percent,
    linePercent: percent,
  };
}

function summary(areas: Record<string, number>, total = 100): CoverageSummary {
  return {
    files: Object.keys(areas).length,
    areas: Object.fromEntries(Object.entries(areas).map(([name, value]) => [name, area(value)])),
    total: area(total),
  };
}

function baseline(areas: Record<string, number>, total = 100): BudgetBaseline {
  return {
    generatedAt: "2026-11-06",
    note: "test fixture",
    tolerance: DEFAULT_TOLERANCE_PP,
    areas: Object.fromEntries(Object.entries(areas).map(([name, value]) => [name, area(value)])),
    total: area(total),
  };
}

const missingFs: CoverageFs = {
  existsSync: () => false,
  readFileSync: () => {
    throw new Error("readFileSync must not run when the file is missing");
  },
};

describe("classifyArea", () => {
  it.each([
    ["src/hooks/handle-auth.ts", "hooks"],
    ["src/databases/auth/api-keys.ts", "databases/auth"],
    ["src/utils/security/csrf.ts", "utils/security"],
    ["src/routes/api/[...path]/+server.ts", "routes/api"],
    ["src/utils/error-handling.ts", "utils/core"],
    ["src/utils/test-bypass.server.ts", "utils/core"],
    ["src/services/sdk/namespaces/content.ts", "src/services"],
    ["src/utils/nested/helper.ts", "src/utils"],
    ["src/index.ts", "src"],
  ])("maps %s to %s", (path, expected) => {
    expect(classifyArea(path)).toBe(expected);
  });
});

describe("toRepoRelative", () => {
  it("normalizes a Windows absolute path", () => {
    expect(toRepoRelative("D:\\repo\\src\\hooks\\handle-auth.ts", "D:\\repo")).toBe(
      "src/hooks/handle-auth.ts",
    );
  });

  it("normalizes a POSIX absolute path", () => {
    expect(toRepoRelative("/repo/src/hooks/handle-auth.ts", "/repo")).toBe(
      "src/hooks/handle-auth.ts",
    );
  });

  it("keeps an already-relative report path", () => {
    expect(toRepoRelative("./src/hooks/handle-auth.ts", "/repo")).toBe("src/hooks/handle-auth.ts");
  });
});

describe("aggregateCoverage", () => {
  const report: CoverageReport = {
    first: entry("/repo/src/hooks/handle-auth.ts", [3, 0, 1, 0]),
    second: entry("/repo/src/hooks/handle-request.ts", [1, 1, 0, 0]),
    security: entry("/repo/src/utils/security/csrf.ts", [1, 1, 1, 1]),
    core: entry("/repo/src/utils/error-handling.ts", [1, 0]),
  };

  it("sums statements and line coverage per area, then across the report", () => {
    const result = aggregateCoverage(report, "/repo");

    expect(result.files).toBe(4);
    expect(Object.keys(result.areas)).toEqual(["hooks", "utils/core", "utils/security"]);

    expect(result.areas.hooks).toMatchObject({
      statements: 8,
      coveredStatements: 4,
      lines: 8,
      coveredLines: 4,
      percent: 50,
      linePercent: 50,
    });
    expect(result.areas["utils/security"].percent).toBe(100);
    expect(result.areas["utils/core"]).toMatchObject({ statements: 2, coveredStatements: 1 });

    expect(result.total).toMatchObject({
      statements: 14,
      coveredStatements: 9,
      lines: 14,
      coveredLines: 9,
      percent: 64.29,
      linePercent: 64.29,
    });
  });

  it("counts a source line once even when several statements share it", () => {
    const result = measureFile({
      path: "src/hooks/a.ts",
      statementMap: {
        a: { start: { line: 10 } },
        b: { start: { line: 10 } },
        c: { start: { line: 11 } },
      },
      s: { a: 1, b: 0, c: 0 },
    });

    expect(result).toEqual({
      statements: 3,
      coveredStatements: 1,
      lines: 2,
      coveredLines: 1,
    });
  });

  it("returns zero percentages for an empty report", () => {
    const result = aggregateCoverage({}, "/repo");

    expect(result.files).toBe(0);
    expect(result.areas).toEqual({});
    expect(result.total.percent).toBe(0);
  });
});

describe("evaluateBudget", () => {
  it("passes when every area holds its baseline", () => {
    const result = evaluateBudget(summary({ hooks: 80 }, 80), baseline({ hooks: 80 }, 80));

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.rows.map((row) => row.area)).toEqual(["hooks", "total"]);
  });

  it("fails when an area drops more than the tolerance", () => {
    const result = evaluateBudget(summary({ hooks: 79 }, 79), baseline({ hooks: 80 }, 80));
    const row = result.rows.find((candidate) => candidate.area === "hooks");

    expect(result.ok).toBe(false);
    expect(row).toMatchObject({ baselinePercent: 80, currentPercent: 79, delta: -1, ok: false });
    expect(result.violations.map((violation) => violation.area)).toContain("hooks");
  });

  it("allows a drop of exactly 0.5 pp and rejects 0.51 pp", () => {
    const atLimit = evaluateBudget(summary({ hooks: 79.5 }, 79.5), baseline({ hooks: 80 }, 80));
    const overLimit = evaluateBudget(summary({ hooks: 79.49 }, 79.49), baseline({ hooks: 80 }, 80));

    expect(atLimit.ok).toBe(true);
    expect(overLimit.ok).toBe(false);
  });

  it("honours an explicit tolerance override", () => {
    const result = evaluateBudget(summary({ hooks: 79 }, 79), baseline({ hooks: 80 }, 80), 1);

    expect(result.ok).toBe(true);
  });

  it("reports a new area without failing it", () => {
    const result = evaluateBudget(
      summary({ hooks: 80, "routes/api": 10 }, 80),
      baseline({ hooks: 80 }, 80),
    );
    const row = result.rows.find((candidate) => candidate.area === "routes/api");

    expect(result.ok).toBe(true);
    expect(row).toMatchObject({ baselinePercent: null, currentPercent: 10, delta: null, ok: true });
  });

  it("treats a baseline area missing from the report as 0 %", () => {
    const result = evaluateBudget(summary({}, 80), baseline({ hooks: 80 }, 80));
    const row = result.rows.find((candidate) => candidate.area === "hooks");

    expect(result.ok).toBe(false);
    expect(row).toMatchObject({ currentPercent: 0, missing: true, ok: false });
  });

  it("checks the total row independently of the areas", () => {
    const result = evaluateBudget(summary({ hooks: 80 }, 79), baseline({ hooks: 80 }, 80));
    const total = result.rows.find((candidate) => candidate.area === "total");

    expect(result.ok).toBe(false);
    expect(total).toMatchObject({ baselinePercent: 80, currentPercent: 79, ok: false });
    expect(result.rows.find((candidate) => candidate.area === "hooks")?.ok).toBe(true);
  });
});

describe("formatBudgetTable", () => {
  it("prints baseline, current, and signed delta columns", () => {
    const result = evaluateBudget(summary({ hooks: 79 }, 79), baseline({ hooks: 80 }, 80));

    const table = formatBudgetTable(result.rows, DEFAULT_TOLERANCE_PP);

    expect(table).toContain("baseline");
    expect(table).toContain("current");
    expect(table).toContain("delta");
    expect(table).toContain("hooks");
    expect(table).toContain("-1.00");
  });
});

describe("loading reports and baselines", () => {
  it("explains how to generate a missing coverage report", () => {
    expect(() => loadCoverageReport("/missing/coverage-final.json", missingFs)).toThrow(
      /bun run test:coverage/,
    );
  });

  it("explains how to generate a missing baseline", () => {
    expect(() => loadBudgetBaseline("/missing/coverage-budget.json", missingFs)).toThrow(
      /--update/,
    );
  });

  it("parses a report through the filesystem boundary", () => {
    const raw = JSON.stringify({ a: entry("/repo/src/hooks/a.ts", [1, 0]) });
    const fs: CoverageFs = { existsSync: () => true, readFileSync: () => raw };

    const report = loadCoverageReport("/report.json", fs);

    expect(report.a.path).toBe("/repo/src/hooks/a.ts");
    expect(report.a.s).toEqual({ "0": 1, "1": 0 });
  });

  it("rejects entries without statement data", () => {
    expect(() => parseCoverageReport(JSON.stringify({ a: {} }))).toThrow(/statementMap or s/);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseCoverageReport("{")).toThrow(/Invalid coverage report/);
  });

  it("round-trips a generated baseline", () => {
    const generated = buildBaseline(summary({ hooks: 80 }, 80), DEFAULT_TOLERANCE_PP, "2026-11-06");
    const fs: CoverageFs = {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(generated),
    };

    const loaded = loadBudgetBaseline("/baseline.json", fs);

    expect(loaded.generatedAt).toBe("2026-11-06");
    expect(loaded.tolerance).toBe(DEFAULT_TOLERANCE_PP);
    expect(loaded.areas.hooks.percent).toBe(80);
    expect(loaded.total.percent).toBe(80);
  });

  it("rejects a baseline without the required fields", () => {
    const fs: CoverageFs = { existsSync: () => true, readFileSync: () => JSON.stringify({}) };

    expect(() => loadBudgetBaseline("/baseline.json", fs)).toThrow(/Invalid coverage baseline/);
  });
});
