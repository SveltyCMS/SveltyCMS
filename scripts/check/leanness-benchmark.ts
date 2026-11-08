#!/usr/bin/env bun
/**
 * @file scripts/check/leanness-benchmark.ts
 * @description Leanness benchmark: records and diffs the architecture metrics
 * that the linkmap analyzer already produces (client-reachable weight, dead
 * exports, orphans, single-caller micro-files, barrels).
 *
 * The gate (`bun run check:linkmap`) answers "is this tree worse than the
 * gate?". This benchmark answers "did the optimisation work?" — it keeps a
 * named baseline and prints a per-metric delta, so a cleanup commit can be
 * measured instead of asserted.
 *
 * Usage:
 *   bun run check:linkmap                    # produce the snapshot
 *   bun run scripts/check/leanness-benchmark.ts --update   # record baseline
 *   bun run scripts/check/leanness-benchmark.ts            # compare
 *   bun run scripts/check/leanness-benchmark.ts --json
 *
 * Features:
 * - Fixed metric tuple (a metric removed from the report reads as `n/a`)
 * - `--update` never runs the analyzer itself: it snapshots the last run
 * - Exit code stays 0 when metrics worsen — this is a measurement tool, not
 *   a second gate (the linkmap gate already fails on regressions)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_PATH = join(ROOT, "tests", "benchmarks", "results", "linkmap-latest.json");
const BASELINE_PATH = join(ROOT, "scripts", "check", "baselines", "leanness-baseline.json");

/** Metrics that can only go down. */
const LOWER_IS_BETTER = [
  "clientReachableKB",
  "clientReachableFiles",
  "unusedRuntimeExportCount",
  "testOnlyRuntimeExportCount",
  "orphanFileCount",
  "singleCallerCount",
  "microFileCount",
  "passThroughBarrelCount",
  "reExportBridgeCount",
  "runtimeCycleCount",
  "clientServerLeakCount",
] as const;

/** Metrics that may legitimately grow (documented context, not a score). */
const CONTEXT_ONLY = ["totalFiles", "totalLoc", "totalBytes", "barrelCount"] as const;

type MetricKey = (typeof LOWER_IS_BETTER)[number] | (typeof CONTEXT_ONLY)[number];
type Metrics = Record<MetricKey, number | null>;

/** Shape of the fields we read from the analyzer report. */
interface LinkmapSummaryLike {
  totalFiles?: number;
  totalLoc?: number;
  totalBytes?: number;
  barrelCount?: number;
  passThroughBarrelCount?: number;
  reExportBridgeCount?: number;
  microFileCount?: number;
  singleCallerCount?: number;
  orphanFileCount?: number;
  unusedRuntimeExportCount?: number;
  testOnlyRuntimeExportCount?: number;
  runtimeCycleCount?: number;
  clientServerLeakCount?: number;
  clientReachableFiles?: number;
  clientReachableKB?: number;
}

interface LinkmapSnapshotLike {
  summary?: LinkmapSummaryLike;
}

interface BenchmarkRecord {
  recordedAt: string;
  source: string;
  metrics: Metrics;
}

interface DeltaRow {
  key: MetricKey;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  pct: number | null;
}

function readMetrics(): BenchmarkRecord {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `No linkmap snapshot at ${SNAPSHOT_PATH}. Run \`bun run check:linkmap\` first.`,
    );
  }
  const parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as LinkmapSnapshotLike;
  const summary = parsed.summary ?? {};
  const metrics = {} as Metrics;
  for (const key of [...LOWER_IS_BETTER, ...CONTEXT_ONLY]) {
    const value = summary[key as keyof LinkmapSummaryLike];
    metrics[key] = typeof value === "number" ? value : null;
  }
  return {
    recordedAt: new Date().toISOString(),
    source: "tests/benchmarks/results/linkmap-latest.json",
    metrics,
  };
}

function readBaseline(): BenchmarkRecord | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BenchmarkRecord;
  } catch (error) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildDelta(baseline: Metrics | null, current: Metrics): DeltaRow[] {
  return [...LOWER_IS_BETTER, ...CONTEXT_ONLY].map((key) => {
    const before = baseline?.[key] ?? null;
    const after = current[key];
    const delta = before !== null && after !== null ? after - before : null;
    const pct = before !== null && before !== 0 && delta !== null ? (delta / before) * 100 : null;
    return { key, baseline: before, current: after, delta, pct };
  });
}

function formatValue(value: number | null): string {
  if (value === null) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDelta(row: DeltaRow): string {
  if (row.delta === null) return "—";
  if (row.delta === 0) return "0";
  const sign = row.delta > 0 ? "+" : "";
  const pct = row.pct === null ? "" : ` (${sign}${row.pct.toFixed(1)}%)`;
  return `${sign}${formatValue(row.delta)}${pct}`;
}

function printTable(rows: DeltaRow[], baselineAt: string): void {
  const width = Math.max(...rows.map((row) => row.key.length), "Metric".length);
  const head = `| ${"Metric".padEnd(width)} | ${"Baseline".padStart(12)} | ${"Current".padStart(12)} | ${"Δ".padStart(18)} |`;
  const rule = `| ${"-".repeat(width)} | ${"-".repeat(12)} | ${"-".repeat(12)} | ${"-".repeat(18)} |`;
  // eslint-disable-next-line no-console
  console.log(`\nLeanness benchmark — baseline recorded ${baselineAt}\n`);
  // eslint-disable-next-line no-console
  console.log(head);
  // eslint-disable-next-line no-console
  console.log(rule);
  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `| ${row.key.padEnd(width)} | ${formatValue(row.baseline).padStart(12)} | ${formatValue(row.current).padStart(12)} | ${formatDelta(row).padStart(18)} |`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("");
}

function main(): void {
  const wantsJson = process.argv.includes("--json");
  const wantsUpdate = process.argv.includes("--update");
  const current = readMetrics();

  if (wantsUpdate) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(`✅ Leanness baseline written to ${BASELINE_PATH}`);
    return;
  }

  const baseline = readBaseline();
  if (!baseline) {
    // eslint-disable-next-line no-console
    console.log(
      `No baseline yet. Record one with:\n  bun run scripts/check/leanness-benchmark.ts --update`,
    );
    return;
  }

  const rows = buildDelta(baseline.metrics, current.metrics);
  if (wantsJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ baselineAt: baseline.recordedAt, rows }, null, 2));
    return;
  }
  printTable(rows, baseline.recordedAt);

  const improved = rows.filter(
    (row) =>
      LOWER_IS_BETTER.includes(row.key as (typeof LOWER_IS_BETTER)[number]) &&
      row.delta !== null &&
      row.delta < 0,
  );
  const regressed = rows.filter(
    (row) =>
      LOWER_IS_BETTER.includes(row.key as (typeof LOWER_IS_BETTER)[number]) &&
      row.delta !== null &&
      row.delta > 0,
  );
  // eslint-disable-next-line no-console
  console.log(`Improved: ${improved.length} metric(s) · Regressed: ${regressed.length} metric(s)`);
}

main();
