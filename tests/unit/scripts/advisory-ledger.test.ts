/**
 * @file tests/unit/scripts/advisory-ledger.test.ts
 * @description Unit tests for the advisory ledger model and its CLI helpers:
 * schema parsing, semantic rules, nearest-rank latency statistics, SLA breach
 * detection, and the formatter-stable Markdown rendering used by
 * `docs/reference/security/patch-latency.mdx`.
 */

import { describe, it, expect } from "vitest";
import {
  type AdvisoryRecord,
  computeLatencyStats,
  latencyDays,
  openAgeDays,
  parseAdvisoryRecord,
  renderMarkdownTable,
  validateAdvisoryRecord,
} from "../../../scripts/security/advisory-ledger";
import {
  findDuplicateIds,
  findSlaBreaches,
  renderGeneratedBlock,
  replaceGeneratedBlock,
} from "../../../scripts/security/check-advisories";

const DAY_MS = 86_400_000;
const BASE_MS = Date.parse("2026-01-02T09:00:00Z");

/** ISO 8601 timestamps at a fixed offset from the fixture epoch. */
function isoAtDays(days: number): string {
  return new Date(BASE_MS + days * DAY_MS).toISOString().replace(/\.000Z$/, "Z");
}

/** A complete, valid released record; override one field per test. */
function makeRecord(overrides: Partial<AdvisoryRecord> = {}): AdvisoryRecord {
  return {
    schema_version: "1.0",
    id: "SC-2026-101",
    title: "Test advisory record",
    summary: "A test advisory summary that is comfortably long enough.",
    severity: "high",
    cvss: {
      score: 8.1,
      vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N",
    },
    state: "released",
    provenance: "published",
    received_at: isoAtDays(0),
    triaged_at: isoAtDays(1),
    patched_at: isoAtDays(5),
    released_at: isoAtDays(10),
    published_at: isoAtDays(11),
    osv_id: "GHSA-aaaa-bbbb-cccc",
    cve_id: "CVE-2026-12345",
    fixed_version: "2.1.4",
    affected_versions: ["1.9.0 - 2.1.4"],
    regression_tests: ["tests/unit/security/egress-guard.test.ts"],
    references: ["https://github.com/SveltyCMS/SveltyCMS/security/advisories"],
    ...overrides,
  };
}

/** A released record whose received → released distance is exactly `days`. */
function releasedIn(days: number, overrides: Partial<AdvisoryRecord> = {}): AdvisoryRecord {
  return makeRecord({
    received_at: isoAtDays(0),
    triaged_at: isoAtDays(0),
    patched_at: isoAtDays(0),
    released_at: isoAtDays(days),
    published_at: isoAtDays(days),
    ...overrides,
  });
}

function withoutKey(key: keyof AdvisoryRecord): Record<string, unknown> {
  const record: Record<string, unknown> = { ...makeRecord() };
  delete record[key];
  return record;
}

describe("parseAdvisoryRecord", () => {
  it("accepts a released record and keeps every field", () => {
    const record = makeRecord();
    expect(parseAdvisoryRecord(record)).toEqual(record);
  });

  it("names the failing path for a malformed nested value", () => {
    const broken = { ...makeRecord(), cvss: { score: 8.1, vector: "not-a-vector" } };
    expect(() => parseAdvisoryRecord(broken)).toThrow(/cvss\.vector/);
  });

  it("names a malformed array element", () => {
    const broken = { ...makeRecord(), regression_tests: [""] };
    expect(() => parseAdvisoryRecord(broken)).toThrow(/regression_tests\[0\]/);
  });

  it("rejects a missing required field and an unknown key", () => {
    expect(() => parseAdvisoryRecord(withoutKey("title"))).toThrow(/title/);
    expect(() => parseAdvisoryRecord({ ...makeRecord(), retracted: true })).toThrow(/retracted/);
  });

  it("defaults provenance to published when the field is omitted", () => {
    const record = withoutKey("provenance");
    expect(parseAdvisoryRecord(record).provenance).toBe("published");
  });

  it("rejects an unknown provenance", () => {
    expect(() => parseAdvisoryRecord({ ...makeRecord(), provenance: "draft" })).toThrow(
      /provenance/,
    );
  });
});

