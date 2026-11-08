#!/usr/bin/env bun
/**
 * @file scripts/check/check-test-inventory.ts
 * @description Floor ratchet for the executed test inventory.
 *
 * A green suite says the tests that ran passed; it says nothing about the tests
 * that never ran. That gap has bitten this repository: a subset run was reported
 * as the full suite (300 files / 2,813 tests instead of 838 / 7,965), and a test
 * file renamed out of a suite simply stopped executing. Both look "green".
 *
 * This check reads the machine-readable Vitest report produced by the same run
 * it validates and compares per-area test counts against a tracked baseline. A
 * drop is a failure; growth is free. Re-baselining is explicit (`--update`) so a
 * consolidation is recorded, never inferred from a smaller run.
 *
 * Areas are derived from the path under `tests/` (`unit/api`, `unit/security`,
 * `unit/routes`, …) so a whole directory silently disappearing is caught even
 * when the total is masked by growth elsewhere.
 *
 * Features:
 * - Vitest JSON report ingestion (file + per-file `assertionResults` counts)
 * - Per-area + total floor comparison against a tracked baseline
 * - `--layer` selects the baseline section (`unit`, `components`, …)
 * - `--update` re-baselines one layer while preserving the others
 * - Exit 3 when no report exists, so "not verified" is never reported as green
 *
 * Usage:
 *   bun run scripts/test/run-unit-suite.ts                # writes .vitest/unit-report.json
 *   bun run scripts/check/check-test-inventory.ts         # default report: .vitest/<layer>-report.json
 *   bun run scripts/check/check-test-inventory.ts --layer=components
 *   bun run scripts/check/check-test-inventory.ts --update
 *   bun run scripts/check/check-test-inventory.ts --report=path/to/report.json
 *
 * Exit: 0 intact, 1 regression, 3 no report to verify, 4 invalid report.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** One row of the inventory. */
export interface InventoryArea {
  files: number;
  tests: number;
}

/** One executed layer (`unit`, `components`, …). */
export interface InventoryLayer {
  generatedAt: string;
  totals: InventoryArea;
  areas: Record<string, InventoryArea>;
}

/** Tracked baseline file shape. */
export interface InventoryBaseline {
  version: 1;
  layers: Record<string, InventoryLayer>;
}

/** The subset of Vitest's JSON reporter output this module consumes. */
export interface VitestJsonReport {
  numTotalTests?: number;
  testResults?: Array<{
    name?: string;
    assertionResults?: unknown[];
  }>;
}

export const DEFAULT_BASELINE_PATH = "scripts/check/baselines/test-inventory-baseline.json";

/** Report written by `scripts/test/run-unit-suite.ts` for one layer. */
export function defaultReportPath(layer: string): string {
  return `.vitest/${layer}-report.json`;
}

const EXIT_REGRESSION = 1;
const EXIT_NO_REPORT = 3;
const EXIT_INVALID_REPORT = 4;

/**
 * Maps a test file path to its inventory area.
 *
 * `tests/unit/api/foo.test.ts` → `unit/api`, `tests/unit/foo.test.ts` → `unit`,
 * `tests/e2e/routes/x.spec.ts` → `e2e/routes`, anything else → `other`.
 */
export function areaForTestFile(name: string): string {
  const posix = name.replace(/\\/g, "/");
  // Vitest includes `src/widgets/custom/**/tests/**` in the unit project, so a
  // `src/` path must be classified before the generic `/tests/` marker.
  const srcIndex = posix.lastIndexOf("/src/");
  if (srcIndex >= 0 || posix.startsWith("src/")) {
    return posix.includes("/src/widgets/") || posix.startsWith("src/widgets/")
      ? "widgets"
      : "other";
  }
  // Absolute paths carry `/tests/`; Vitest can also hand back relative ones.
  const nested = posix.lastIndexOf("/tests/");
  const testsIndex = nested >= 0 ? nested + 1 : posix.startsWith("tests/") ? 0 : -1;
  if (testsIndex >= 0) {
    const relative = posix.slice(testsIndex + "tests/".length);
    const parts = relative.split("/").filter(Boolean);
    const layer = parts[0] ?? "other";
    // parts.at(-1) is the filename itself; only count directory segments.
    if (parts.length > 2) return `${layer}/${parts[1]}`;
    return layer;
  }
  return "other";
}

/**
 * Builds the inventory for one executed run.
 *
 * Returns null when the report carries no per-file results: an empty report is
 * indistinguishable from a broken reporter, so the caller fails closed.
 */
export function collectTestInventory(report: VitestJsonReport, now: string): InventoryLayer | null {
  const files = report.testResults;
  if (!Array.isArray(files) || files.length === 0) return null;

  const areas: Record<string, InventoryArea> = {};
  let reportedTests = 0;

  for (const file of files) {
    if (typeof file.name !== "string") continue;
    const area = areaForTestFile(file.name);
    const tests = Array.isArray(file.assertionResults) ? file.assertionResults.length : 0;
    const row = areas[area] ?? { files: 0, tests: 0 };
    row.files += 1;
    row.tests += tests;
    areas[area] = row;
    reportedTests += tests;
  }

  const sortedAreas: Record<string, InventoryArea> = {};
  for (const area of Object.keys(areas).sort()) sortedAreas[area] = areas[area];

  return {
    generatedAt: now,
    totals: {
      files: files.length,
      tests:
        typeof report.numTotalTests === "number" && report.numTotalTests >= reportedTests
          ? report.numTotalTests
          : reportedTests,
    },
    areas: sortedAreas,
  };
}

