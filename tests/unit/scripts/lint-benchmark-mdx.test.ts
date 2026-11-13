/**
 * @file tests/unit/scripts/lint-benchmark-mdx.test.ts
 * @description Structural contract for the machine-written benchmark ledgers in
 * `docs/project/benchmarks/`. Pins each rule of
 * `findBenchmarkMdxViolations()` — zone markers, sub-marker pairs, ledger table
 * tags and `<details>` balance — plus the failure modes the writers actually
 * suffered from: a missing `_TABLE_END` (the next run appends instead of
 * replacing), a duplicated zone marker and an unclosed `<details>` that swallows
 * every later section.
 */

import { describe, expect, it } from "vitest";

import {
  findBenchmarkMdxViolations,
  type BenchmarkMdxViolation,
} from "../../../scripts/lint/lint-benchmark-mdx";

/** A complete report that satisfies every rule (BENCHMARK wraps the content zones). */
const CLEAN_REPORT = [
  "# Benchmark — sqlite",
  "",
  "<!-- BENCHMARK_START -->",
  "<!-- EXECUTIVE_START -->",
  "## Executive",
  "<!-- EXECUTIVE_FIX_NOTES_START -->",
  "notes",
  "<!-- EXECUTIVE_FIX_NOTES_END -->",
  "<!-- EXECUTIVE_ALERTS_START -->",
  "none",
  "<!-- EXECUTIVE_ALERTS_END -->",
  "<!-- EXECUTIVE_END -->",
  "",
  "<!-- SUMMARY_START -->",
  "<!-- SUMMARY_RUN_OVERLAY_START -->",
  "overlay",
  "<!-- SUMMARY_RUN_OVERLAY_END -->",
  "<!-- SUMMARY_HISTORY_START -->",
  "history",
  "<!-- SUMMARY_HISTORY_END -->",
  "<!-- SUMMARY_END -->",
  "",
  "<!-- LEDGER_START -->",
  "<!-- LEDGER_TREND_HEADING -->",
  "trend",
  "<!-- LEDGER_INSIGHT_START -->",
  "insight",
  "<!-- LEDGER_INSIGHT_END -->",
  "<!-- LEDGER_TRUTH_START -->",
  "truth",
  "<!-- LEDGER_TRUTH_END -->",
  "<!-- LEDGER_RUN_SUMMARY_START -->",
  "run",
  "<!-- LEDGER_RUN_SUMMARY_END -->",
  "",
  "<details>",
  "<summary>content-scan</summary>",
  "",
  "<!-- SECTION:content_scan:START -->",
  "table",
  "<!-- SECTION:content_scan:END -->",
  "",
  "</details>",
  "<!-- LEDGER_END -->",
  "",
  "<!-- EDUCATIONAL_START -->",
  "<!-- EDUCATIONAL_END -->",
  "<!-- CHANGELOG_START -->",
  "<!-- CHANGELOG_END -->",
  "<!-- METADATA_START -->",
  "<!-- METADATA_END -->",
  "<!-- BENCHMARK_END -->",
  "",
].join("\n");

const FILE = "benchmark_sqlite.mdx";

function lint(content: string, file = FILE): BenchmarkMdxViolation[] {
  return findBenchmarkMdxViolations([{ file, content }]);
}

function rules(violations: readonly BenchmarkMdxViolation[]): string[] {
  return violations.map((violation) => violation.rule);
}

describe("clean reports", () => {
  it("reports nothing for a complete report", () => {
    expect(lint(CLEAN_REPORT)).toEqual([]);
  });

  it("accepts a document with no generated zones at all", () => {
    expect(lint("# Draft report\n\n<details>\n<summary>x</summary>\n</details>\n")).toEqual([]);
  });
});

