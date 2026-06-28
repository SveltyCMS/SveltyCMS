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

async function parseMdxReport(filePath: string): Promise<DbSummary | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const dbName = path.basename(filePath, ".mdx").replace("benchmark_", "").replace(/_/g, "-");

    // Extract summary status
    const statusMatch = content.match(
      /## 📊 Summary.+?(\u2705 PASS|\u23F3 INCOMPLETE|\uD83D\uDD34 WARN)/u,
    );
    const status = statusMatch ? statusMatch[1].replace(/[✅⏳🔴]/gu, "").trim() : "?";

    // Extract core benchmark values from the summary table
    const truthMatch = content.match(/Truth.*?\|\s*([\d.]+)/);
    const truth = truthMatch ? `${truthMatch[1]}ms` : "-";

    const coldMatch = content.match(/Cold.*?\|\s*([\d.]+)/);
    const cold = coldMatch ? `${coldMatch[1]}ms` : "-";

    const hooksMatch = content.match(/Hooks Pipeline.*?\|\s*([\d.]+)/);
    const hooks = hooksMatch ? `${hooksMatch[1]}ms` : "-";

    const insertMatch = content.match(/INSERT\s*\|\s*([\d.]+)/);
    const insert = insertMatch ? `${insertMatch[1]}ms` : "-";

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
    const icon = r.status === "PASS" ? "✅" : r.status.includes("WARN") ? "🔴" : "⏳";
    md += `| **${r.db.toUpperCase()}** | ${r.coldStart} | ${r.truthHttp} | ${r.crudInsert} | ${r.hooks} | ${icon} ${r.status} |\n`;
  }

  // Write to GITHUB_STEP_SUMMARY if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  console.log(md);
}

main().catch(console.error);
