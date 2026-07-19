#!/usr/bin/env bun
/**
 * @file scripts/ci-report-all-green.ts
 * @description Job-level CI dashboard for the all-green gate.
 *
 * Reads RESULT_* env vars (job outcomes) and writes GITHUB_STEP_SUMMARY +
 * ::error annotations listing what failed and what to open first.
 *
 * Usage (from all-green job):
 *   RESULT_BUILD=success RESULT_E2E=failure bun run scripts/ci-report-all-green.ts
 */

import { appendFileSync } from "node:fs";

type Outcome = "success" | "failure" | "cancelled" | "skipped" | "unknown";

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
    key: "RESULT_E2E_MATRIX",
    label: "e2e-matrix",
    fix: "Matrix generator failed — check .github/workflows/e2e-matrix.ts",
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

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, md, "utf8");
  else console.log(md);

  return failed.length > 0 ? 1 : 0;
}

process.exit(main());
