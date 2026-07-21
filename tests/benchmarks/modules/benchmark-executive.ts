/**
 * @file tests/benchmarks/modules/benchmark-executive.ts
 * @description Progressive-disclosure executive report builders for benchmark MDX.
 *
 * ### Features:
 * - dimension rollups (Core, API, Scale, Resilience)
 * - issues-only action table with budget and likely-cause columns
 * - collapsed `<details>` ledger entries (one trend line visible, truth table inside)
 * - `[!NOTE]` fix overlays and test-specific insights (no generic SWOT)
 */
import { LEDGER_MARKERS } from "./benchmark-mdx";
import { loadHistory, loadPrimaryMetricForTest } from "./benchmark-history";
import {
  LEDGER_DIMENSION_ORDER,
  mapSectionToDimension,
  type LedgerDimension,
} from "./benchmark-dimensions";
import { analyzeTrend, classifyRootCause, type Severity } from "./benchmark-analysis";

export { mapSectionToDimension, LEDGER_DIMENSION_ORDER };
export type { LedgerDimension };

const HISTORY_SQLITE_PATH = "tests/benchmarks/results/history.sqlite";
const SPARKLINE_CHARS = [
  "\u2581",
  "\u2582",
  "\u2583",
  "\u2584",
  "\u2585",
  "\u2586",
  "\u2587",
  "\u2588",
] as const;

function renderSparkline(values: number[], width = 12): string {
  if (values.length === 0) return "\u2014";
  const slice = values.slice(-width);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;
  return slice
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARKLINE_CHARS.length - 1));
      return SPARKLINE_CHARS[Math.max(0, Math.min(SPARKLINE_CHARS.length - 1, idx))];
    })
    .join("");
}
/** @deprecated Use `LedgerDimension` from `benchmark-dimensions.ts` */
export type Dimension = LedgerDimension;

const GENERIC_INSIGHT_RX =
  /(?:Within normal variance|Performance SWOT Analysis|Baseline performance successfully established|Within performance budget|suspected — single test run)/i;

export interface TestRollupEntry {
  tag: string;
  label: string;
  shortLabel: string;
  path: string;
  section: string;
  avgMs: number;
  baselineMs: number;
  deltaPct: number;
  severity: Severity | "pending";
  icon: string;
  trendLabel: string;
  likelyCause: string;
  budgetLabel: string;
  codePaths: string[];
  expected: string;
  owner: string;
}

export interface DimensionRollup {
  dimension: Dimension;
  testCount: number;
  status: string;
  worstDelta: string;
  issueCount: number;
}

export interface ExecutiveReportInput {
  dbLabel: string;
  timestamp: string;
  status: "SUCCESS" | "FAILED" | string;
  isHistorical?: boolean;
  /** Standalone / partial run — executive scoped to invoked tests only. */
  isPartial?: boolean;
  recorded: number;
  total: number;
  skipped: number;
  hostLine: string;
  warningBox?: string;
  latencyRows: Array<{
    scenario: string;
    latency: string;
    trend: string;
    budget: string;
    result: string;
  }>;
  testEntries: TestRollupEntry[];
  mermaidPoints: number[];
  existingFixNotes?: string;
}

/** Unicode trend arrow from signed delta percent. */
export function trendArrow(deltaPct: number): string {
  if (deltaPct > 5) return "\u2197\uFE0F";
  if (deltaPct < -5) return "\u2198\uFE0F";
  return "\u27A1\uFE0F";
}

export function severityEmoji(severity: Severity | "pending"): string {
  switch (severity) {
    case "critical":
    case "regression":
      return "\u{1F534}";
    case "warning":
    case "watch":
      return "\u{1F7E1}";
    case "stable":
      return "\u{1F7E2}";
    default:
      return "\u26AA";
  }
}

/** Reject boilerplate SWOT / variance text — only emit actionable per-test notes. */
export function isSpecificInsight(insight: string): boolean {
  const t = insight.trim();
  if (!t || t === "> \u23F3 Pending") return false;
  if (GENERIC_INSIGHT_RX.test(t)) return false;
  if (t.startsWith("**Check**:") && t.length < 80) return false;
  return true;
}

/** Format a fix-overlay callout for EXECUTIVE_FIX_NOTES slot. */
export function formatFixNoteCallout(opts: {
  title: string;
  body: string;
  expectedImpact?: string;
  validation?: string;
}): string {
  const lines = ["> [!NOTE]", `> **${opts.title}**: ${opts.body}`];
  if (opts.expectedImpact) lines.push(`> **Expected impact**: ${opts.expectedImpact}`);
  if (opts.validation) lines.push(`> **Validation**: ${opts.validation}`);
  return lines.join("\n");
}