describe("zone markers", () => {
  it("flags a duplicated zone START", () => {
    const doc = CLEAN_REPORT.replace(
      "<!-- LEDGER_START -->",
      "<!-- LEDGER_START -->\n<!-- LEDGER_START -->",
    );

    const violations = lint(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: FILE, rule: "zone-marker-unbalanced" });
    expect(violations[0].detail).toContain("ledger: 2×");
  });

  it("flags a zone whose END precedes its START", () => {
    const doc = "<!-- LEDGER_END -->\n<!-- LEDGER_START -->";

    const violations = lint(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("zone-marker-order");
    expect(violations[0].detail).toContain("END appears before START");
  });

  it("flags content zones out of canonical order", () => {
    const doc = [
      "<!-- SUMMARY_START -->",
      "<!-- SUMMARY_END -->",
      "<!-- EXECUTIVE_START -->",
      "<!-- EXECUTIVE_END -->",
    ].join("\n");

    const violations = lint(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain("summary → executive");
    expect(violations[0].detail).toContain("executive → summary");
  });

  it("requires content zones to stay inside the BENCHMARK wrapper", () => {
    const doc = [
      "<!-- EXECUTIVE_START -->",
      "<!-- EXECUTIVE_END -->",
      "<!-- BENCHMARK_START -->",
      "<!-- SUMMARY_START -->",
      "<!-- SUMMARY_END -->",
      "<!-- BENCHMARK_END -->",
    ].join("\n");

    const violations = lint(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("zone-marker-order");
    expect(violations[0].detail).toBe('"executive" must be nested inside BENCHMARK');
  });
});

describe("ledger table tags", () => {
  it("flags a START without its END (the append-instead-of-replace bug)", () => {
    const doc = [
      "<!-- LEDGER_START -->",
      "<!-- content_scan_TABLE_START -->",
      "<!-- LEDGER_END -->",
    ].join("\n");

    const violations = lint(doc);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("ledger-tag-unbalanced");
    expect(violations[0].detail).toContain("content_scan");
    expect(violations[0].detail).toContain("a writer will append instead of replace");
  });

  it("flags an END without a START", () => {
    const doc = [
      "<!-- LEDGER_START -->",
      "<!-- content_scan_TABLE_END -->",
      "<!-- LEDGER_END -->",
    ].join("\n");

    expect(rules(lint(doc))).toEqual(["ledger-tag-orphan"]);
  });

  it("flags a duplicate table tag", () => {
    const doc = [
      "<!-- LEDGER_START -->",
      "<!-- SECTION:content_scan:START -->",
      "<!-- SECTION:content_scan:START -->",
      "<!-- SECTION:content_scan:END -->",
      "<!-- LEDGER_END -->",
    ].join("\n");

    expect(rules(lint(doc))).toEqual(["ledger-tag-duplicate", "ledger-tag-unbalanced"]);
  });
});

describe("details balance", () => {
  it("flags an unclosed <details> inside the LEDGER zone", () => {
    const doc = [
      "<!-- LEDGER_START -->",
      "<details>",
      "<summary>x</summary>",
      "<!-- LEDGER_END -->",
    ].join("\n");

    const violations = lint(doc);
    expect(violations.some((violation) => violation.detail.includes("LEDGER zone"))).toBe(true);
  });

  it("flags an unclosed <details> anywhere else", () => {
    const violations = lint("<details>\n<summary>x</summary>\n");

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "details-unbalanced" });
    expect(violations[0].detail).toBe("1× <details> vs 0× </details>");
  });

  it("does not let a balanced pair elsewhere hide the ledger imbalance", () => {
    const doc = [
      "<!-- EXECUTIVE_START -->",
      "<details></details>",
      "<!-- EXECUTIVE_END -->",
      "<!-- LEDGER_START -->",
      "<details>",
      "<!-- LEDGER_END -->",
    ].join("\n");

    const detailsViolations = lint(doc).filter(
      (violation) => violation.rule === "details-unbalanced",
    );
    expect(detailsViolations.map((violation) => violation.detail)).toEqual([
      "LEDGER zone: 1× <details> vs 0× </details>",
      "2× <details> vs 1× </details>",
    ]);
  });
});

describe("multi-file and IO handling", () => {
  it("attributes every violation to its own report", () => {
    const violations = findBenchmarkMdxViolations([
      { file: "benchmark_sqlite.mdx", content: CLEAN_REPORT },
      { file: "benchmark_mongodb.mdx", content: "<details>" },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("benchmark_mongodb.mdx");
  });

  it("turns an unreadable report into a read-failed violation", () => {
    const violations = findBenchmarkMdxViolations([
      { file: "benchmark_postgresql.mdx", content: null, readError: "EACCES: permission denied" },
    ]);

    expect(violations).toEqual([
      {
        file: "benchmark_postgresql.mdx",
        rule: "read-failed",
        detail: "EACCES: permission denied",
      },
    ]);
  });
});
