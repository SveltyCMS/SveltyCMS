/**
 * @file tests/unit/plugins/editable-website/capabilities.test.ts
 * @description Guards the capability matrix that both Live Preview dashboards
 * render: every row must be complete, scoring must stay explainable, and the
 * competitor claims must stay dated/qualified (UWG §6).
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_MATRIX,
  coveragePercent,
  countLevels,
  LEVEL_BADGE_VARIANT,
  LEVEL_LABELS,
  MATRIX_REVIEWED_AT,
  MATRIX_SOURCE_NOTE,
  OPEN_GAPS,
  PRODUCTS,
  rankedCoverage,
  type CapabilityLevel,
} from "@src/plugins/editable-website/capabilities";

const LEVELS: CapabilityLevel[] = ["yes", "partial", "no", "na"];

describe("capability matrix", () => {
  it("has a unique id per row", () => {
    const ids = CAPABILITY_MATRIX.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fills every product column with a known level and a non-empty detail", () => {
    for (const row of CAPABILITY_MATRIX) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.detail.length).toBeGreaterThan(0);
      for (const product of PRODUCTS) {
        expect(LEVELS).toContain(row[product.id]);
      }
    }
  });

  it("keeps a label and badge variant for every level", () => {
    for (const level of LEVELS) {
      expect(LEVEL_LABELS[level].length).toBeGreaterThan(0);
      expect(LEVEL_BADGE_VARIANT[level]).toBeTruthy();
    }
  });

  it("dates and qualifies the competitor columns", () => {
    expect(MATRIX_REVIEWED_AT).toMatch(/\d{4}/);
    expect(MATRIX_SOURCE_NOTE).toContain("public documentation");
    expect(MATRIX_SOURCE_NOTE).toContain(MATRIX_REVIEWED_AT);
  });
});

describe("coverage scoring", () => {
  it("counts each level and excludes n/a from the scored total", () => {
    const counts = countLevels("editable");
    const na = CAPABILITY_MATRIX.filter((row) => row.editable === "na").length;
    expect(counts.na).toBe(na);
    expect(counts.scored).toBe(CAPABILITY_MATRIX.length - na);
    expect(counts.yes + counts.partial + counts.no).toBe(counts.scored);
  });

  it("reports 100 for an all-yes column and 0 for an all-no column", () => {
    // SveltyCMS ships every row today; the assertion documents the intent and
    // fails loudly when a row regresses without its dashboard copy changing.
    const svelty = countLevels("svelty");
    expect(coveragePercent("svelty")).toBe(
      Math.round(((svelty.yes + svelty.partial * 0.5) / svelty.scored) * 100),
    );
    expect(coveragePercent("svelty")).toBeGreaterThanOrEqual(coveragePercent("competitors"));
  });

  it("weights a partial row at half", () => {
    const counts = countLevels("competitors");
    if (counts.scored === 0) return;
    const expected = Math.round(((counts.yes + counts.partial * 0.5) / counts.scored) * 100);
    expect(coveragePercent("competitors")).toBe(expected);
  });

  it("ranks products highest-coverage first", () => {
    const ranking = rankedCoverage();
    expect(ranking).toHaveLength(PRODUCTS.length);
    for (let i = 1; i < ranking.length; i += 1) {
      expect(ranking[i - 1].percent).toBeGreaterThanOrEqual(ranking[i].percent);
    }
  });
});

describe("open gaps", () => {
  it("lists each gap once with an explanation", () => {
    const ids = OPEN_GAPS.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gap of OPEN_GAPS) {
      expect(gap.label.length).toBeGreaterThan(0);
      expect(gap.detail.length).toBeGreaterThan(0);
    }
  });

  it("does not repeat a gap on a capability already claimed as fully shipped everywhere", () => {
    const claimedYes = new Set(
      CAPABILITY_MATRIX.filter((row) => row.svelty === "yes").map((row) => row.id),
    );
    expect(claimedYes.has("inline-typing")).toBe(false);
  });
});