describe("validateAdvisoryRecord", () => {
  it("returns no problems for a complete released record", () => {
    expect(validateAdvisoryRecord(makeRecord())).toEqual([]);
  });

  it("requires osv_id and a regression test once released", () => {
    const problems = validateAdvisoryRecord(
      makeRecord({ osv_id: undefined, regression_tests: [] }),
    );
    expect(problems.some((problem) => problem.includes("osv_id"))).toBe(true);
    expect(problems.some((problem) => problem.includes("regression_tests"))).toBe(true);
  });

  it("requires cve_id when a critical or high advisory is released", () => {
    for (const severity of ["critical", "high"] as const) {
      const problems = validateAdvisoryRecord(
        makeRecord({ severity, cve_id: undefined, cvss: { score: 9.8, vector: "CVSS:3.1/AV:N" } }),
      );
      expect(problems.some((problem) => problem.includes("cve_id"))).toBe(true);
    }
  });

  it("does not demand a CVE for a released medium advisory", () => {
    const problems = validateAdvisoryRecord(
      makeRecord({
        severity: "medium",
        cve_id: undefined,
        cvss: { score: 5.3, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N" },
      }),
    );
    expect(problems).toEqual([]);
  });

  it("requires triaged_at in the triaged state", () => {
    const problems = validateAdvisoryRecord(
      makeRecord({ state: "triaged", triaged_at: undefined }),
    );
    expect(problems.some((problem) => problem.includes("triaged_at"))).toBe(true);
  });

  it("requires patched_at and a regression test in the patched state", () => {
    const problems = validateAdvisoryRecord(
      makeRecord({
        state: "patched",
        patched_at: undefined,
        released_at: undefined,
        published_at: undefined,
        osv_id: undefined,
        cve_id: undefined,
        fixed_version: undefined,
        regression_tests: [],
      }),
    );
    expect(problems.some((problem) => problem.includes("patched_at"))).toBe(true);
    expect(problems.some((problem) => problem.includes("regression_tests"))).toBe(true);
  });

  it("rejects a timeline that runs backwards", () => {
    const publishedBeforeRelease = validateAdvisoryRecord(
      makeRecord({ published_at: isoAtDays(9) }),
    );
    expect(publishedBeforeRelease.some((problem) => problem.includes("published_at"))).toBe(true);

    const patchedBeforeTriage = validateAdvisoryRecord(makeRecord({ patched_at: isoAtDays(0.5) }));
    expect(patchedBeforeTriage.some((problem) => problem.includes("patched_at"))).toBe(true);
  });

  it("rejects a CVSS score outside the severity band", () => {
    const cases = [
      { severity: "critical" as const, score: 7.5, band: "critical" },
      { severity: "high" as const, score: 9.8, band: "high" },
      { severity: "medium" as const, score: 7.5, band: "medium" },
      { severity: "low" as const, score: 4.0, band: "low" },
    ];
    for (const { severity, score, band } of cases) {
      const problems = validateAdvisoryRecord(
        makeRecord({ severity, cvss: { score, vector: "CVSS:3.1/AV:N" } }),
      );
      expect(problems.some((problem) => problem.includes(`outside the ${band} band`))).toBe(true);
    }
  });

  it("accepts the inclusive edges of every band", () => {
    const edges: Array<[AdvisoryRecord["severity"], number]> = [
      ["critical", 9.0],
      ["critical", 10],
      ["high", 7.0],
      ["high", 8.9],
      ["medium", 4.0],
      ["medium", 6.9],
      ["low", 0.1],
      ["low", 3.9],
    ];
    for (const [severity, score] of edges) {
      const problems = validateAdvisoryRecord(
        makeRecord({ severity, cvss: { score, vector: "CVSS:3.1/AV:N" } }),
      );
      expect(problems).toEqual([]);
    }
  });
});

describe("latencyDays / openAgeDays", () => {
  it("returns null until the advisory is released", () => {
    expect(latencyDays(makeRecord({ state: "triaged", released_at: undefined }))).toBeNull();
  });

  it("measures received → released in days, rounded to one decimal", () => {
    expect(latencyDays(releasedIn(10))).toBe(10);
    expect(latencyDays(makeRecord({ received_at: isoAtDays(0), released_at: isoAtDays(0) }))).toBe(
      0,
    );
    expect(
      latencyDays(
        makeRecord({
          received_at: "2026-01-02T09:00:00Z",
          released_at: "2026-01-02T21:00:00Z",
        }),
      ),
    ).toBe(0.5);
  });

  it("counts open age and never goes negative", () => {
    const open = makeRecord({ state: "triaged", released_at: undefined });
    expect(openAgeDays(open, isoAtDays(100))).toBe(100);
    expect(openAgeDays(open, isoAtDays(-5))).toBe(0);
    expect(openAgeDays(open, "2026-01-03T09:00:00Z")).toBe(1);
  });
});

describe("computeLatencyStats", () => {
  it("uses the nearest rank for median and p95 over an odd count", () => {
    const records = [releasedIn(9), releasedIn(10), releasedIn(20)];
    const stats = computeLatencyStats(records, isoAtDays(30));
    expect(stats.bySeverity.high).toEqual({
      count: 3,
      released: 3,
      medianDays: 10,
      p95Days: 20,
    });
  });

  it("takes the lower middle value for an even count", () => {
    const records = [releasedIn(10), releasedIn(12), releasedIn(14), releasedIn(20)];
    const stats = computeLatencyStats(records, isoAtDays(30));
    expect(stats.bySeverity.high.medianDays).toBe(12);
    expect(stats.bySeverity.high.p95Days).toBe(20);
  });

  it("handles a single release and empty severities", () => {
    const stats = computeLatencyStats([releasedIn(7)], isoAtDays(30));
    expect(stats.bySeverity.high).toEqual({
      count: 1,
      released: 1,
      medianDays: 7,
      p95Days: 7,
    });
    expect(stats.bySeverity.critical).toEqual({
      count: 0,
      released: 0,
      medianDays: null,
      p95Days: null,
    });
  });

  it("flags a release past its SLA but not one exactly on it", () => {
    const onTime = releasedIn(30, { id: "SC-2026-201" });
    const late = releasedIn(30.1, { id: "SC-2026-202" });
    const stats = computeLatencyStats([onTime, late], isoAtDays(60));
    expect(stats.breached).toEqual([
      { id: "SC-2026-202", severity: "high", days: 30.1, slaDays: 30 },
    ]);
    expect(findSlaBreaches(stats)).toEqual([
      { id: "SC-2026-202", severity: "high", kind: "released", days: 30.1, slaDays: 30 },
    ]);
  });

  it("lists open advisories with their age and SLA", () => {
    const open = makeRecord({
      id: "SC-2026-301",
      severity: "medium",
      state: "triaged",
      released_at: undefined,
      published_at: undefined,
      osv_id: undefined,
      cve_id: undefined,
      fixed_version: undefined,
      received_at: isoAtDays(0),
    });
    const stats = computeLatencyStats([open], isoAtDays(100));
    expect(stats.open).toEqual([
      { id: "SC-2026-301", severity: "medium", ageDays: 100, slaDays: 90 },
    ]);
    expect(stats.bySeverity.medium.released).toBe(0);
    expect(findSlaBreaches(stats)).toEqual([
      { id: "SC-2026-301", severity: "medium", kind: "open", days: 100, slaDays: 90 },
    ]);
  });

  it("keeps an open advisory inside its SLA out of the breach list", () => {
    const open = makeRecord({
      id: "SC-2026-302",
      severity: "low",
      state: "received",
      released_at: undefined,
      published_at: undefined,
      osv_id: undefined,
      cve_id: undefined,
      fixed_version: undefined,
    });
    const stats = computeLatencyStats([open], isoAtDays(10));
    expect(stats.open[0]?.ageDays).toBe(10);
    expect(findSlaBreaches(stats)).toEqual([]);
  });

  it("excludes example records from every statistic", () => {
    const real = releasedIn(10, { id: "SC-2026-401" });
    const example = releasedIn(365, {
      id: "SC-2026-402",
      provenance: "example",
      title: "[EXAMPLE] slow sample",
    });
    const stats = computeLatencyStats([real, example], isoAtDays(400));

    expect(stats.examplesExcluded).toBe(1);
    expect(stats.bySeverity.high).toEqual({
      count: 1,
      released: 1,
      medianDays: 10,
      p95Days: 10,
    });
    expect(stats.breached).toEqual([]);
    expect(findSlaBreaches(stats)).toEqual([]);
  });
});

describe("renderMarkdownTable", () => {
  it("is byte-identical across calls and follows the severity order", () => {
    const stats = computeLatencyStats([releasedIn(10), releasedIn(12)], isoAtDays(30));
    const table = renderMarkdownTable(stats);
    expect(renderMarkdownTable(stats)).toBe(table);
    expect(table.split("\n")[0]).toBe(
      "| Severity | SLA (days) | Records | Released | Median latency (days) | P95 latency (days) |",
    );
    expect(table).toContain(
      "| high     |         30 |       2 |        2 |                  10.0 |               12.0 |",
    );
    expect(table).toContain(
      "| critical |          7 |       0 |        0 |                     — |                  — |",
    );
    expect(table.split("\n")).toHaveLength(6);
  });
});

describe("ledger CLI helpers", () => {
  it("finds duplicate advisory ids", () => {
    const first = makeRecord({ id: "SC-2026-001" });
    const second = makeRecord({ id: "SC-2026-002" });
    expect(findDuplicateIds([first, second, { ...first }])).toEqual(["SC-2026-001"]);
    expect(findDuplicateIds([first, second])).toEqual([]);
  });

  it("wraps the table in the generated-block markers", () => {
    const stats = computeLatencyStats([releasedIn(10)], isoAtDays(30));
    const block = renderGeneratedBlock(stats);
    expect(block.startsWith("<!-- BEGIN GENERATED:patch-latency -->")).toBe(true);
    expect(block.endsWith("<!-- END GENERATED:patch-latency -->")).toBe(true);
    expect(block).toContain(renderMarkdownTable(stats));
  });

  it("replaces only the marked region and rejects a doc without markers", () => {
    const before =
      "# Title\n\n<!-- BEGIN GENERATED:patch-latency -->\nold\n<!-- END GENERATED:patch-latency -->\n\nfooter\n";
    const updated = replaceGeneratedBlock(before, "NEW");
    expect(updated).toBe("# Title\n\nNEW\n\nfooter\n");
    expect(replaceGeneratedBlock("# Title\n\nno markers\n", "NEW")).toBeNull();
  });
});
