#!/usr/bin/env bun
/**
 * @file scripts/test/check-coverage-budget.ts
 * @description Per-area statement-coverage ratchet for the P0 coverage report.
 *
 * `bun run test:coverage` enforces one global statement floor (70 %), so a
 * regression in a small area is invisible when a large area improves: losing
 * ten covered statements in `routes/api` disappears behind a hundred new ones
 * in `utils/security`. This gate splits the same v8 report into deterministic
 * areas and compares each area's statement coverage with the committed
 * baseline in `scripts/test/coverage-budget.json`.
 *
 * Area grouping (first matching rule wins, reported without the `src/` prefix):
 * - `src/hooks/**`                  → `hooks`
 * - `src/databases/auth/**`         → `databases/auth`
 * - `src/utils/security/**`         → `utils/security`
 * - `src/routes/api/**`             → `routes/api`
 * - a file directly in `src/utils/` → `utils/core`
 * - anything else                   → `src/<first segment>` (e.g. `src/services`)
 *
 * Usage:
 *   bun run scripts/test/check-coverage-budget.ts            # check
 *   bun run scripts/test/check-coverage-budget.ts --update   # regenerate baseline
 *
 * Features:
 * - Reads `.vitest/coverage/coverage-final.json` and aggregates covered/total
 *   statements (plus line counts for context) per area and for the whole report.
 * - Fails (exit 1) when an area drops more than 0.5 percentage points below its
 *   baseline; shows each area's baseline, current value, and delta.
 * - Treats an area that is present in the baseline but absent from the report
 *   as 0 % (delete/rename needs a reviewed `--update`); reports new areas.
 * - `--update` rewrites the baseline from the current report, never the reverse.
 * - Gives an actionable error when the report or the baseline is missing.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

/** Maximum allowed drop, in percentage points, before an area fails the gate. */
export const DEFAULT_TOLERANCE_PP = 0.5;

const ROOT = join(import.meta.dirname, "../..");
const REPORT_PATH = join(ROOT, ".vitest", "coverage", "coverage-final.json");
const BASELINE_PATH = join(ROOT, "scripts", "test", "coverage-budget.json");

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatementLocation {
  start?: { line?: number };
}

export interface RawCoverageEntry {
  path?: string;
  statementMap?: Record<string, StatementLocation>;
  s?: Record<string, number>;
}

export type CoverageReport = Record<string, RawCoverageEntry>;

export interface CoverageCounts {
  statements: number;
  coveredStatements: number;
  lines: number;
  coveredLines: number;
}

export interface AreaCoverage extends CoverageCounts {
  percent: number;
  linePercent: number;
}

export interface CoverageSummary {
  files: number;
  areas: Record<string, AreaCoverage>;
  total: AreaCoverage;
}

export interface BudgetBaseline {
  generatedAt: string;
  note: string;
  tolerance: number;
  areas: Record<string, AreaCoverage>;
  total: AreaCoverage;
}

export interface BudgetRow {
  area: string;
  baselinePercent: number | null;
  currentPercent: number;
  delta: number | null;
  ok: boolean;
  /** Baseline area that no longer appears in the coverage report. */
  missing: boolean;
}

export interface BudgetResult {
  ok: boolean;
  rows: BudgetRow[];
  violations: BudgetRow[];
}

/** Filesystem boundary so the pure loaders can be exercised without disk I/O. */
export interface CoverageFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
}

const NODE_FS: CoverageFs = {
  existsSync: (path) => existsSync(path),
  readFileSync: (path, encoding) => readFileSync(path, encoding),
};

// ── Paths and grouping ───────────────────────────────────────────────────────

const GROUPED_AREAS: ReadonlyArray<{ prefix: string; area: string }> = [
  { prefix: "src/databases/auth/", area: "databases/auth" },
  { prefix: "src/routes/api/", area: "routes/api" },
  { prefix: "src/utils/security/", area: "utils/security" },
  { prefix: "src/hooks/", area: "hooks" },
];

