#!/usr/bin/env bun
/**
 * @file scripts/security/check-advisories.ts
 * @description
 * Gatekeeper for the advisory ledger in `docs/security/advisories/`. Every
 * `*.json` file is parsed against the shared Valibot schema, checked against
 * the semantic rules in `advisory-ledger.ts`, and rejected on duplicate ids —
 * a ledger with two records for one advisory cannot be trusted to measure
 * anything.
 *
 * ### Features:
 * - Reads the directory deterministically (sorted) and validates every record
 * - `--json` — machine-readable report on stdout (records + stats + errors)
 * - `--fail-on-breach` — exit 1 when a released record exceeded its severity
 *   SLA or an open record is already past it
 * - `--write-doc` — rewrites the generated block in
 *   `docs/reference/security/patch-latency.mdx` between the patch-latency markers
 *
 * ### Usage
 *   bun run scripts/security/check-advisories.ts
 *   bun run scripts/security/check-advisories.ts --fail-on-breach --json
 *   bun run scripts/security/check-advisories.ts --write-doc
 *
 * Exit codes: 0 ok, 1 validation / SLA failure, 2 usage or I/O error.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AdvisoryRecord,
  type LatencyStats,
  type Severity,
  SEVERITY_SLA_DAYS,
  computeLatencyStats,
  latencyDays,
  parseAdvisoryRecord,
  renderMarkdownTable,
  validateAdvisoryRecord,
} from "./advisory-ledger";

const ADVISORIES_DIR = join("docs", "security", "advisories");
const PATCH_LATENCY_DOC = join("docs", "reference", "security", "patch-latency.mdx");

export const GENERATED_BLOCK_BEGIN = "<!-- BEGIN GENERATED:patch-latency -->";
export const GENERATED_BLOCK_END = "<!-- END GENERATED:patch-latency -->";

const USAGE = `Usage: bun run scripts/security/check-advisories.ts [options]

Options:
  --json             Print a machine-readable report (records + stats) to stdout
  --fail-on-breach   Exit 1 when a released record missed its SLA or an open one is past it
  --write-doc        Rewrite the generated block in docs/reference/security/patch-latency.mdx
  -h, --help         Show this message

Exit codes: 0 ok · 1 validation or SLA failure · 2 usage or I/O error`;

interface CliFlags {
  json: boolean;
  failOnBreach: boolean;
  writeDoc: boolean;
  help: boolean;
}

/** A bad flag is a usage error, not a ledger problem. */
class UsageError extends Error {}

/** Parse the CLI flags; throws `UsageError` on anything unknown. */
export function parseAdvisoryCliFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { json: false, failOnBreach: false, writeDoc: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case "--json":
        flags.json = true;
        break;
      case "--fail-on-breach":
        flags.failOnBreach = true;
        break;
      case "--write-doc":
        flags.writeDoc = true;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      default:
        throw new UsageError(`Unknown argument "${arg}".`);
    }
  }
  return flags;
}

/** Ids that appear in more than one record, sorted; empty when the ledger is sound. */
export function findDuplicateIds(records: readonly AdvisoryRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) duplicates.add(record.id);
    seen.add(record.id);
  }
  return [...duplicates].sort();
}

export type SlaBreachKind = "released" | "open";

export interface SlaBreach {
  id: string;
  severity: Severity;
  kind: SlaBreachKind;
  days: number;
  slaDays: number;
}

/**
 * Every SLA violation the gate cares about: a release that took too long, and
 * an open advisory that is already past its severity budget.
 */
export function findSlaBreaches(stats: LatencyStats): SlaBreach[] {
  return [
    ...stats.breached.map((entry) => ({
      id: entry.id,
      severity: entry.severity,
      kind: "released" as const,
      days: entry.days,
      slaDays: entry.slaDays,
    })),
    ...stats.open
      .filter((entry) => entry.ageDays > entry.slaDays)
      .map((entry) => ({
        id: entry.id,
        severity: entry.severity,
        kind: "open" as const,
        days: entry.ageDays,
        slaDays: entry.slaDays,
      })),
  ];
}

/** The exact block `--write-doc` splices into the doc. */
export function renderGeneratedBlock(stats: LatencyStats): string {
  return `${GENERATED_BLOCK_BEGIN}\n\n${renderMarkdownTable(stats)}\n\n${GENERATED_BLOCK_END}`;
}

/**
 * Replace the region between the markers, keeping everything outside it
 * byte-for-byte. Returns `null` when either marker is missing or reversed.
 */
