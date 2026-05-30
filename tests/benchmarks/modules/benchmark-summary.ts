/**
 * @file tests/benchmark./modules/benchmark-summary.ts
 * @description Ranked executive summary for benchmark reports.
 *
 * Analyzes results across all dimensions and produces a ranked list of:
 * - Top regressions (sorted by severity × delta)
 * - Largest improvements
 * - Noisy/unstable tests (high CV)
 * - Likely shared root cause clusters
 * - Recommended files/subsystems to inspect
 */
import { loadHistory } from "./benchmark-history";
import { PER_DIMENSION_BUDGETS } from "./benchmark-mdx";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface RankedAlert {
  testId: string;
  dbType: string;
  phase: string;
  severity: "stable" | "watch" | "warning" | "regression";
  deltaPct: number;
  p95DeltaPct: number;
  currentAvg: number;
  baselineAvg: number;
  sampleSize: number;
  budgetViolation?: string;
}

export interface SharedCause {
  cause: string;
  affectedTests: string[];
  confidence: "suspected" | "confirmed";
  recommendation: string;
}

export interface NoiseReport {
  testId: string;
  dbType: string;
  cv: number; // coefficient of variation
  sampleSize: number;
  status: "stable" | "noisy";
}

export interface ExecutiveSummary {
  /** When this summary was generated */
  generatedAt: string;
  /** Which databases are included */
  databases: string[];
  /** Total tests analyzed */
  totalTests: number;
  /** Whether this is a partial or full run */
  mode: "partial" | "full";

  /** Top regressions — sorted by severity × delta */
  topRegressions: RankedAlert[];
  /** Largest improvements */
  topImprovements: RankedAlert[];
  /** Noisy tests with high variance */
  noisyTests: NoiseReport[];
  /** Likely shared root cause clusters */
  sharedCauses: SharedCause[];
  /** Top files/subsystems to investigate */
  recommendedFiles: string[];
}

// ─────────────────────────────────────────────────────────────
// Severity helpers
// ─────────────────────────────────────────────────────────────

function severityRank(severity: string): number {
  switch (severity) {
    case "regression":
      return 4;
    case "warning":
      return 3;
    case "watch":
      return 2;
    default:
      return 1;
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "regression":
      return "\u{1F534}";
    case "warning":
      return "\u{1F7E0}";
    case "watch":
      return "\u{1F7E1}";
    default:
      return "\u26AA";
  }
}

// ─────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────

/**
 * Build a ranked executive summary from history data across all tracked tests.
 */
export function buildExecutiveSummary(
  trackedTests: Array<{
    testId: string;
    dbType: string;
    phase: string;
    redisEnabled: boolean;
  }>,
  isPartial: boolean,
): ExecutiveSummary {
  const alerts: RankedAlert[] = [];
  const improvements: RankedAlert[] = [];
  const noiseReports: NoiseReport[] = [];

  for (const t of trackedTests) {
    const history = loadHistory(t.testId, t.dbType, t.redisEnabled, t.phase, 20);
    if (history.length < 2) continue;

    // Compute baseline (rolling median of last 10, excluding current)
    const baseline = history.slice(0, Math.min(10, history.length));
    const med = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s.length > 0 ? s[Math.floor(s.length / 2)] : 0;
    };

    const bAvg = med(baseline.map((h) => h.avgMs));
    const bP95 = med(baseline.filter((h) => h.p95Ms > 0).map((h) => h.p95Ms));
    const current = history[0]; // most recent
    const pct = (c: number, b: number) => (b > 0 ? ((c - b) / b) * 100 : 0);

    const dAvg = pct(current.avgMs, bAvg);
    const dP95 = pct(current.p95Ms, bP95);
    const ad = Math.abs(dAvg);

    // Severity classification
    let severity: RankedAlert["severity"] = "stable";
    if (ad > 20) severity = "regression";
    else if (ad > 10) severity = "warning";
    else if (ad > 5) severity = "watch";

    // Budget check
    let budgetViolation: string | undefined;
    const budgets = PER_DIMENSION_BUDGETS[t.dbType.toLowerCase()];
    if (budgets) {
      const dimKey = `${t.phase}_avg`;
      const dim = budgets[dimKey];
      if (dim && current.avgMs > dim.budget) {
        budgetViolation = `${dim.desc}: ${current.avgMs.toFixed(2)}ms > ${dim.budget}ms`;
      }
    }

    const alert: RankedAlert = {
      testId: t.testId,
      dbType: t.dbType,
      phase: t.phase,
      severity,
      deltaPct: dAvg,
      p95DeltaPct: dP95,
      currentAvg: current.avgMs,
      baselineAvg: bAvg,
      sampleSize: history.length,
      budgetViolation,
    };

    if (dAvg > 5) {
      alerts.push(alert);
    } else if (dAvg < -3) {
      improvements.push(alert);
    }

    // Noise detection
    if (history.length >= 5) {
      const cvs = history.map((h) => h.cv).filter((c) => c > 0);
      const avgCv = cvs.length > 0 ? cvs.reduce((a, b) => a + b, 0) / cvs.length : 0;
      if (avgCv > 20) {
        noiseReports.push({
          testId: t.testId,
          dbType: t.dbType,
          cv: avgCv,
          sampleSize: history.length,
          status: "noisy",
        });
      }
    }
  }

  // Sort: regressions by severity × abs(delta); improvements by abs(delta)
  alerts.sort(
    (a, b) =>
      severityRank(b.severity) * Math.abs(b.deltaPct) -
      severityRank(a.severity) * Math.abs(a.deltaPct),
  );
  improvements.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  noiseReports.sort((a, b) => b.cv - a.cv);

  // Detect shared causes (tests with same severity + same DB)
  const causeClusters: Map<string, string[]> = new Map();
  for (const a of alerts) {
    if (a.severity === "stable" || a.severity === "watch") continue;
    const key = `${a.dbType}/${a.severity}`;
    if (!causeClusters.has(key)) causeClusters.set(key, []);
    causeClusters.get(key)!.push(a.testId);
  }

  const sharedCauses: SharedCause[] = [];
  for (const [key, tests] of causeClusters) {
    if (tests.length < 2) continue;
    const [dbType] = key.split("/");
    const isSingleDB = causeClusters.size === 1;

    sharedCauses.push({
      cause: isSingleDB
        ? `All regressions isolated to ${dbType.toUpperCase()} — likely adapter-specific`
        : `Multiple databases affected — likely shared CMS logic or middleware`,
      affectedTests: tests,
      confidence: isSingleDB ? "confirmed" : "suspected",
      recommendation: isSingleDB
        ? `Check src/databases/${dbType}/crud-methods.ts and adapter-core.ts`
        : "Check src/hooks.server.ts and shared middleware pipeline",
    });
  }

  // Collect recommended files from the top alerts
  const recommendedFiles: string[] = [];
  // Top 3 regressions' DBs
  for (const a of alerts.slice(0, 3)) {
    const file = `src/databases/${a.dbType}/crud-methods.ts`;
    if (!recommendedFiles.includes(file)) recommendedFiles.push(file);
  }
  if (sharedCauses.length > 0 && sharedCauses[0].confidence === "suspected") {
    if (!recommendedFiles.includes("src/hooks.server.ts"))
      recommendedFiles.push("src/hooks.server.ts");
  }

  return {
    generatedAt: new Date().toISOString(),
    databases: [...new Set(trackedTests.map((t) => t.dbType))],
    totalTests: trackedTests.length,
    mode: isPartial ? "partial" : "full",
    topRegressions: alerts.slice(0, 10),
    topImprovements: improvements.slice(0, 5),
    noisyTests: noiseReports.slice(0, 5),
    sharedCauses,
    recommendedFiles,
  };
}

