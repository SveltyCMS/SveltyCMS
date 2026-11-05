/**
 * @file scripts/security/advisory-ledger.ts
 * @description
 * Zero-I/O model for the security advisory ledger: the Valibot schema that
 * every `docs/security/advisories/*.json` record must satisfy, the semantic
 * rules a schema cannot express (state ↔ timestamp implications, CVSS /
 * severity agreement, monotonic timeline), and the release-latency maths that
 * both `check-advisories.ts` and the generated `patch-latency` table share.
 *
 * ### Features:
 * - `AdvisoryRecord` Valibot schema + inferred type (SC-YYYY-NNN ids, ISO 8601 timestamps)
 * - `parseAdvisoryRecord` with a readable failing path (`cvss.score`, `regression_tests[0]`)
 * - Semantic validation: timeline order, stage requirements, CVE rule, CVSS band
 * - Nearest-rank median / p95 over release latency (no interpolation, 1 decimal)
 * - SLA breaches for released records and open-age tracking for everything else
 * - Markdown rendering that matches the repo formatter's table padding
 *
 * The module is deliberately free of filesystem, network, and clock access:
 * callers pass `now`, so every result is reproducible and unit-testable.
 */

import * as v from "valibot";

/** Days from `received_at` to release that each severity may take. */
export const SEVERITY_SLA_DAYS = {
  critical: 7,
  high: 30,
  medium: 90,
  low: 180,
} as const;

/** Stable iteration order — rendered tables and stat objects follow it. */
export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export type Severity = (typeof SEVERITIES)[number];

/** Ledger states in progression order. */
export const ADVISORY_STATES = ["received", "triaged", "patched", "released"] as const;

export type AdvisoryState = (typeof ADVISORY_STATES)[number];

export const ADVISORY_SCHEMA_VERSION = "1.0";

/**
 * `example` records exist to show the format; they are excluded from every
 * published statistic so a template can never inflate the latency table.
 * `published` is the default for records that omit the field.
 */
export const PROVENANCES = ["example", "published"] as const;

export type Provenance = (typeof PROVENANCES)[number];

const MS_PER_DAY = 86_400_000;

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ADVISORY_ID = /^SC-\d{4}-\d{3}$/;
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;
const OSV_ID = /^(?:GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|CVE-\d{4}-\d{4,})$/i;
const CVSS_VECTOR = /^CVSS:(?:3\.[01]|4\.0)\/[A-Z]{1,3}:[A-Za-z]+(?:\/[A-Z]{1,3}:[A-Za-z]+)+$/;

/** CVSS bands in tenths, so the comparison never depends on float equality. */
const CVSS_BAND_TENTHS: Record<Severity, readonly [number, number]> = {
  critical: [90, 100],
  high: [70, 89],
  medium: [40, 69],
  low: [1, 39],
};

function isoDateTime(field: string) {
  return v.pipe(
    v.string(),
    v.regex(
      ISO_DATE_TIME,
      `${field} must be an ISO 8601 date-time with an explicit zone (e.g. 2026-10-02T09:12:00Z)`,
    ),
  );
}

function isOneDecimalScore(score: number): boolean {
  return Math.abs(score * 10 - Math.round(score * 10)) < 1e-9;
}

/** The on-disk shape of one advisory record. Extra keys are rejected. */
export const advisoryRecordSchema = v.strictObject({
  schema_version: v.literal(ADVISORY_SCHEMA_VERSION),
  id: v.pipe(v.string(), v.regex(ADVISORY_ID, "id must match SC-YYYY-NNN (e.g. SC-2026-001)")),
  title: v.pipe(v.string(), v.minLength(5)),
  summary: v.pipe(v.string(), v.minLength(20)),
  severity: v.picklist(SEVERITIES),
  cvss: v.strictObject({
    score: v.pipe(
      v.number(),
      v.minValue(0),
      v.maxValue(10),
      v.check(isOneDecimalScore, "cvss.score must be a one-decimal CVSS value (e.g. 9.8)"),
    ),
    vector: v.pipe(
      v.string(),
      v.regex(CVSS_VECTOR, "cvss.vector must be a CVSS v3.0/v3.1/v4.0 vector string"),
    ),
  }),
  state: v.picklist(ADVISORY_STATES),
  provenance: v.optional(v.picklist(PROVENANCES), "published"),
  received_at: isoDateTime("received_at"),
  triaged_at: v.optional(isoDateTime("triaged_at")),
  patched_at: v.optional(isoDateTime("patched_at")),
  released_at: v.optional(isoDateTime("released_at")),
  published_at: v.optional(isoDateTime("published_at")),
  osv_id: v.optional(v.pipe(v.string(), v.regex(OSV_ID, "osv_id must be a GHSA or CVE id"))),
  cve_id: v.optional(v.pipe(v.string(), v.regex(CVE_ID, "cve_id must match CVE-YYYY-NNNN"))),
  fixed_version: v.optional(v.pipe(v.string(), v.minLength(1))),
  affected_versions: v.array(v.pipe(v.string(), v.minLength(1))),
  regression_tests: v.array(v.pipe(v.string(), v.minLength(1))),
  references: v.array(v.pipe(v.string(), v.minLength(1))),
  timeline_note: v.optional(v.pipe(v.string(), v.minLength(1))),
});