export function replaceGeneratedBlock(source: string, block: string): string | null {
  const start = source.indexOf(GENERATED_BLOCK_BEGIN);
  const end = source.indexOf(GENERATED_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return `${source.slice(0, start)}${block}${source.slice(end + GENERATED_BLOCK_END.length)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Human table for the default (non-JSON) output: id, severity, state, latency, SLA, status. */
export function renderAdvisoryRecordTable(
  records: readonly AdvisoryRecord[],
  stats: LatencyStats,
): string {
  const openById = new Map(stats.open.map((entry) => [entry.id, entry]));

  const rows = records.map((record) => {
    const days = latencyDays(record);
    const slaDays = SEVERITY_SLA_DAYS[record.severity];
    const released = record.state === "released" && days !== null;
    const pastSla = released ? days > slaDays : (openById.get(record.id)?.ageDays ?? 0) > slaDays;
    return [
      record.id,
      record.severity,
      record.state,
      days === null ? "—" : days.toFixed(1),
      String(slaDays),
      record.provenance === "example"
        ? "example (excluded)"
        : pastSla
          ? "SLA EXCEEDED"
          : "within SLA",
    ];
  });

  const header = ["ID", "SEVERITY", "STATE", "LATENCY", "SLA", "STATUS"];
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0, " "))
      .join("  ")
      .trimEnd();

  return [header, ...rows].map(formatRow).join("\n");
}

export interface LedgerReport {
  ok: boolean;
  advisories: AdvisoryRecord[];
  examples: string[];
  stats: LatencyStats;
  /** Machine-readable breach list. Key name is part of the CLI contract. */
  slabreaches: SlaBreach[];
  errors: string[];
}

/** The `--json` report shape downstream tooling reads (key names are the contract). */
export function buildLedgerReport(
  records: readonly AdvisoryRecord[],
  stats: LatencyStats,
  errors: readonly string[],
): LedgerReport {
  return {
    ok: errors.length === 0,
    advisories: [...records],
    examples: records
      .filter((record) => record.provenance === "example")
      .map((record) => record.id),
    stats,
    slabreaches: findSlaBreaches(stats),
    errors: [...errors],
  };
}

function run(argv: readonly string[]): number {
  let flags: CliFlags;
  try {
    flags = parseAdvisoryCliFlags(argv);
  } catch (error) {
    console.error(`✖ ${errorMessage(error)}`);
    console.error(USAGE);
    return 2;
  }

  if (flags.help) {
    console.log(USAGE);
    return 0;
  }

  const root = join(import.meta.dirname, "..", "..");
  const advisoriesDir = join(root, ADVISORIES_DIR);

  let files: string[];
  try {
    files = readdirSync(advisoriesDir)
      .filter((entry) => entry.endsWith(".json"))
      .sort();
  } catch (error) {
    console.error(`✖ Cannot read ${advisoriesDir}: ${errorMessage(error)}`);
    return 2;
  }

  if (files.length === 0) {
    console.error(`✖ No advisory records found in ${advisoriesDir}`);
    return 2;
  }

  const errors: string[] = [];
  const records: AdvisoryRecord[] = [];

  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(join(advisoriesDir, file), "utf8");
    } catch (error) {
      console.error(`✖ Cannot read ${file}: ${errorMessage(error)}`);
      return 2;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      errors.push(`${file}: invalid JSON — ${errorMessage(error)}`);
      continue;
    }

    try {
      records.push(parseAdvisoryRecord(parsed));
    } catch (error) {
      errors.push(`${file}: ${errorMessage(error)}`);
    }
  }

  for (const record of records) {
    for (const problem of validateAdvisoryRecord(record)) errors.push(`${record.id}: ${problem}`);
  }

  for (const id of findDuplicateIds(records)) {
    errors.push(`duplicate advisory id "${id}" — keep exactly one record per advisory`);
  }

  records.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));

  const stats = computeLatencyStats(records, new Date());
  const exampleIds = records
    .filter((record) => record.provenance === "example")
    .map((record) => record.id);
  const publishedCount = records.length - exampleIds.length;
  const openBreaches = stats.open.filter((entry) => entry.ageDays > entry.slaDays);
  const slaBreaches = findSlaBreaches(stats);
  const breachCount = slaBreaches.length;
  const releasedCount = Object.values(stats.bySeverity).reduce(
    (total, entry) => total + entry.released,
    0,
  );

  if (flags.json) {
    console.log(JSON.stringify(buildLedgerReport(records, stats, errors), null, 2));
  } else {
    console.log(renderAdvisoryRecordTable(records, stats));
    console.log("\nRelease latency by severity:\n");
    console.log(renderMarkdownTable(stats));
    console.log(
      `\n${records.length} record(s) — ${publishedCount} published, ${exampleIds.length} example (excluded), ${releasedCount} released, ${stats.open.length} open — ${breachCount} SLA breach(es)`,
    );
    if (publishedCount === 0) {
      console.log(
        'No published advisories yet — the latency table stays empty until a record is marked `provenance: "published"`.',
      );
    }
    if (errors.length > 0) {
      console.error(`\n✖ ${errors.length} validation problem(s):`);
      for (const problem of errors) console.error(`  - ${problem}`);
    }
    for (const entry of openBreaches) {
      console.error(
        `⚠ ${entry.id} (${entry.severity}) has been open ${entry.ageDays.toFixed(1)} days — SLA is ${entry.slaDays}`,
      );
    }
  }

  if (errors.length > 0) return 1;

  if (flags.writeDoc) {
    const docPath = join(root, PATCH_LATENCY_DOC);
    let source: string;
    try {
      source = readFileSync(docPath, "utf8");
    } catch (error) {
      console.error(`✖ Cannot read ${docPath}: ${errorMessage(error)}`);
      return 2;
    }
    const updated = replaceGeneratedBlock(source, renderGeneratedBlock(stats));
    if (updated === null) {
      console.error(`✖ ${docPath} is missing ${GENERATED_BLOCK_BEGIN} / ${GENERATED_BLOCK_END}`);
      return 2;
    }
    try {
      writeFileSync(docPath, updated, "utf8");
    } catch (error) {
      console.error(`✖ Cannot write ${docPath}: ${errorMessage(error)}`);
      return 2;
    }
    if (!flags.json) console.log(`\n✔ Rewrote the generated block in ${PATCH_LATENCY_DOC}`);
  }

  if (flags.failOnBreach && breachCount > 0) {
    console.error(
      `✖ ${breachCount} advisory record(s) exceeded the severity SLA — resolve or re-triage before merging`,
    );
    return 1;
  }

  if (!flags.json) console.log("✔ Advisory ledger is valid — no SLA breach");
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2)));
}