/** Format test-specific insight as `[!NOTE]` inside collapsed ledger. */
export function formatTestInsightNote(insight: string, codePaths: string[]): string {
  const clean = insight.replace(/^>\s*/gm, "").trim();
  const paths =
    codePaths.length > 0
      ? `\n> **Check**: ${codePaths
          .slice(0, 2)
          .map((p) => `\`${p}\``)
          .join(" \u00B7 ")}`
      : "";
  return `> [!NOTE]\n> **Specific to this test**: ${clean}${paths}`;
}

/** Collapsed ledger block — summary line visible, truth table inside `<details>`. */
export function buildCollapsedLedgerTagInner(opts: {
  tag: string;
  label: string;
  testPath: string;
  avgMs: number;
  icon: string;
  deltaPct: number;
  trendLabel: string;
  insight?: string;
  truth?: string;
}): string {
  const relPath = `../../../${opts.testPath.replace(/\\/g, "/")}`;
  const avg = opts.avgMs > 0 ? `${opts.avgMs.toFixed(3)}ms` : "\u23F3 pending";
  const arrow = trendArrow(opts.deltaPct);
  const opening = [
    `<details id="section-${opts.tag.toLowerCase()}">`,
    `<summary><strong>\u{1F3F7}\uFE0F ${opts.label}</strong> \u00B7 ${opts.icon} ${avg} \u00B7 ${arrow} ${opts.trendLabel} \u00B7 <a href="${relPath}">source</a></summary>`,
    "",
  ].join("\n");

  let body = opening;
  if (opts.insight && isSpecificInsight(opts.insight)) {
    body += `${LEDGER_MARKERS.insight[0]}\n${opts.insight}\n${LEDGER_MARKERS.insight[1]}\n\n`;
  }
  body += [
    LEDGER_MARKERS.truth[0],
    opts.truth ?? "> \u23F3 Pending \u2014 run benchmarks to populate.",
    LEDGER_MARKERS.truth[1],
    "",
    "</details>",
  ].join("\n");
  return body;
}

export function buildQuadrantChart(entries: TestRollupEntry[]): string {
  const candidates = entries.filter(
    (e) =>
      e.avgMs > 0 &&
      (e.severity === "regression" ||
        e.severity === "critical" ||
        e.severity === "warning" ||
        Math.abs(e.deltaPct) > 8),
  );
  if (candidates.length === 0) return "";

  const maxDelta = Math.max(...candidates.map((e) => Math.abs(e.deltaPct)), 20);
  const maxMs = Math.max(...candidates.map((e) => e.avgMs), 1);

  const points = candidates.slice(0, 8).map((e) => {
    const x = Math.min(0.95, Math.max(0.05, e.avgMs / maxMs));
    const y = Math.min(0.95, Math.max(0.05, Math.abs(e.deltaPct) / maxDelta));
    const safeName = e.label.replace(/"/g, "'").slice(0, 28);
    return `    ${safeName}: [${x.toFixed(2)}, ${y.toFixed(2)}]`;
  });

  return [
    "<details>",
    "<summary>\u{1F4CA} Regression severity matrix (quadrant)</summary>",
    "",
    "```mermaid",
    "quadrantChart",
    '  title "Regression severity (impact vs delta)"',
    "  x-axis Low latency impact --> High latency impact",
    "  y-axis Low delta --> High delta",
    "  quadrant-1 Monitor",
    "  quadrant-2 Investigate soon",
    "  quadrant-3 Acceptable variance",
    "  quadrant-4 Critical — fix first",
    ...points,
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

export function buildDimensionRollupTable(entries: TestRollupEntry[]): string {
  const dims = LEDGER_DIMENSION_ORDER;
  const rollups: DimensionRollup[] = dims.map((dimension) => {
    const children = entries.filter((e) => mapSectionToDimension(e.section) === dimension);
    const issues = children.filter(
      (e) => e.severity === "critical" || e.severity === "regression" || e.severity === "warning",
    );
    const worst = children.reduce(
      (max, e) => (Math.abs(e.deltaPct) > Math.abs(max.deltaPct) ? e : max),
      { deltaPct: 0, icon: "\u{1F7E2}" } as TestRollupEntry,
    );
    const status = issues.some((i) => i.severity === "critical" || i.severity === "regression")
      ? "\u{1F534}"
      : issues.length > 0
        ? "\u{1F7E1}"
        : children.length > 0
          ? "\u{1F7E2}"
          : "\u26AA";
    const worstDelta =
      worst.deltaPct !== 0
        ? `${worst.deltaPct >= 0 ? "+" : ""}${worst.deltaPct.toFixed(0)}%`
        : "\u2014";
    return {
      dimension,
      testCount: children.length,
      status,
      worstDelta,
      issueCount: issues.length,
    };
  });

  let table = `### Dimension health\n\n`;
  table += `| Dimension | Tests | Status | Worst \u0394 | Issues |\n`;
  table += `|-----------|------:|--------|----------|--------|\n`;
  for (const r of rollups) {
    table += `| **${r.dimension}** | ${r.testCount} | ${r.status} | ${r.worstDelta} | ${r.issueCount} |\n`;
  }
  return `${table}\n`;
}

