/**
 * @file tests/unit/scripts/check-advisories-cli.test.ts
 * @description Human/JSON output contract of the advisory ledger gate
 * (`scripts/security/check-advisories.ts`). The existing `advisory-ledger.test.ts`
 * covers the schema and the latency maths; this file pins the CLI surface those
 * tests cannot see: flag parsing (a typo must be a usage error, not a silent
 * default), the status column, and the exact `--json` key set — including the
 * `slabreaches` spelling downstream tooling already reads.
 */

import { describe, expect, it } from "vitest";

import {
  buildLedgerReport,
  parseAdvisoryCliFlags,
  renderAdvisoryRecordTable,
} from "../../../scripts/security/check-advisories";
import {
  computeLatencyStats,
  type AdvisoryRecord,
} from "../../../scripts/security/advisory-ledger";

const DAY_MS = 86_400_000;
const BASE_MS = Date.parse("2026-01-02T09:00:00Z");
const NOW = new Date(BASE_MS + 400 * DAY_MS);

function isoAtDays(days: number): string {
  return new Date(BASE_MS + days * DAY_MS).toISOString().replace(/\.000Z$/, "Z");
}

/** A complete released record; override one field per test. */
function record(overrides: Partial<AdvisoryRecord> = {}): AdvisoryRecord {
  return {
    schema_version: "1.0",
    id: "SC-2026-101",
    title: "Test advisory record",
    summary: "A test advisory summary that is comfortably long enough.",
    severity: "high",
    cvss: { score: 8.1, vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N" },
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

function openRecord(daysOpen: number, overrides: Partial<AdvisoryRecord> = {}): AdvisoryRecord {
  return record({
    state: "triaged",
    received_at: isoAtDays(400 - daysOpen),
    released_at: undefined,
    published_at: undefined,
    osv_id: undefined,
    cve_id: undefined,
    fixed_version: undefined,
    ...overrides,
  });
}

/** The table row for `id`, with the formatter's trailing padding trimmed. */
function rowFor(table: string, id: string): string {
  const row = table.split("\n").find((line) => line.startsWith(id));
  if (!row) throw new Error(`no row for ${id} in:\n${table}`);
  return row;
}

describe("flag parsing", () => {
  it("defaults every flag off", () => {
    expect(parseAdvisoryCliFlags([])).toEqual({
      json: false,
      failOnBreach: false,
      writeDoc: false,
      help: false,
    });
  });

  it("accepts the documented flags", () => {
    expect(parseAdvisoryCliFlags(["--json", "--fail-on-breach", "--write-doc", "-h"])).toEqual({
      json: true,
      failOnBreach: true,
      writeDoc: true,
      help: true,
    });
  });

  it("rejects an unknown flag instead of ignoring it", () => {
    expect(() => parseAdvisoryCliFlags(["--fail-on-breach", "--fial-on-breach"])).toThrow(
      /Unknown argument "--fial-on-breach"/,
    );
  });
});

describe("record status table", () => {
  it("marks a release inside its SLA as within SLA", () => {
    const released = record();
    const stats = computeLatencyStats([released], NOW);
    const table = renderAdvisoryRecordTable([released], stats);

    expect(rowFor(table, "SC-2026-101")).toMatch(/10\.0\s+30\s+within SLA$/);
  });

  it("marks a release past its SLA", () => {
    const late = record({ released_at: isoAtDays(31) });
    const stats = computeLatencyStats([late], NOW);
    const table = renderAdvisoryRecordTable([late], stats);

    expect(rowFor(table, "SC-2026-101")).toMatch(/31\.0\s+30\s+SLA EXCEEDED$/);
  });

  it("marks an open record past its SLA", () => {
    const open = openRecord(100, { severity: "medium" });
    const stats = computeLatencyStats([open], NOW);
    const table = renderAdvisoryRecordTable([open], stats);

    expect(rowFor(table, "SC-2026-101")).toMatch(/—\s+90\s+SLA EXCEEDED$/);
  });

  it("keeps example records out of the SLA verdict", () => {
    const example = record({
      provenance: "example",
      released_at: isoAtDays(365),
      title: "[EXAMPLE] slow sample",
    });
    const stats = computeLatencyStats([example], NOW);
    const table = renderAdvisoryRecordTable([example], stats);

    expect(rowFor(table, "SC-2026-101")).toMatch(/example \(excluded\)$/);
    expect(stats.breached).toEqual([]);
  });

  it("always prints the header row", () => {
    const released = record();
    const table = renderAdvisoryRecordTable([released], computeLatencyStats([released], NOW));

    expect(table.split("\n")[0]).toMatch(/^ID\s+SEVERITY\s+STATE\s+LATENCY\s+SLA\s+STATUS$/);
  });
});

describe("--json report", () => {
  it("keeps the documented key set", () => {
    const released = record();
    const stats = computeLatencyStats([released], NOW);
    const report = buildLedgerReport([released], stats, []);

    expect(Object.keys(report).sort()).toEqual([
      "advisories",
      "errors",
      "examples",
      "ok",
      "slabreaches",
      "stats",
    ]);
    expect(report.ok).toBe(true);
    expect(report.slabreaches).toEqual([]);
    expect(report.advisories).toEqual([released]);
  });

  it("lists example ids separately and reports failures", () => {
    const published = record({ id: "SC-2026-201" });
    const example = record({
      id: "SC-2026-202",
      provenance: "example",
      title: "[EXAMPLE] slow sample",
      released_at: isoAtDays(60),
    });
    const stats = computeLatencyStats([published, example], NOW);
    const report = buildLedgerReport([published, example], stats, ["SC-2026-202: bad field"]);

    expect(report.ok).toBe(false);
    expect(report.examples).toEqual(["SC-2026-202"]);
    expect(report.errors).toEqual(["SC-2026-202: bad field"]);
    expect(report.slabreaches).toEqual([]);
  });

  it("surfaces a released SLA breach in `slabreaches`", () => {
    const late = record({ released_at: isoAtDays(31) });
    const stats = computeLatencyStats([late], NOW);
    const report = buildLedgerReport([late], stats, []);

    expect(report.ok).toBe(true);
    expect(report.slabreaches).toEqual([
      { id: "SC-2026-101", severity: "high", kind: "released", days: 31, slaDays: 30 },
    ]);
  });
});