export type AdvisoryRecord = v.InferOutput<typeof advisoryRecordSchema>;

/** Render a Valibot issue path as `cvss.score` / `regression_tests[0]`. */
function formatIssuePath(issue: v.BaseIssue<unknown>): string {
  const path = issue.path ?? [];
  if (path.length === 0) return "(record)";
  return path
    .map((item) => (typeof item.key === "number" ? `[${item.key}]` : `.${item.key}`))
    .join("")
    .replace(/^\./, "");
}

/**
 * Parse one untrusted record (typically `JSON.parse` output).
 * @throws Error whose message lists every failing path and reason.
 */
export function parseAdvisoryRecord(input: unknown): AdvisoryRecord {
  const result = v.safeParse(advisoryRecordSchema, input);
  if (result.success) return result.output;
  const details = result.issues
    .map((issue) => `  - ${formatIssuePath(issue)}: ${issue.message}`)
    .join("\n");
  throw new Error(`Advisory record does not match schema v${ADVISORY_SCHEMA_VERSION}:\n${details}`);
}

/** Rules the schema cannot express. Returns an empty array for a sound record. */
export function validateAdvisoryRecord(record: AdvisoryRecord): string[] {
  const problems: string[] = [];

  // 1. The timeline may not travel backwards. Equal timestamps are allowed:
  //    same-day triage and patch are normal for a small fix.
  const timeline: Array<readonly [string, string | undefined]> = [
    ["received_at", record.received_at],
    ["triaged_at", record.triaged_at],
    ["patched_at", record.patched_at],
    ["released_at", record.released_at],
    ["published_at", record.published_at],
  ];
  let previous: { field: string; value: string; time: number } | null = null;
  for (const [field, value] of timeline) {
    if (value === undefined) continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) {
      problems.push(`${field} is not a parseable timestamp: "${value}"`);
      continue;
    }
    if (previous !== null && time < previous.time) {
      problems.push(
        `${field} (${value}) is earlier than ${previous.field} (${previous.value}) — the timeline must run received → triaged → patched → released → published`,
      );
    }
    previous = { field, value, time };
  }

  // 2. A state implies the fields that state cannot exist without.
  if (record.state === "triaged" && record.triaged_at === undefined) {
    problems.push('state "triaged" requires triaged_at');
  }

  if (record.state === "patched") {
    if (record.patched_at === undefined) problems.push('state "patched" requires patched_at');
    if (record.regression_tests.length === 0) {
      problems.push('state "patched" requires at least one entry in regression_tests');
    }
  }

  if (record.state === "released") {
    if (record.released_at === undefined) problems.push('state "released" requires released_at');
    if (record.published_at === undefined) problems.push('state "released" requires published_at');
    if (record.osv_id === undefined) problems.push('state "released" requires osv_id');
    if (record.fixed_version === undefined)
      problems.push('state "released" requires fixed_version');
    if (record.regression_tests.length === 0) {
      problems.push('state "released" requires at least one entry in regression_tests');
    }
    if (
      (record.severity === "critical" || record.severity === "high") &&
      record.cve_id === undefined
    ) {
      problems.push(
        `released ${record.severity} advisory requires cve_id — request one through the GitHub Security Advisory (GitHub is a CNA)`,
      );
    }
  }

  // 3. The CVSS score has to agree with the severity the record claims.
  const [minTenths, maxTenths] = CVSS_BAND_TENTHS[record.severity];
  const tenths = Math.round(record.cvss.score * 10);
  if (tenths < minTenths || tenths > maxTenths) {
    problems.push(
      `cvss.score ${record.cvss.score.toFixed(1)} is outside the ${record.severity} band (${(minTenths / 10).toFixed(1)}–${(maxTenths / 10).toFixed(1)})`,
    );
  }

  return problems;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Days from `received_at` to `released_at`, 1 decimal; `null` while unreleased. */
export function latencyDays(record: AdvisoryRecord): number | null {
  if (record.released_at === undefined) return null;
  const received = Date.parse(record.received_at);
  const released = Date.parse(record.released_at);
  if (Number.isNaN(received) || Number.isNaN(released)) return null;
  return roundToOneDecimal((released - received) / MS_PER_DAY);
}

/** Days from `received_at` to `now` for an unreleased advisory (never negative). */
export function openAgeDays(record: AdvisoryRecord, now: Date | string): number {
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  const received = Date.parse(record.received_at);
  if (Number.isNaN(nowMs) || Number.isNaN(received)) return 0;
  return Math.max(0, roundToOneDecimal((nowMs - received) / MS_PER_DAY));
}

