/**
 * @file scripts/benchmark-matrix/generate-ci-markdown.ts
 * @description Reads benchmark MDX reports and generates a compact CI summary
 * table for GitHub Actions ($GITHUB_STEP_SUMMARY).
 *
 * Called from ci.yml after bench-core completes.
 * Outputs a human-readable markdown table comparing performance across all
 * tested database adapters.
 */
import fs from "node:fs/promises";
import path from "node:path";

const REPORTS_DIR = path.resolve("docs/project/benchmarks");

interface DbSummary {
  db: string;
  coldStart: string;
  truthHttp: string;
  crudInsert: string;
  hooks: string;
  status: string;
}

interface GateMetric {
  label: string;
  current: number;
  baseline: number | null;
  changePct: number | null;
  budget: number;
  budgetExceeded: boolean;
  severity: "ok" | "warn" | "fail";
  reason: string | null;
}

interface GateReport {
  db: string;
  policy: "warn" | "fail";
  passed: boolean;
  status: "pass" | "warn" | "fail";
  baselineRuns: number;
  metrics: GateMetric[];
  warnings: number;
  failures: number;
}

function formatValue(val: string): string {
  if (!val || val === "-" || val.toUpperCase() === "N/A") return "N/A";
  // Remove existing 'ms' suffix if present, to avoid doubling it
  const clean = val.replace(/ms$/i, "");
  if (/^\d+(\.\d+)?$/.test(clean)) return `${clean}ms`;
  return val;
}

function findValue(content: string, keywords: string[]): string {
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const columns = line.split("|").map((c) => c.trim());
    if (columns.length < 3) continue;
    const firstCol = columns[1].replace(/[*\s]/g, "").toLowerCase();

    for (const keyword of keywords) {
      const cleanKeyword = keyword.replace(/[*\s]/g, "").toLowerCase();
      if (firstCol.includes(cleanKeyword)) {
        for (let i = 2; i < columns.length; i++) {
          const colVal = columns[i].replace(/[*\s]/g, "");
          if (colVal && colVal !== "-" && /^\d+(\.\d+)?(ms)?$/i.test(colVal)) {
            return formatValue(colVal);
          }
        }
      }
    }
  }
  return "-";
}

async function parseMdxReport(filePath: string): Promise<DbSummary | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const dbName = path.basename(filePath, ".mdx").replace("benchmark_", "").replace(/_/g, "-");

    // Extract summary status.
    let status = "⏳";

    // Try finding PASS/FAIL/WARN/INCOMPLETE status keywords with or without **Status:** prefix
    let explicitMatch = content.match(
      /\*\*Status:\*\*\s*(?:[^\w\s]*)\s*(PASS|FAIL|WARN|INCOMPLETE)/i,
    );
    if (!explicitMatch) {
      explicitMatch = content.match(/\*\*(?:[^\w\s]*)\s*(PASS|FAIL|WARN|INCOMPLETE)\*\*/i);
    }

    if (explicitMatch) {
      status = explicitMatch[1].toUpperCase();
    } else {
      let recordedMatch = content.match(/\*\*Status:\*\*\s*(\d+)\/(\d+)\s+tests recorded/i);
      if (!recordedMatch) {
        recordedMatch = content.match(/(\d+)\/(\d+)\s+tests/i);
      }
      if (recordedMatch) {
        const recorded = parseInt(recordedMatch[1], 10);
        const total = parseInt(recordedMatch[2], 10);
        const needsAttentionSection = content.match(
          /###\s+⚠️\s+Needs Attention\s*\n\n\|\s*Metric\s*\|/i,
        );
        const hasRegressions = needsAttentionSection !== null;

        if (recorded === 0) {
          status = "INCOMPLETE";
        } else if (hasRegressions) {
          status = "FAIL";
        } else if (recorded < total) {
          status = "WARN";
        } else {
          status = "PASS";
        }
      }
    }

    // Extract core benchmark values from the report
    const truth = findValue(content, [
      "REST (Collections)",
      "REST API PERFORMANCE",
      "HTTP End-to-End",
      "System",
      "Truth Latency",
    ]);
    const cold = findValue(content, ["Cold Start", "Phased Cold Start", "Cold"]);
    const hooks = findValue(content, ["Middleware Hooks", "HOOKS PERFORMANCE", "Middleware"]);
    const insert = findValue(content, ["DB Raw (p95)", "DATABASE PERFORMANCE", "INSERT", "DB Raw"]);

    return {
      db: dbName,
      coldStart: cold,
      truthHttp: truth,
      crudInsert: insert,
      hooks: hooks,
      status,
    };
  } catch {
    return null;
  }
}

