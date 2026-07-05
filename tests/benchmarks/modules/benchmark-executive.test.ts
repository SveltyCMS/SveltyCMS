/**
 * @file tests/benchmarks/modules/benchmark-executive.test.ts
 * @description Unit tests for progressive-disclosure executive report builders.
 */
import { describe, expect, it } from "vitest";
import {
  buildCollapsedLedgerTagInner,
  buildDimensionRollupTable,
  buildExecutiveReport,
  buildIssuesTable,
  buildQuadrantChart,
  isSpecificInsight,
  trendArrow,
  type TestRollupEntry,
} from "./benchmark-executive";

const sampleEntry = (overrides: Partial<TestRollupEntry> = {}): TestRollupEntry => ({
  tag: "API_LATENCY",
  label: "API LAYER LATENCY",
  shortLabel: "API Latency",
  path: "tests/benchmarks/api-latency.test.ts",
  section: "api",
  avgMs: 2.5,
  baselineMs: 1.2,
  deltaPct: 108,
  severity: "regression",
  icon: "\u{1F534}",
  trendLabel: "+108%",
  likelyCause: "src/hooks.server.ts",
  budgetLabel: "< 5ms",
  codePaths: ["src/hooks.server.ts"],
  expected: "NO \u2014 investigate",
  owner: "@backend",
  ...overrides,
});

describe("benchmark-executive", () => {
  it("trendArrow maps deltas to arrows", () => {
    expect(trendArrow(10)).toBe("\u2197\uFE0F");
    expect(trendArrow(-10)).toBe("\u2198\uFE0F");
    expect(trendArrow(1)).toBe("\u27A1\uFE0F");
  });

  it("isSpecificInsight rejects generic SWOT boilerplate", () => {
    expect(isSpecificInsight("Within normal variance — no action needed.")).toBe(false);
    expect(
      isSpecificInsight("Auth pipeline degraded because `__turboAuth` skip was removed."),
    ).toBe(true);
  });

  it("buildCollapsedLedgerTagInner emits details/summary wrapper", () => {
    const block = buildCollapsedLedgerTagInner({
      tag: "API_LATENCY",
      label: "API Latency",
      testPath: "tests/benchmarks/api-latency.test.ts",
      avgMs: 2.5,
      icon: "\u{1F534}",
      deltaPct: 12,
      trendLabel: "+12%",
      truth: "```text\nTABLE\n```",
    });
    expect(block).toContain('<details id="section-api_latency">');
    expect(block).toContain("</details>");
    expect(block).toContain("```text");
    expect(block).not.toContain("### \u{1F3F7}");
  });

  it("buildIssuesTable lists only regressions with drill-down links", () => {
    const table = buildIssuesTable([
      sampleEntry(),
      sampleEntry({ severity: "stable", icon: "\u{1F7E2}", deltaPct: 1 }),
    ]);
    expect(table).toContain("API LAYER LATENCY");
    expect(table).toContain("[\u2193](#section-api_latency)");
    expect(table).toContain("NO \u2014 investigate");
  });

  it("buildQuadrantChart emits mermaid quadrant for regressions", () => {
    const chart = buildQuadrantChart([
      sampleEntry(),
      sampleEntry({ severity: "stable", deltaPct: 1, avgMs: 1 }),
    ]);
    expect(chart).toContain("quadrantChart");
    expect(chart).toContain("<details>");
  });

  it("buildExecutiveReport assembles pass badge and dimension rollup", () => {
    const body = buildExecutiveReport({
      dbLabel: "SQLite",
      timestamp: "2026-07-04",
      status: "SUCCESS",
      recorded: 48,
      total: 50,
      skipped: 2,
      hostLine: "Bun 1.3.14",
      latencyRows: [],
      testEntries: [sampleEntry()],
      mermaidPoints: [1, 2, 3],
    });
    expect(body).toContain("\u2705 PASS");
    expect(body).toContain("Dimension health");
    expect(buildQuadrantChart([sampleEntry()])).toContain("quadrantChart");
    expect(buildDimensionRollupTable([sampleEntry()])).toContain("**API**");
  });
});
