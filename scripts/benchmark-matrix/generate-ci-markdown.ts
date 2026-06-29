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

async function parseMdxReport(filePath: string): Promise<DbSummary | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const dbName = path.basename(filePath, ".mdx").replace("benchmark_", "").replace(/_/g, "-");

    // Extract summary status.
    // Format A (stale MDX from previous failed run):   **Status:** ❌ FAIL
    // Format B (fresh rebuildSummary output):          **Status:** 15/20 tests recorded · 3 skipped
    // Format C (fresh with explicit status):           **Status:** PASS
    let status = "⏳";

    // Try Format A/C first: explicit PASS/FAIL/WARN/INCOMPLETE keyword
    const explicitMatch = content.match(
      /\*\*Status:\*\*\s*(?:[^\w\s]*)\s*(PASS|FAIL|WARN|INCOMPLETE)/i,
    );
    if (explicitMatch) {
      status = explicitMatch[1].toUpperCase();
    } else {
      // Try Format B: "X/Y tests recorded" — derive status from regression sections
      const recordedMatch = content.match(/\*\*Status:\*\*\s*(\d+)\/(\d+)\s+tests recorded/i);
      if (recordedMatch) {
        const recorded = parseInt(recordedMatch[1], 10);
        const total = parseInt(recordedMatch[2], 10);
        // Check if the Needs Attention section has actual entries (not just the header)
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

    // Extract core benchmark values from the summary table
    const truthMatch = content.match(/\|\s*\*\*REST \(Collections\)\*\*\s*\|\s*([^\s|]+)/i);
    const truth = truthMatch ? formatValue(truthMatch[1]) : "-";

    const coldMatch = content.match(/\|\s*\*\*Cold Start\*\*\s*\|\s*([^\s|]+)/i);
    const cold = coldMatch ? formatValue(coldMatch[1]) : "-";

    const hooksMatch = content.match(/\|\s*\*\*Middleware Hooks\*\*\s*\|\s*([^\s|]+)/i);
    const hooks = hooksMatch ? formatValue(hooksMatch[1]) : "-";

    const insertMatch = content.match(/\|\s*\*\*DB Raw \(p95\)\*\*\s*\|\s*([^\s|]+)/i);
    const insert = insertMatch ? formatValue(insertMatch[1]) : "-";

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