/**
 * Format the executive summary as an MDX block suitable for report insertion.
 */
export function formatSummaryAsMdx(summary: ExecutiveSummary): string {
  const lines: string[] = [];

  lines.push(
    `> Generated: ${summary.generatedAt.slice(0, 16)} | ${summary.totalTests} tests | ${summary.databases.length} databases`,
  );

  if (summary.mode === "partial") {
    lines.push("> \u{1F4CB} **Partial report** — run full matrix for complete cross-DB analysis.");
  }

  // Top regressions
  if (summary.topRegressions.length > 0) {
    lines.push("");
    lines.push("### \u{1F534} Top Regressions");
    for (const r of summary.topRegressions.slice(0, 5)) {
      const icon = severityIcon(r.severity);
      const dir = r.deltaPct > 0 ? "+" : "";
      lines.push(
        `> **${icon} ${r.testId}** (${r.dbType}/${r.phase}): ${dir}${r.deltaPct.toFixed(0)}% avg, ${r.sampleSize} runs | ${r.currentAvg.toFixed(2)}ms vs ${r.baselineAvg.toFixed(2)}ms baseline`,
      );
      if (r.budgetViolation) {
        lines.push(`>   \u26A0 Budget: ${r.budgetViolation}`);
      }
    }
  }

  // Shared causes
  if (summary.sharedCauses.length > 0) {
    lines.push("");
    lines.push("### \u{1F50D} Likely Shared Causes");
    for (const sc of summary.sharedCauses.slice(0, 3)) {
      const conf = sc.confidence === "confirmed" ? "\u2705 confirmed" : "\u{1F50D} suspected";
      lines.push(`> **${conf}**: ${sc.cause}`);
      lines.push(`>   Affected: ${sc.affectedTests.join(", ")}`);
      lines.push(`>   **Action**: ${sc.recommendation}`);
    }
  }

  // Top improvements
  if (summary.topImprovements.length > 0) {
    lines.push("");
    lines.push("### \u{1F7E2} Top Improvements");
    for (const imp of summary.topImprovements.slice(0, 3)) {
      lines.push(
        `> **${imp.testId}** (${imp.dbType}): ${imp.deltaPct.toFixed(0)}% faster | ${imp.currentAvg.toFixed(2)}ms (was ${imp.baselineAvg.toFixed(2)}ms)`,
      );
    }
  }

  // Noisy tests
  if (summary.noisyTests.length > 0) {
    lines.push("");
    lines.push("### \u{1F4CA} Noisy / Unstable Tests");
    for (const n of summary.noisyTests.slice(0, 3)) {
      lines.push(
        `> **${n.testId}** (${n.dbType}): CV ${n.cv.toFixed(1)}% over ${n.sampleSize} runs — consider increasing iterations`,
      );
    }
  }

  // Recommended files
  if (summary.recommendedFiles.length > 0) {
    lines.push("");
    lines.push("### \u{1F4C2} Files to Investigate");
    lines.push("> " + summary.recommendedFiles.map((f) => "`" + f + "`").join(" · "));
  }

  return lines.join("\n");
}
