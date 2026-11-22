#!/usr/bin/env bun
/**
 * @file scripts/runs/run-benchmark-median.ts
 * @description Median-of-N benchmark report with a drift control.
 *
 * A single core-benchmark run varies by tens of percent on a shared host, so a
 * published number has to be a median with its spread, not one sample. This
 * wrapper runs `run-core-benchmarks.ts` N times, reads the rolling samples the
 * gate just appended (`tests/benchmarks/results/gate-baseline-<db>.json`), and
 * reports median / min / max / spread per metric.
 *
 * An untouched metric (`--control`, default `REST point read p95`) is printed
 * separately: when the control's spread is large, the run medians describe host
 * noise, not a product change.
 *
 * Usage:
 *   bun run scripts/runs/run-benchmark-median.ts --db=sqlite --repeat=3
 *   bun run scripts/runs/run-benchmark-median.ts --db=postgresql --repeat=5 --control="REST list p95"
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const RESULTS_DIR = join(ROOT, "tests", "benchmarks", "results");
const VALID_DBS = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;
type Db = (typeof VALID_DBS)[number];

interface GateBaseline {
  series: Record<string, number[]>;
}

function arg(name: string): string | undefined {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith(prefix)) return args[i]!.slice(prefix.length);
    if (args[i] === name && i + 1 < args.length) return args[i + 1];
  }
  return undefined;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function main(): number {
  const db = (arg("--db") ?? "sqlite") as Db;
  if (!VALID_DBS.includes(db)) {
    console.error(`❌ Invalid --db="${db}". Valid: ${VALID_DBS.join(", ")}`);
    return 1;
  }
  const repeat = Math.max(1, Math.min(10, Number.parseInt(arg("--repeat") ?? "3", 10) || 3));
  const control = arg("--control") ?? "REST point read p95";
  const baselinePath = join(RESULTS_DIR, `gate-baseline-${db}.json`);

  console.log(`\n📊 Median-of-${repeat} benchmark — ${db.toUpperCase()}`);
  console.log("   Each run evaluates the rolling gate; the last N samples are aggregated.\n");

  for (let run = 1; run <= repeat; run++) {
    console.log(`▶ Run ${run}/${repeat}`);
    const result = spawnSync("bun", ["run", "scripts/runs/run-core-benchmarks.ts", `--db=${db}`], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      console.error(`❌ Run ${run} failed — no median report.`);
      return 1;
    }
  }

  if (!existsSync(baselinePath)) {
    console.error(`❌ Missing ${baselinePath} — the gate did not record samples.`);
    return 1;
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as GateBaseline;
  const labels = Object.keys(baseline.series).sort();
  const rows = labels.map((label) => {
    const samples = baseline.series[label]!.slice(-repeat);
    const med = median(samples);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    return {
      label,
      samples,
      median: med,
      min,
      max,
      spreadPct: med > 0 ? ((max - min) / med) * 100 : 0,
    };
  });

  const width = Math.max(...rows.map((row) => row.label.length), 24);
  console.log("\n| Metric".padEnd(width + 3) + "| Median | Min | Max | Spread |");
  console.log(`| ${"-".repeat(width - 2)} | ---: | ---: | ---: | ---: |`);
  for (const row of rows) {
    console.log(
      `| ${row.label.padEnd(width - 2)} | ${row.median.toFixed(3)} | ${row.min.toFixed(3)} | ${row.max.toFixed(3)} | ${row.spreadPct.toFixed(0)}% |`,
    );
  }

  const controlRow = rows.find((row) => row.label === control);
  if (controlRow) {
    const verdict =
      controlRow.spreadPct <= 10
        ? "🟢 stable — medians describe the product"
        : controlRow.spreadPct <= 25
          ? "🟠 noisy — treat small deltas as inconclusive"
          : "🔴 host-dominated — do not publish these medians";
    console.log(
      `\nDrift control: **${controlRow.label}** median ${controlRow.median.toFixed(3)} ms, spread ${controlRow.spreadPct.toFixed(0)}% → ${verdict}`,
    );
  } else {
    console.log(`\n⚠ Drift control "${control}" not found in the baseline series.`);
  }

  const outPath = join(
    RESULTS_DIR,
    `median-${db}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        db,
        repeat,
        control,
        generatedAt: new Date().toISOString(),
        rows,
        controlVerdict: controlRow
          ? { spreadPct: controlRow.spreadPct, median: controlRow.median }
          : null,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n📄 ${outPath}`);
  return 0;
}

process.exit(main());
