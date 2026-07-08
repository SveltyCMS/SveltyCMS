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

  // Write to GITHUB_STEP_SUMMARY if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  console.log(md);
}

main().catch(console.error);