/**
 * Aggregate the per-adapter gate reports emitted by `ci-regression-gate.ts`.
 * Returns an empty string when benchmarks were skipped (no reports uploaded).
 */
async function buildGateSection(): Promise<string> {
  const dirs = [
    path.resolve("tests/benchmarks/results/gates"),
    path.resolve("tests/benchmarks/results"),
    REPORTS_DIR,
  ];
  const seen = new Set<string>();
  const reports: GateReport[] = [];

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match =
        /^gate-report-([a-z0-9-]+)\.json$/i.exec(entry) ?? /^gate_([a-z0-9-]+)\.json$/i.exec(entry);
      if (!match) continue;
      const db = match[1]!;
      if (seen.has(db)) continue;
      try {
        const report = JSON.parse(await fs.readFile(path.join(dir, entry), "utf8")) as GateReport;
        if (!report || !Array.isArray(report.metrics)) continue;
        seen.add(db);
        reports.push(report);
      } catch {
        /* malformed report — skip */
      }
    }
  }

  if (reports.length === 0) return "";
  reports.sort((a, b) => a.db.localeCompare(b.db));

  let md = "\n## 🚦 Performance Gate\n\n";
  md += "| Database | Policy | Baseline | Failures | Warnings | Verdict |\n";
  md += "| :--- | :--- | :--- | ---: | ---: | :--- |\n";
  for (const report of reports) {
    const icon = report.status === "fail" ? "🔴" : report.status === "warn" ? "🟠" : "🟢";
    const baseline = report.baselineRuns === 0 ? "building" : `${report.baselineRuns} prior run(s)`;
    md += `| **${report.db.toUpperCase()}** | \`${report.policy}\` | ${baseline} | ${report.failures} | ${report.warnings} | ${icon} ${report.status} |\n`;
  }

  const flagged = reports.flatMap((report) =>
    report.metrics
      .filter((metric) => metric.severity !== "ok")
      .map((metric) => ({ db: report.db, metric })),
  );

  if (flagged.length === 0) {
    return `${md}\nNo budget breaches or drift beyond the thresholds.\n`;
  }

  md += "\n| Database | Metric | Current | Baseline | Δ | Budget | Verdict |\n";
  md += "| :--- | :--- | ---: | ---: | ---: | ---: | :--- |\n";
  for (const { db, metric } of flagged) {
    const baseline = metric.baseline === null ? "—" : `${metric.baseline.toFixed(3)}ms`;
    const change =
      metric.changePct === null
        ? "—"
        : `${metric.changePct >= 0 ? "+" : ""}${metric.changePct.toFixed(0)}%`;
    const icon = metric.severity === "fail" ? "🔴" : "🟠";
    md += `| ${db} | ${metric.label} | ${metric.current.toFixed(3)}ms | ${baseline} | ${change} | ${metric.budget}ms | ${icon} ${metric.severity} |\n`;
  }

  return `${md}\n`;
}

async function main() {
  const reports = ["sqlite", "mariadb", "postgresql", "mongodb"];
  const results: DbSummary[] = [];

  for (const db of reports) {
    const filePath = path.join(REPORTS_DIR, `benchmark_${db}.mdx`);
    const summary = await parseMdxReport(filePath);
    if (summary) results.push(summary);
  }

  if (results.length === 0) {
    console.log("No benchmark reports found.");
    return;
  }

  let md = "## 📊 Core Performance Audit\n\n";
  md += "| Database | Cold Start | HTTP E2E | INSERT | Hooks | Status |\n";
  md += "| :--- | :--- | :--- | :--- | :--- | :--- |\n";

  for (const r of results) {
    const icon =
      r.status === "PASS"
        ? "✅"
        : r.status === "FAIL"
          ? "❌"
          : r.status.includes("WARN")
            ? "🔴"
            : "⏳";
    md += `| **${r.db.toUpperCase()}** | ${r.coldStart} | ${r.truthHttp} | ${r.crudInsert} | ${r.hooks} | ${icon} ${r.status} |\n`;
  }

  md += await buildGateSection();

  // Write to GITHUB_STEP_SUMMARY if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  console.log(md);
}

main().catch(console.error);