/**
 * Floor comparison: a count may grow freely, never shrink.
 *
 * Returns one human-readable violation per dropped or vanished area, plus the
 * total when it regresses.
 */
export function compareInventory(
  baseline: InventoryLayer,
  current: InventoryLayer,
): { violations: string[]; changed: Array<{ area: string; base: number; curr: number }> } {
  const violations: string[] = [];
  const changed: Array<{ area: string; base: number; curr: number }> = [];

  if (current.totals.tests < baseline.totals.tests) {
    violations.push(
      `Total executed tests dropped from ${baseline.totals.tests} to ${current.totals.tests} ` +
        `(-${baseline.totals.tests - current.totals.tests})`,
    );
  }

  for (const area of Object.keys(baseline.areas).sort()) {
    const base = baseline.areas[area].tests;
    const curr = current.areas[area]?.tests ?? 0;
    if (curr !== base) changed.push({ area, base, curr });
    if (curr < base) {
      violations.push(
        current.areas[area]
          ? `Area "${area}" dropped from ${base} to ${curr} (-${base - curr})`
          : `Area "${area}" no longer executed (baseline ${base} tests)`,
      );
    }
  }

  return { violations, changed };
}

/** Reads and validates a Vitest JSON report from disk. */
export function readReport(filePath: string): VitestJsonReport | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as VitestJsonReport;
  } catch {
    return null;
  }
}

function readBaseline(filePath: string): InventoryBaseline {
  if (!existsSync(filePath)) return { version: 1, layers: {} };
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<InventoryBaseline>;
  return {
    version: 1,
    layers: parsed.layers && typeof parsed.layers === "object" ? parsed.layers : {},
  };
}

function writeBaseline(filePath: string, baseline: InventoryBaseline): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function formatRows(changed: Array<{ area: string; base: number; curr: number }>): string {
  if (changed.length === 0) return "";
  const width = Math.max(...changed.map((row) => row.area.length), "area".length);
  const lines = [`   ${"area".padEnd(width)}  baseline  current  delta`];
  for (const { area, base, curr } of changed) {
    const delta = curr - base;
    const sign = delta > 0 ? "+" : "";
    lines.push(
      `   ${area.padEnd(width)}  ${String(base).padStart(8)}  ${String(curr).padStart(7)}  ${sign}${delta}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

interface CliOptions {
  layer: string;
  report: string;
  baseline: string;
  update: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    layer: "unit",
    report: "",
    baseline: DEFAULT_BASELINE_PATH,
    update: false,
  };
  for (const arg of argv) {
    if (arg === "--update") options.update = true;
    else if (arg.startsWith("--layer=")) options.layer = arg.slice("--layer=".length);
    else if (arg.startsWith("--report=")) options.report = arg.slice("--report=".length);
    else if (arg.startsWith("--baseline=")) options.baseline = arg.slice("--baseline=".length);
  }
  if (!options.report) options.report = defaultReportPath(options.layer);
  return options;
}

function main(argv: readonly string[]): number {
  const options = parseArgs(argv);
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const reportPath = resolve(root, options.report);
  const baselinePath = resolve(root, options.baseline);

  if (!existsSync(reportPath)) {
    console.error(
      `⚠️  Test inventory not verified — no Vitest JSON report at ${options.report}.\n` +
        `   Produce one with: --reporter=json --outputFile=${options.report}`,
    );
    return EXIT_NO_REPORT;
  }

  const raw = readReport(reportPath);
  const current = raw ? collectTestInventory(raw, new Date().toISOString()) : null;
  if (!current) {
    console.error(`❌ Invalid Vitest JSON report at ${options.report} (no per-file results).`);
    return EXIT_INVALID_REPORT;
  }

  if (options.update) {
    const baseline = readBaseline(baselinePath);
    baseline.layers[options.layer] = current;
    writeBaseline(baselinePath, baseline);
    console.log(
      `📌 Re-baselined "${options.layer}": ${current.totals.files} files / ${current.totals.tests} tests ` +
        `across ${Object.keys(current.areas).length} areas → ${options.baseline}`,
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  const layer = baseline.layers[options.layer];
  if (!layer) {
    console.error(
      `❌ No "${options.layer}" baseline in ${options.baseline}. ` +
        `Create it with: bun run scripts/check/check-test-inventory.ts --layer=${options.layer} --report=${options.report} --update`,
    );
    return EXIT_REGRESSION;
  }

  const { violations, changed } = compareInventory(layer, current);
  const areaCount = Object.keys(current.areas).length;

  if (violations.length > 0) {
    console.error(
      `❌ Test inventory regressed (${options.layer}: ${current.totals.files} files / ${current.totals.tests} tests):`,
    );
    for (const violation of violations) console.error(`   - ${violation}`);
    const rows = formatRows(changed);
    if (rows) console.error(rows.trimEnd());
    console.error(
      `   Intentional consolidation? Re-baseline with --layer=${options.layer} --update and review the diff.`,
    );
    return EXIT_REGRESSION;
  }

  const rows = formatRows(changed);
  if (rows) console.log(rows.trimEnd());
  console.log(
    `✅ Test inventory intact — ${options.layer}: ${current.totals.files} files / ` +
      `${current.totals.tests} tests across ${areaCount} areas (baseline ${layer.totals.tests}).`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