export function buildIssuesTable(entries: TestRollupEntry[]): string {
  const issues = entries
    .filter(
      (e) =>
        e.severity === "critical" ||
        e.severity === "regression" ||
        e.severity === "warning" ||
        e.icon === "\u{1F534}" ||
        e.icon === "\u{1F7E1}",
    )
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  if (issues.length === 0) {
    return `### Issues (action required)\n\n> \u2705 **All clear** \u2014 no regressions or budget violations detected.\n\n`;
  }

  let table = `### Issues (action required)\n\n`;
  table += `| Test | Status | \u0394 | Budget | Likely cause | Expected? | Owner | Detail |\n`;
  table += `|------|--------|-----|--------|--------------|-----------|-------|--------|\n`;
  for (const row of issues) {
    const delta =
      row.baselineMs > 0
        ? `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(0)}% (${row.baselineMs.toFixed(2)}\u2192${row.avgMs.toFixed(2)}ms)`
        : row.trendLabel;
    const name = row.label.replace(/\|/g, "\\|");
    const cause = (row.likelyCause || "\u2014").replace(/\|/g, "\\|");
    table += `| ${name} | ${row.icon} | ${delta} | ${row.budgetLabel} | ${cause} | ${row.expected} | ${row.owner} | [\u2193](#section-${row.tag.toLowerCase()}) |\n`;
  }
  return `${table}\n`;
}

export function buildCompactLatencyMatrix(rows: ExecutiveReportInput["latencyRows"]): string {
  let block = `### Executive latency matrix\n\n`;
  block += `| Scenario | Latency | Trend | Budget | Result |\n`;
  block += `|----------|---------|-------|--------|--------|\n`;
  for (const row of rows) {
    block += `| **${row.scenario}** | ${row.latency} | ${row.trend} | ${row.budget} | ${row.result} |\n`;
  }
  return `${block}\n`;
}

export function buildHistoricalPulse(dbType: string, redis: boolean): string {
  const testIds = [
    ...new Set(["api-latency", "auth-performance", "cold-start-phased", "database-performance"]),
  ];
  let block = `### Historical pulse\n\n`;
  block += `> **Scope:** Sparklines only \u2014 full run tables: [\`${HISTORY_SQLITE_PATH}\`](../../../${HISTORY_SQLITE_PATH})\n\n`;
  block += `| Metric | Trend | Sparkline | Latest |\n`;
  block += `|--------|-------|-----------|--------|\n`;

  for (const testId of testIds) {
    for (const phase of ["warm", "cold"] as const) {
      // Use primary metric to avoid mixing BULK INSERT (~3ms) with INSERT (~0.1ms) in sparklines
      const primaryMetric = loadPrimaryMetricForTest(testId, dbType, redis, phase);
      const history = loadHistory(testId, dbType, redis, phase, primaryMetric ?? undefined);
      if (history.length === 0) continue;
      const samples = history.map((h) => h.avgMs);
      const latest = history[history.length - 1]!;
      const metricLabel = primaryMetric ? ` (${primaryMetric})` : "";
      const label = `${testId.replace(/-/g, " ")}${metricLabel} (${phase})`;
      block += `| ${label} | \u{1F7E2} | \`${renderSparkline(samples)}\` | ${latest.avgMs.toFixed(3)}ms |\n`;
    }
  }
  return `${block}\n`;
}