/** Normalizes an absolute (any OS) or already-relative report path to `src/...`. */
export function toRepoRelative(filePath: string, root: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const absolute = isAbsolute(filePath) || /^[A-Za-z]:\//.test(normalized);
  if (absolute) {
    const rel = relative(root, filePath).replace(/\\/g, "/");
    if (!rel.startsWith("..")) return rel;
  }
  const srcIndex = normalized.lastIndexOf("/src/");
  if (srcIndex >= 0) return normalized.slice(srcIndex + 1);
  if (normalized.startsWith("src/")) return normalized;
  return normalized.replace(/^\.\//, "");
}

/** Deterministic area name for a repo-relative path; see the file header. */
export function classifyArea(repoRelativePath: string): string {
  const normalized = repoRelativePath.replace(/\\/g, "/").replace(/^\.\//, "");

  for (const { prefix, area } of GROUPED_AREAS) {
    if (normalized.startsWith(prefix)) return area;
  }

  const segments = normalized.split("/");
  if (segments[0] !== "src") return "other";
  // Flat helpers directly under `src/utils/` (error-handling, test-bypass).
  if (segments.length === 3 && segments[1] === "utils") return "utils/core";
  if (segments.length > 2 && segments[1]) return `src/${segments[1]}`;
  return "src";
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentOf(covered: number, total: number): number {
  return total === 0 ? 0 : round2((covered / total) * 100);
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emptyCoverage(): AreaCoverage {
  return {
    statements: 0,
    coveredStatements: 0,
    lines: 0,
    coveredLines: 0,
    percent: 0,
    linePercent: 0,
  };
}

/** Statement + line counts for one Istanbul file entry. */
export function measureFile(entry: RawCoverageEntry): CoverageCounts {
  const lineHits = new Map<number, boolean>();
  let statements = 0;
  let coveredStatements = 0;

  for (const [id, location] of Object.entries(entry.statementMap ?? {})) {
    const hit = (entry.s?.[id] ?? 0) > 0;
    statements += 1;
    if (hit) coveredStatements += 1;

    const line = location.start?.line;
    if (typeof line === "number" && line > 0) {
      lineHits.set(line, (lineHits.get(line) ?? false) || hit);
    }
  }

  let coveredLines = 0;
  for (const hit of lineHits.values()) if (hit) coveredLines += 1;

  return { statements, coveredStatements, lines: lineHits.size, coveredLines };
}

function addCounts(target: AreaCoverage, counts: CoverageCounts): void {
  target.statements += counts.statements;
  target.coveredStatements += counts.coveredStatements;
  target.lines += counts.lines;
  target.coveredLines += counts.coveredLines;
}

function finalize(area: AreaCoverage): AreaCoverage {
  return {
    ...area,
    percent: percentOf(area.coveredStatements, area.statements),
    linePercent: percentOf(area.coveredLines, area.lines),
  };
}

/** Aggregates a raw coverage report into sorted areas plus a `total` row. */
export function aggregateCoverage(report: CoverageReport, root: string): CoverageSummary {
  const areas: Record<string, AreaCoverage> = {};
  const total = emptyCoverage();
  let files = 0;

  for (const [key, entry] of Object.entries(report)) {
    const areaName = classifyArea(toRepoRelative(entry.path ?? key, root));
    const counts = measureFile(entry);

    const area = areas[areaName] ?? emptyCoverage();
    addCounts(area, counts);
    areas[areaName] = area;
    addCounts(total, counts);
    files += 1;
  }

  const sortedAreas: Record<string, AreaCoverage> = {};
  for (const [name, area] of Object.entries(areas).sort(([a], [b]) => byName(a, b))) {
    sortedAreas[name] = finalize(area);
  }

  return { files, areas: sortedAreas, total: finalize(total) };
}

// ── Budget comparison ────────────────────────────────────────────────────────

/** Tolerance for float noise: exactly 0.5 pp is allowed, 0.51 pp is not. */
const EPSILON = 1e-9;

function toRow(
  area: string,
  baselinePercent: number | null,
  current: AreaCoverage | undefined,
  tolerance: number,
): BudgetRow {
  const currentPercent = current?.percent ?? 0;
  const missing = current === undefined;
  const delta = baselinePercent === null ? null : round2(currentPercent - baselinePercent);
  const ok = baselinePercent === null || baselinePercent - currentPercent <= tolerance + EPSILON;

  return { area, baselinePercent, currentPercent, delta, ok, missing };
}

/**
 * Compares current per-area coverage with the baseline. Only drops count:
 * an area above its baseline passes, and a new area has nothing to regress.
 */
export function evaluateBudget(
  current: CoverageSummary,
  baseline: BudgetBaseline,
  tolerance = DEFAULT_TOLERANCE_PP,
): BudgetResult {
  const names = new Set([...Object.keys(baseline.areas), ...Object.keys(current.areas)]);
  const rows: BudgetRow[] = [];

  for (const area of [...names].sort(byName)) {
    const baselinePercent = baseline.areas[area]?.percent ?? null;
    rows.push(toRow(area, baselinePercent, current.areas[area], tolerance));
  }
  rows.push(toRow("total", baseline.total?.percent ?? null, current.total, tolerance));

  const violations = rows.filter((row) => !row.ok);
  return { ok: violations.length === 0, rows, violations };
}

export function formatBudgetTable(rows: BudgetRow[], tolerance: number): string {
  const areaWidth = Math.max("area".length, ...rows.map((row) => row.area.length));
  const baselineHead = "baseline".padStart(8);
  const currentHead = "current".padStart(8);
  const deltaHead = "delta".padStart(8);
  const lines = [
    `Coverage budget — statement coverage (tolerance ${tolerance.toFixed(2)} pp)`,
    `${"area".padEnd(areaWidth)}  ${baselineHead}  ${currentHead}  ${deltaHead}`,
    `${"-".repeat(areaWidth)}  ${"-".repeat(8)}  ${"-".repeat(8)}  ${"-".repeat(8)}`,
  ];

  for (const row of rows) {
    const baselineText = row.baselinePercent === null ? "—" : row.baselinePercent.toFixed(2);
    const deltaText =
      row.delta === null ? "—" : `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(2)}`;
    lines.push(
      `${row.area.padEnd(areaWidth)}  ${baselineText.padStart(8)}  ` +
        `${row.currentPercent.toFixed(2).padStart(8)}  ${deltaText.padStart(8)}`,
    );
  }

  return lines.join("\n");
}

// ── Loading and baseline generation ──────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCoverageReport(raw: string, source = "coverage report"): CoverageReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid coverage report (${source}): ${reason}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`Invalid coverage report (${source}): expected a JSON object of file entries.`);
  }

  const report: CoverageReport = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isRecord(value) || !isRecord(value.statementMap) || !isRecord(value.s)) {
      throw new Error(
        `Invalid coverage report (${source}): entry "${key}" is missing statementMap or s.`,
      );
    }
    report[key] = {
      path: typeof value.path === "string" ? value.path : key,
      statementMap: value.statementMap as Record<string, StatementLocation>,
      s: value.s as Record<string, number>,
    };
  }
  return report;
}

