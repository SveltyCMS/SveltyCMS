/**
 * @file scripts/check/check-flake-budget.ts
 * @description Enforce an explicit flake-rate budget for Playwright runs.
 *
 * CI currently retries failed specs, which hides a retried-pass ("flaky")
 * result. This script turns the JSON report into a gate: a run may recover at
 * most `--max-flaky` tests, and (for suites large enough to make a rate
 * meaningful) at most `--max-flake-rate` percent of executed tests.
 *
 * Usage:
 *   bun run flake:budget
 *   bun run flake:budget -- --json=tests/playwright-results.json --max-flaky=2
 *   bun run flake:budget -- --summary-dir=tests/test-results --max-flake-rate=2
 *
 * Features:
 * - reads a single Playwright JSON report or all `playwright-summary-*.json`
 * - falls back to walking suites when `stats` is absent
 * - writes a Markdown table to GITHUB_STEP_SUMMARY when running in CI
 * - `--allow-missing` keeps the gate quiet when the run crashed before writing
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

interface Totals {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

interface Budget {
  maxFlaky: number;
  maxFlakeRate: number;
}

function arg(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const value = Number.parseFloat(arg(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

/** Count test outcomes from suite nodes when `stats` is unavailable. */
function walkSuites(node: any, totals: Totals): void {
  if (!node) return;

  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
        const results = Array.isArray(test.results) ? test.results : [];
        const last = results[results.length - 1];
        const status: string = last?.status ?? test.status ?? "unknown";
        const retried = results.some((r: any) => r.status === "failed" || r.status === "timedOut");

        if (status === "passed" || status === "expected") {
          if (retried) totals.flaky += 1;
          else totals.passed += 1;
        } else if (status === "skipped") {
          totals.skipped += 1;
        } else {
          totals.failed += 1;
        }
      }
    }
  }

  for (const suite of Array.isArray(node.suites) ? node.suites : []) walkSuites(suite, totals);
}

function readReport(path: string): Totals {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const data = JSON.parse(raw);
  const stats = data.stats ?? {};

  if (typeof stats.expected === "number") {
    return {
      passed: (stats.expected ?? 0) + (stats.flaky ?? 0),
      failed: stats.unexpected ?? 0,
      flaky: stats.flaky ?? 0,
      skipped: stats.skipped ?? 0,
    };
  }

  const totals: Totals = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  for (const suite of Array.isArray(data.suites) ? data.suites : []) walkSuites(suite, totals);
  return totals;
}

function sum(a: Totals, b: Totals): Totals {
  return {
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    flaky: a.flaky + b.flaky,
    skipped: a.skipped + b.skipped,
  };
}

function writeSummary(md: string): void {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, md, "utf8");
  console.log(md);
}

function evaluate(totals: Totals, budget: Budget): { ok: boolean; reasons: string[] } {
  const executed = totals.passed + totals.failed;
  const rate = executed > 0 ? (totals.flaky / executed) * 100 : 0;
  const reasons: string[] = [];

  if (totals.flaky > budget.maxFlaky) {
    reasons.push(`flaky ${totals.flaky} > budget ${budget.maxFlaky}`);
  }
  // A rate is only meaningful once the suite has enough cases; small shards
  // would otherwise fail on a single retry.
  if (executed >= 20 && rate > budget.maxFlakeRate) {
    reasons.push(`flake rate ${rate.toFixed(2)}% > budget ${budget.maxFlakeRate}%`);
  }

  return { ok: reasons.length === 0, reasons };
}

function main(): number {
  const jsonPath = arg("json", join(process.cwd(), "tests", "playwright-results.json"));
  const summaryDir = arg("summary-dir", "");
  const maxFlaky = numberArg("max-flaky", 2);
  const maxFlakeRate = numberArg("max-flake-rate", 2);
  const allowMissing = hasFlag("allow-missing");

  let totals: Totals = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  let reports = 0;

  if (summaryDir) {
    if (!existsSync(summaryDir)) {
      if (allowMissing) {
        console.log(`[flake-budget] no report directory at ${summaryDir} — skipped`);
        return 0;
      }
      console.error(`[flake-budget] report directory not found: ${summaryDir}`);
      return 1;
    }
    const files = readdirSync(summaryDir).filter(
      (name) => name.startsWith("playwright-summary-") && name.endsWith(".json"),
    );
    for (const file of files) {
      totals = sum(totals, readReport(join(summaryDir, file)));
      reports += 1;
    }
    if (files.length === 0 && !allowMissing) {
      console.error(`[flake-budget] no playwright-summary-*.json files in ${summaryDir}`);
      return 1;
    }
  } else {
    if (!existsSync(jsonPath)) {
      if (allowMissing) {
        console.log(`[flake-budget] no report at ${jsonPath} — skipped`);
        return 0;
      }
      console.error(`[flake-budget] report not found: ${jsonPath}`);
      return 1;
    }
    totals = readReport(jsonPath);
    reports = 1;
  }

  const executed = totals.passed + totals.failed;
  const rate = executed > 0 ? (totals.flaky / executed) * 100 : 0;
  const { ok, reasons } = evaluate(totals, { maxFlaky, maxFlakeRate });

  const icon = ok ? "✅" : "❌";
  const md =
    `## ${icon} Flake budget\n\n` +
    `| Metric | Value |\n|--------|-------|\n` +
    `| Reports | ${reports} |\n` +
    `| Passed | ${totals.passed} |\n` +
    `| Failed | ${totals.failed} |\n` +
    `| Flaky (retried-pass) | ${totals.flaky} |\n` +
    `| Flake rate | ${rate.toFixed(2)}% |\n` +
    `| Budget | ≤${maxFlaky} flaky · ≤${maxFlakeRate}% |\n\n`;

  writeSummary(md);

  if (!ok) {
    console.error(`[flake-budget] budget exceeded — ${reasons.join("; ")}`);
    console.log(`::error title=Flake budget::${reasons.join("; ")}`);
    return 1;
  }

  console.log(`[flake-budget] within budget (${totals.flaky} flaky, ${rate.toFixed(2)}%)`);
  return 0;
}

process.exit(main());