export function buildMermaidTrendChart(dbLabel: string, points: number[]): string {
  const padded = [...points];
  if (padded.length > 0) {
    while (padded.length < 10) padded.unshift(padded[0]!);
  } else {
    padded.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
  const series = padded
    .slice(-10)
    .map((p) => p.toFixed(3))
    .join(", ");
  return [
    `<details>`,
    `<summary>\u{1F4C8} Latency trend chart (last 10 runs)</summary>`,
    "",
    "```mermaid",
    "xychart-beta",
    `  title "${dbLabel} REST p95 (last 10 runs)"`,
    '  x-axis ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]',
    '  y-axis "Latency (ms)"',
    `  line "p95" : [${series}]`,
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

export function buildHostEnvironmentTable(hostInfo: Record<string, string>): string {
  return [
    "## \u{1F52C} Host environment",
    "",
    "| Host | Platform | Arch | Cores | RAM | Runtime |",
    "|------|----------|------|------:|-----|---------|",
    `| ${hostInfo.hostname ?? "unknown"} | ${hostInfo.platform ?? "\u2014"} | ${hostInfo.arch ?? "\u2014"} | ${hostInfo.cpus ?? "\u2014"} | ${hostInfo.memory ?? "\u2014"} | ${hostInfo.runtime ?? "\u2014"} |`,
    "",
  ].join("\n");
}

/** Build rollup rows from a single benchmark invocation (standalone / partial). */
export function buildTestRollupEntriesFromRun(
  rows: Array<{
    testFile: string;
    metric: string;
    avgMs: number;
    p95Ms?: number;
    rps?: number;
    layer?: string;
    section?: string;
  }>,
  db: string,
  redis: boolean,
  tagResolver: (testFile: string, shortLabel?: string) => string | null,
): TestRollupEntry[] {
  const entries: TestRollupEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const testFile = row.testFile.replace(/\\/g, "/");
    const testId = testFile.replace(/^tests\/benchmarks\//, "").replace(/\.test\.ts$/i, "");
    const key = `${testFile}:${row.metric}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tag = tagResolver(testFile, row.layer) ?? testId.toUpperCase().replace(/-/g, "_");
    // Metric-keyed history: never trend BULK INSERT against INSERT baseline
    const history = loadHistory(testId, db, redis, "warm", row.metric);
    const prior = history.slice(0, -1);
    const trend = analyzeTrend(
      { name: row.metric, avgMs: row.avgMs, p95Ms: row.p95Ms || 0, rps: row.rps || 0 },
      prior.length > 0 ? prior : history,
      testId,
      db,
      redis,
      "warm",
    );
    const rootCause = classifyRootCause(
      trend.deltaPct,
      trend.p95DeltaPct,
      trend.rpsDeltaPct,
      true,
      trend.sampleSize,
    );
    const baselineMs = prior.length > 0 ? prior[prior.length - 1]!.avgMs : row.avgMs;
    const label = row.layer || testId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    entries.push({
      tag,
      label,
      shortLabel: row.layer || label,
      path: testFile,
      section: row.section || "baseline",
      avgMs: row.avgMs,
      baselineMs,
      deltaPct: trend.deltaPct,
      severity: trend.severity,
      icon:
        trend.severity === "critical" || trend.severity === "regression"
          ? "\u{1F534}"
          : trend.severity === "warning" || trend.severity === "watch"
            ? "\u{1F7E1}"
            : "\u{1F7E2}",
      trendLabel: trend.label,
      likelyCause: rootCause.insight.match(/`([^`]+)`/)?.[1] ?? "\u2014",
      budgetLabel: "< 5ms",
      codePaths: [],
      expected: trend.severity === "regression" ? "NO \u2014 investigate" : "\u2014",
      owner: trend.severity === "regression" ? "@backend" : "\u2014",
    });
  }
  return entries;
}

/** Assemble progressive-disclosure EXECUTIVE body (no duplicate ledger data). */
export function buildExecutiveReport(input: ExecutiveReportInput): string {
  const passIcon = input.status === "SUCCESS" ? "\u2705 PASS" : "\u274C FAIL";
  const hist = input.isHistorical ? " *(historical snapshot)*" : "";
  const partial = input.isPartial ? " *(partial invocation)*" : "";

  let body = input.warningBox ?? "";
  if (input.isPartial && !body.includes("Partial")) {
    body += `> [!NOTE]\n> **Partial update** — dimension rollups and issues reflect only tests invoked in this run.\n\n`;
  }
  body += `**${passIcon}**${hist}${partial} \u00B7 ${input.recorded}/${input.total} tests`;
  if (input.skipped > 0) body += ` \u00B7 ${input.skipped} skipped`;
  body += ` \u00B7 **${input.dbLabel}** \u00B7 ${input.hostLine}\n\n`;

  if (input.existingFixNotes?.trim()) {
    body += `${input.existingFixNotes.trim()}\n\n`;
  }

  body += buildDimensionRollupTable(input.testEntries);
  body += buildIssuesTable(input.testEntries);
  body += buildCompactLatencyMatrix(input.latencyRows);
  body += buildHistoricalPulse(
    input.dbLabel.replace("-redis", "").replace("_redis", ""),
    input.dbLabel.includes("redis"),
  );
  body += buildMermaidTrendChart(input.dbLabel, input.mermaidPoints);
  body += buildQuadrantChart(input.testEntries);

  return body.trimEnd();
}

/** Wrap infrastructure trend blocks in a single collapsed section. */
export function wrapInfrastructureCollapse(content: string): string {
  if (!content.trim()) return "";
  return [
    "<details>",
    "<summary>\u{1F4CA} Infrastructure drill-down (expand for adapter, hooks, memory trends)</summary>",
    "",
    content.trim(),
    "",
    "</details>",
    "",
  ].join("\n");
}