export interface SeverityStats {
  count: number;
  released: number;
  medianDays: number | null;
  p95Days: number | null;
}

export interface LatencyBreach {
  id: string;
  severity: Severity;
  days: number;
  slaDays: number;
}

export interface OpenAdvisory {
  id: string;
  severity: Severity;
  ageDays: number;
  slaDays: number;
}

export interface LatencyStats {
  bySeverity: Record<Severity, SeverityStats>;
  /** Released records that took longer than their severity SLA. */
  breached: LatencyBreach[];
  /** Unreleased records, newest first; `ageDays > slaDays` means past SLA. */
  open: OpenAdvisory[];
  /** `provenance: "example"` records skipped by every aggregate above. */
  examplesExcluded: number;
}

/** Nearest-rank quantile over an ascending array (no interpolation). */
function nearestRank(ascending: readonly number[], percentile: number): number {
  const rank = Math.max(1, Math.ceil(percentile * ascending.length));
  return ascending[Math.min(ascending.length, rank) - 1] ?? 0;
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Deterministic aggregate used by the CLI summary and the generated doc table. */
export function computeLatencyStats(
  records: readonly AdvisoryRecord[],
  now: Date | string,
): LatencyStats {
  const bySeverity = {} as Record<Severity, SeverityStats>;
  const latencies = {} as Record<Severity, number[]>;
  for (const severity of SEVERITIES) {
    bySeverity[severity] = { count: 0, released: 0, medianDays: null, p95Days: null };
    latencies[severity] = [];
  }

  const breached: LatencyBreach[] = [];
  const open: OpenAdvisory[] = [];
  let examplesExcluded = 0;

  for (const record of records) {
    if (record.provenance === "example") {
      examplesExcluded += 1;
      continue;
    }
    const severity = record.severity;
    const slaDays = SEVERITY_SLA_DAYS[severity];
    bySeverity[severity].count += 1;

    const days = latencyDays(record);
    if (days !== null && record.state === "released") {
      bySeverity[severity].released += 1;
      latencies[severity].push(days);
      if (days > slaDays) breached.push({ id: record.id, severity, days, slaDays });
    } else {
      open.push({ id: record.id, severity, ageDays: openAgeDays(record, now), slaDays });
    }
  }

  for (const severity of SEVERITIES) {
    const values = [...latencies[severity]].sort((a, b) => a - b);
    if (values.length > 0) {
      bySeverity[severity].medianDays = nearestRank(values, 0.5);
      bySeverity[severity].p95Days = nearestRank(values, 0.95);
    }
  }

  breached.sort((a, b) => b.days - a.days || compareIds(a.id, b.id));
  open.sort((a, b) => b.ageDays - a.ageDays || compareIds(a.id, b.id));

  return { bySeverity, breached, open, examplesExcluded };
}

const TABLE_HEADER = [
  "Severity",
  "SLA (days)",
  "Records",
  "Released",
  "Median latency (days)",
  "P95 latency (days)",
] as const;

const TABLE_ALIGNMENTS = ["left", "right", "right", "right", "right", "right"] as const;

/**
 * Render a GFM table. Padding matches the repo formatter (column width is the
 * longest cell, floor 3, one space either side), so `--write-doc` output is
 * already format-clean.
 */
function renderTable(
  header: readonly string[],
  rows: readonly string[][],
  alignments: readonly ("left" | "right")[],
): string {
  const widths = header.map((cell, column) =>
    Math.max(3, cell.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const pad = (cell: string, column: number): string => {
    const width = widths[column] ?? 0;
    return alignments[column] === "right" ? cell.padStart(width, " ") : cell.padEnd(width, " ");
  };
  const separator = widths.map((width, column) =>
    alignments[column] === "right"
      ? `${"-".repeat(Math.max(0, width - 1))}:`
      : `:${"-".repeat(Math.max(0, width - 1))}`,
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => pad(cell, column)).join(" | ")} |`;

  return [line(header), line(separator), ...rows.map((row) => line(row))].join("\n");
}

function formatDays(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/**
 * The table emitted by the CLI summary and written into `patch-latency.mdx`.
 * Severity order is fixed, empty medians render as an em dash, and every number
 * has exactly one decimal — two runs over the same records are byte-identical.
 */
export function renderMarkdownTable(stats: LatencyStats): string {
  const rows = SEVERITIES.map((severity) => {
    const entry = stats.bySeverity[severity];
    return [
      severity,
      String(SEVERITY_SLA_DAYS[severity]),
      String(entry.count),
      String(entry.released),
      formatDays(entry.medianDays),
      formatDays(entry.p95Days),
    ];
  });
  return renderTable(TABLE_HEADER, rows, TABLE_ALIGNMENTS);
}
