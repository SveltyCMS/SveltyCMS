#!/usr/bin/env bun
/**
 * @file scripts/ci/ci-report-all-green.ts
 * @description Job-level CI dashboard for the all-green gate.
 *
 * Reads RESULT_* env vars (job outcomes) and writes GITHUB_STEP_SUMMARY +
 * ::error annotations listing what failed and what to open first.
 *
 * Usage (from all-green job):
 *   RESULT_BUILD=success RESULT_E2E=failure bun run scripts/ci/ci-report-all-green.ts
 */

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Outcome = "success" | "failure" | "cancelled" | "skipped" | "unknown";

interface GateMetric {
  label: string;
  current: number;
  baseline: number | null;
  changePct: number | null;
  budget: number;
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

const JOBS: Array<{ key: string; label: string; fix: string }> = [
  {
    key: "RESULT_BOOTSTRAP",
    label: "bootstrap",
    fix: "Deps / codegen / test-secret generation failed — re-run workflow from start",
  },
  {
    key: "RESULT_BUILD",
    label: "build",
    fix: "Production build failed — check TypeScript/Vite logs; COMPILE_ALL_ADAPTERS=true",
  },
  {
    key: "RESULT_WHITEBOX",
    label: "whitebox (format/lint/check/unit/…)",
    fix: "Run `bun run format --check`, `bun run lint`, `bun run check`, `bun run test:unit` locally",
  },
  {
    key: "RESULT_E2E_PREP",
    label: "e2e-prep (wizard + auth-setup)",
    fix: "Open playwright-report-Wizard-Auth + preview-log-prep; verify admin.json has auth_sessions",
  },
  {
    key: "RESULT_E2E",
    label: "e2e shards",
    fix: "Open failed shard job summary + playwright-report-* + preview-log-*; start with first ::error annotation",
  },
  {
    key: "RESULT_DB_TESTS",
    label: "db-tests (4 adapters)",
    fix: "Open 📋 DB Summary + db-results-*; fix adapter-specific contract/API failures",
  },
  {
    key: "RESULT_BENCH_CORE",
    label: "bench-core (performance gate)",
    fix: "Open the 📊 Bench job log; fix the budget breach or regression, or re-run if it is runner noise",
  },
];

function outcome(v: string | undefined): Outcome {
  const s = (v || "unknown").toLowerCase();
  if (s === "success" || s === "failure" || s === "cancelled" || s === "skipped") return s;
  return "unknown";
}

function icon(o: Outcome): string {
  switch (o) {
    case "success":
      return "✅";
    case "failure":
      return "❌";
    case "cancelled":
      return "🚫";
    case "skipped":
      return "⏭️";
    default:
      return "❔";
  }
}

/** Gate reports uploaded by the bench matrix (`benchmark-gate-*` artifacts). */
function readGateReports(): GateReport[] {
  const dir = path.resolve("tests/benchmarks/results/gates");
  if (!existsSync(dir)) return [];

  const reports: GateReport[] = [];
  for (const entry of readdirSync(dir)) {
    if (!/^gate-report-[a-z0-9-]+\.json$/i.test(entry)) continue;
    try {
      const report = JSON.parse(readFileSync(path.join(dir, entry), "utf8")) as GateReport;
      if (report && Array.isArray(report.metrics)) reports.push(report);
    } catch {
      /* malformed report — skip */
    }
  }
  return reports.sort((a, b) => a.db.localeCompare(b.db));
}

function buildGateSection(reports: readonly GateReport[]): string {
  if (reports.length === 0) return "";

  let md = `### 🚦 Performance gate\n\n`;
  md += `| Adapter | Policy | Baseline | Failures | Warnings | Verdict |\n`;
  md += `| :--- | :--- | :--- | ---: | ---: | :--- |\n`;
  for (const report of reports) {
    const verdict =
      report.status === "fail" ? "🔴 fail" : report.status === "warn" ? "🟠 warn" : "🟢 pass";
    const baseline = report.baselineRuns === 0 ? "building" : `${report.baselineRuns} prior run(s)`;
    md += `| **${report.db.toUpperCase()}** | \`${report.policy}\` | ${baseline} | ${report.failures} | ${report.warnings} | ${verdict} |\n`;
  }

  const flagged = reports.flatMap((report) =>
    report.metrics
      .filter((metric) => metric.severity !== "ok")
      .map((metric) => ({ db: report.db, metric })),
  );
  if (flagged.length > 0) {
    md += `\n| Adapter | Metric | Current | Baseline | Δ | Budget | Verdict |\n`;
    md += `| :--- | :--- | ---: | ---: | ---: | ---: | :--- |\n`;
    for (const { db, metric } of flagged) {
      const baseline = metric.baseline === null ? "—" : `${metric.baseline.toFixed(3)}ms`;
      const change =
        metric.changePct === null
          ? "—"
          : `${metric.changePct >= 0 ? "+" : ""}${metric.changePct.toFixed(0)}%`;
      const verdict = metric.severity === "fail" ? "🔴 fail" : "🟠 warn";
      md += `| ${db} | ${metric.label} | ${metric.current.toFixed(3)}ms | ${baseline} | ${change} | ${metric.budget}ms | ${verdict} |\n`;
    }
  }

  return `${md}\n`;
}

function main(): number {
  const rows = JOBS.map((j) => {
    const o = outcome(process.env[j.key]);
    return { ...j, outcome: o };
  });

  const failed = rows.filter((r) => r.outcome === "failure" || r.outcome === "cancelled");
  const passed = rows.filter((r) => r.outcome === "success");
  const skipped = rows.filter((r) => r.outcome === "skipped");

  let md = `## ${failed.length ? "❌" : "✅"} All-Green Gate\n\n`;
  md += `| Job | Result |\n|-----|--------|\n`;
  for (const r of rows) {
    md += `| ${icon(r.outcome)} **${r.label}** | \`${r.outcome}\` |\n`;
  }
  md += `\n`;
  md += `| Summary | Count |\n|---------|-------|\n`;
  md += `| Passed | ${passed.length} |\n`;
  md += `| Failed / cancelled | ${failed.length} |\n`;
  md += `| Skipped | ${skipped.length} |\n\n`;

  if (failed.length > 0) {
    md += `### Fix order (fastest path)\n\n`;
    failed.forEach((f, i) => {
      md += `${i + 1}. **${f.label}** — ${f.fix}\n`;
      console.log(`::error title=${f.label} failed::${f.fix}`);
    });
    md += `\n_Expand the failed job’s **Summary** tab for pass/fail tables and error snippets._\n\n`;
  } else {
    md += `_All required jobs succeeded._\n\n`;
  }

  const gateReports = readGateReports();
  const gateWarnings = gateReports.reduce((sum, report) => sum + report.warnings, 0);
  const gateFailures = gateReports.reduce((sum, report) => sum + report.failures, 0);
  if (gateReports.length > 0) {
    const gateIcon = gateFailures > 0 ? "🔴" : gateWarnings > 0 ? "🟠" : "🟢";
    md += `_Performance gate: ${gateIcon} ${gateFailures} failure(s), ${gateWarnings} warning(s) across ${gateReports.length} adapter(s). See the table below._\n\n`;
    md += buildGateSection(gateReports);
  }

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, md, "utf8");
  else console.log(md);

  return failed.length > 0 ? 1 : 0;
}

process.exit(main());
