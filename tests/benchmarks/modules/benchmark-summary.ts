/**
 * @file tests/benchmarks/modules/benchmark-summary.ts
 * @description Ranked executive summary for benchmark reports (Optimized)
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
  cv: number;
  sampleSize: number;
  status: "stable" | "noisy";
}

export interface ExecutiveSummary {
  generatedAt: string;
  databases: string[];
  totalTests: number;
  mode: "partial" | "full";
  topRegressions: RankedAlert[];
  topImprovements: RankedAlert[];
  noisyTests: NoiseReport[];
  sharedCauses: SharedCause[];
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

// Pre-allocate structural mappings for reuse inside median loops
/** Compute in-place median from Float64Array slice without heap copy */
function fastMedian(buf: Float64Array, length: number): number {
  if (length === 0) return 0;
  const slice = buf.subarray(0, length);
  slice.sort(); // Native typed array sort — no GC churn
  return slice[Math.floor(length / 2)]!;
}

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
  const uniqueDbs = new Set<string>();

  // Pre-allocate explicit scratch buffers to insulate timing analytics loops from memory allocations
  // Pre-allocate fixed typed-array scratch buffers — zero GC allocation in hot loop
  const avgScratchBuffer = new Float64Array(10);
  const p95ScratchBuffer = new Float64Array(10);

  for (let i = 0; i < trackedTests.length; i++) {
    const t = trackedTests[i]!;
    uniqueDbs.add(t.dbType);

    const history = loadHistory(t.testId, t.dbType, t.redisEnabled, t.phase, 20);
    const historyLen = history.length;
    if (historyLen < 2) continue;

    const current = history[0]!;
    const baselineLimit = Math.min(10, historyLen);

    // Populate allocation-free primitive buffers natively
    let avgCount = 0;
    let p95Count = 0;

    for (let j = 0; j < baselineLimit; j++) {
      const h = history[j]!;
      avgScratchBuffer[j] = h.avgMs;
      if (h.p95Ms > 0) {
        p95ScratchBuffer[p95Count++] = h.p95Ms;
      }
      avgCount++;
    }

    // Direct typed-array sort — avoids Array.from() heap allocation entirely
    const bAvg = fastMedian(avgScratchBuffer, avgCount);
    const bP95 = fastMedian(p95ScratchBuffer, p95Count);

    const dAvg = bAvg > 0 ? ((current.avgMs - bAvg) / bAvg) * 100 : 0;
    const dP95 = bP95 > 0 ? ((current.p95Ms - bP95) / bP95) * 100 : 0;
    const ad = Math.abs(dAvg);

    let severity: RankedAlert["severity"] = "stable";
    if (ad > 20) severity = "regression";
    else if (ad > 10) severity = "warning";
    else if (ad > 5) severity = "watch";

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
      sampleSize: historyLen,
      budgetViolation,
    };

    if (dAvg > 5) {
      alerts.push(alert);
    } else if (dAvg < -3) {
      improvements.push(alert);
    }

    if (historyLen >= 5) {
      let cvSum = 0;
      let validCvCount = 0;
      for (let j = 0; j < historyLen; j++) {
        const cvVal = history[j]!.cv;
        if (cvVal > 0) {
          cvSum += cvVal;
          validCvCount++;
        }
      }
      const avgCv = validCvCount > 0 ? cvSum / validCvCount : 0;
      if (avgCv > 20) {
        noiseReports.push({
          testId: t.testId,
          dbType: t.dbType,
          cv: avgCv,
          sampleSize: historyLen,
          status: "noisy",
        });
      }
    }
  }

  alerts.sort(
    (a, b) =>
      severityRank(b.severity) * Math.abs(b.deltaPct) -
      severityRank(a.severity) * Math.abs(a.deltaPct),
  );
  improvements.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  noiseReports.sort((a, b) => b.cv - a.cv);

  // Structural maps using composite object layouts rather than splittable string keys
  const causeClusters = new Map<string, string[]>();
  for (let i = 0; i < alerts.length; i++) {
    const a = alerts[i]!;
    if (a.severity === "stable" || a.severity === "watch") continue;
    const key = `${a.dbType}/${a.severity}`;

    let cluster = causeClusters.get(key);
    if (!cluster) {
      cluster = [];
      causeClusters.set(key, cluster);
    }
    cluster.push(a.testId);
  }

  const sharedCauses: SharedCause[] = [];
  const isSingleDB = causeClusters.size === 1;

  for (const [key, tests] of causeClusters.entries()) {
    if (tests.length < 2) continue;
    const slashIdx = key.indexOf("/");
    const extractedDbType = slashIdx !== -1 ? key.substring(0, slashIdx) : key;

    sharedCauses.push({
      cause: isSingleDB
        ? `All regressions isolated to ${extractedDbType.toUpperCase()} — likely adapter-specific`
        : `Multiple databases affected — likely shared CMS logic or middleware`,
      affectedTests: tests,
      confidence: isSingleDB ? "confirmed" : "suspected",
      recommendation: isSingleDB
        ? `Check src/databases/${extractedDbType}/crud-methods.ts and adapter-core.ts`
        : "Check src/hooks.server.ts and shared middleware pipeline",
    });
  }

  const recommendedFiles: string[] = [];
  const regressionLimit = Math.min(3, alerts.length);
  for (let i = 0; i < regressionLimit; i++) {
    const file = `src/databases/${alerts[i]!.dbType}/crud-methods.ts`;
    if (!recommendedFiles.includes(file)) recommendedFiles.push(file);
  }

  if (sharedCauses.length > 0 && sharedCauses[0]!.confidence === "suspected") {
    if (!recommendedFiles.includes("src/hooks.server.ts")) {
      recommendedFiles.push("src/hooks.server.ts");
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    databases: Array.from(uniqueDbs),
    totalTests: trackedTests.length,
    mode: isPartial ? "partial" : "full",
    topRegressions: alerts.slice(0, 10),
    topImprovements: improvements.slice(0, 5),
    noisyTests: noiseReports.slice(0, 5),
    sharedCauses,
    recommendedFiles,
  };
}