export function loadCoverageReport(reportPath: string, fs: CoverageFs = NODE_FS): CoverageReport {
  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Coverage report not found: ${reportPath}\n` +
        "Run `bun run test:coverage` (or `bun run test:unit:coverage`) first — it writes the v8 report this gate reads.",
    );
  }
  return parseCoverageReport(fs.readFileSync(reportPath, "utf8"), reportPath);
}

function isAreaCoverage(value: unknown): value is AreaCoverage {
  if (!isRecord(value)) return false;
  return [
    "statements",
    "coveredStatements",
    "lines",
    "coveredLines",
    "percent",
    "linePercent",
  ].every((key) => typeof value[key] === "number");
}

export function loadBudgetBaseline(baselinePath: string, fs: CoverageFs = NODE_FS): BudgetBaseline {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Coverage baseline not found: ${baselinePath}\n` +
        "Generate it from a healthy coverage run: `bun run scripts/test/check-coverage-budget.ts --update`.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid coverage baseline (${baselinePath}): ${reason}`);
  }

  if (
    !isRecord(parsed) ||
    !isRecord(parsed.areas) ||
    typeof parsed.generatedAt !== "string" ||
    typeof parsed.note !== "string" ||
    typeof parsed.tolerance !== "number" ||
    !isAreaCoverage(parsed.total) ||
    !Object.values(parsed.areas).every(isAreaCoverage)
  ) {
    throw new Error(
      `Invalid coverage baseline (${baselinePath}): expected generatedAt, note, tolerance, areas, and total.`,
    );
  }

  return {
    generatedAt: parsed.generatedAt,
    note: parsed.note,
    tolerance: parsed.tolerance,
    areas: parsed.areas as Record<string, AreaCoverage>,
    total: parsed.total,
  };
}