export function formatSummaryAsMdx(summary: ExecutiveSummary): string {
  const lines: string[] = [];

  lines.push(
    `> Generated: ${summary.generatedAt.slice(0, 16)} | ${summary.totalTests} tests | ${summary.databases.length} databases`,
  );

  if (summary.mode === "partial") {
    lines.push("> \u{1F4CB} **Partial report** — run full matrix for complete cross-DB analysis.");
  }

  if (summary.topRegressions.length > 0) {
    lines.push("");
    lines.push("### \u{1F534} Top Regressions");
    const displayLimit = Math.min(5, summary.topRegressions.length);
    for (let i = 0; i < displayLimit; i++) {
      const r = summary.topRegressions[i]!;
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

  if (summary.sharedCauses.length > 0) {
    lines.push("");
    lines.push("### \u{1F50D} Likely Shared Causes");
    const displayLimit = Math.min(3, summary.sharedCauses.length);
    for (let i = 0; i < displayLimit; i++) {
      const sc = summary.sharedCauses[i]!;
      const conf = sc.confidence === "confirmed" ? "\u2705 confirmed" : "\u{1F50D} suspected";
      lines.push(`> **${conf}**: ${sc.cause}`);
      lines.push(`>   Affected: ${sc.affectedTests.join(", ")}`);
      lines.push(`>   **Action**: ${sc.recommendation}`);
    }
  }

  if (summary.topImprovements.length > 0) {
    lines.push("");
    lines.push("### \u{1F7E2} Top Improvements");
    const displayLimit = Math.min(3, summary.topImprovements.length);
    for (let i = 0; i < displayLimit; i++) {
      const imp = summary.topImprovements[i]!;
      lines.push(
        `> **${imp.testId}** (${imp.dbType}): ${imp.deltaPct.toFixed(0)}% faster | ${imp.currentAvg.toFixed(2)}ms (was ${imp.baselineAvg.toFixed(2)}ms)`,
      );
    }
  }

  if (summary.noisyTests.length > 0) {
    lines.push("");
    lines.push("### \u{1F4CA} Noisy / Unstable Tests");
    const displayLimit = Math.min(3, summary.noisyTests.length);
    for (let i = 0; i < displayLimit; i++) {
      const n = summary.noisyTests[i]!;
      lines.push(
        `> **${n.testId}** (${n.dbType}): CV ${n.cv.toFixed(1)}% over ${n.sampleSize} runs — consider increasing iterations`,
      );
    }
  }

  if (summary.recommendedFiles.length > 0) {
    lines.push("");
    lines.push("### \u{1F4C2} Files to Investigate");
    let joinedFiles = "";
    for (let i = 0; i < summary.recommendedFiles.length; i++) {
      joinedFiles +=
        "`" +
        summary.recommendedFiles[i] +
        "`" +
        (i < summary.recommendedFiles.length - 1 ? " · " : "");
    }
    lines.push("> " + joinedFiles);
  }

  return lines.join("\n");
}