export function buildBaseline(
  summary: CoverageSummary,
  tolerance = DEFAULT_TOLERANCE_PP,
  generatedAt = new Date().toISOString().slice(0, 10),
): BudgetBaseline {
  const areas: Record<string, AreaCoverage> = {};
  for (const [name, area] of Object.entries(summary.areas)) {
    areas[name] = { ...area };
  }

  return {
    generatedAt,
    note:
      `Per-area statement-coverage ratchet: no area may drop more than ${tolerance} percentage ` +
      "points below its baseline. Regenerate with `--update` only after a verified coverage " +
      "improvement; never lower a baseline to make the gate pass.",
    tolerance,
    areas,
    total: { ...summary.total },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function usage(): string {
  return [
    "Usage: bun run scripts/test/check-coverage-budget.ts [--update]",
    "",
    "  (default)  compare .vitest/coverage/coverage-final.json with the baseline",
    "  --update   rewrite scripts/test/coverage-budget.json from the current report",
  ].join("\n");
}

function main(): number {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help") || args.has("-h")) {
    console.log(usage());
    return 0;
  }

  let report: CoverageReport;
  try {
    report = loadCoverageReport(REPORT_PATH);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const summary = aggregateCoverage(report, ROOT);
  if (summary.files === 0) {
    console.error(
      "❌ Coverage report contains no file entries — check the P0 `coverage.include` set in vitest.config.ts.",
    );
    return 1;
  }

  if (args.has("--update")) {
    const baseline = buildBaseline(summary);
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(
      `✅ coverage budget written: ${relative(ROOT, BASELINE_PATH).replace(/\\/g, "/")} ` +
        `(${summary.files} files, ${Object.keys(summary.areas).length} areas, total ${summary.total.percent.toFixed(2)} %)`,
    );
    return 0;
  }

  let baseline: BudgetBaseline;
  try {
    baseline = loadBudgetBaseline(BASELINE_PATH);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const tolerance = Number.isFinite(baseline.tolerance) ? baseline.tolerance : DEFAULT_TOLERANCE_PP;
  const result = evaluateBudget(summary, baseline, tolerance);

  console.log(
    `Coverage budget — ${summary.files} files, ${Object.keys(summary.areas).length} areas\n`,
  );
  console.log(formatBudgetTable(result.rows, tolerance));

  if (!result.ok) {
    console.error(
      `\n❌ coverage budget: ${result.violations.length} area(s) dropped below baseline.`,
    );
    for (const row of result.violations) {
      const missing = row.missing ? " (area missing from the report)" : "";
      console.error(
        `   ${row.area}: ${row.currentPercent.toFixed(2)}% vs baseline ${row.baselinePercent?.toFixed(2)}%${missing}`,
      );
    }
    console.error(
      "   Cover the regression. If the coverage scope genuinely changed, verify it and run --update.",
    );
    return 1;
  }

  console.log(
    `\n✅ coverage budget: every area is within ${tolerance.toFixed(2)} pp of its baseline.`,
  );
  return 0;
}

if (import.meta.main) process.exit(main());
