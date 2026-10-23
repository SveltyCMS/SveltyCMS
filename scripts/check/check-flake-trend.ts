#!/usr/bin/env bun
/**
 * @file scripts/check/check-flake-trend.ts
 * @description Rolling flake-rate gate over the last N days of Playwright runs.
 *
 * `check-flake-budget.ts` gates a single run, which makes a small shard
 * statistically meaningless: 1 flaky test out of 29 executed is 3.45 % and
 * trips a 3 % budget even though it is noise. This script records every run in
 * `tests/e2e/.flake-history.jsonl` and gates the *rolling* rate instead, so a
 * one-off retry is absorbed by the window while a persistent flake is not.
 *
 * Usage:
 *   bun run scripts/check/check-flake-trend.ts --append=tests/playwright-results.json --label="E2E — shard 3"
 *   bun run scripts/check/check-flake-trend.ts --check
 *   bun run scripts/check/check-flake-trend.ts --check --window-days=7 --max-rate=1 --max-flaky=0
 *   bun run scripts/check/check-flake-trend.ts --allow-missing --check
 *
 * Features:
 * - one JSONL line per run: `{ at, label, executed, flaky, failed }`
 * - rolling window (`--window-days`, default 7) with per-run + total table
 * - fail-closed only when `--check` is passed (append-only runs never gate)
 * - tolerates a missing or corrupt history (warns, keeps the valid lines)
 * - `--allow-missing` treats an absent/unparseable report as "no new data"
 *   (the accumulated window is still gated by `--check`)
 * - appends a Markdown table to GITHUB_STEP_SUMMARY when set
 * - reads Playwright JSON with the same stats/suite-walk strategy as
 *   `check-flake-budget.ts`
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname =
  typeof import.meta.dirname !== "undefined"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const DEFAULT_HISTORY = join(ROOT, "tests", "e2e", ".flake-history.jsonl");
const DAY_MS = 86_400_000;
/** Keep the console/Markdown table readable when the window holds many shards. */
const MAX_TABLE_ROWS = 40;

interface Totals {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

interface HistoryEntry {
  at: string;
  label: string;
  executed: number;
  flaky: number;
  failed: number;
}

interface WindowStats {
  runs: number;
  executed: number;
  failed: number;
  flaky: number;
  rate: number;
}

function arg(name: string, fallback = ""): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const value = Number.parseFloat(arg(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Count test outcomes from suite nodes when `stats` is unavailable. */
function walkSuites(node: unknown, totals: Totals): void {
  if (!isRecord(node)) return;

  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      if (!isRecord(spec)) continue;
      const tests = Array.isArray(spec.tests) ? spec.tests : [];

      for (const test of tests) {
        if (!isRecord(test)) continue;
        const results = Array.isArray(test.results) ? test.results : [];
        const last = results.length > 0 ? results[results.length - 1] : undefined;
        const lastStatus =
          isRecord(last) && typeof last.status === "string" ? last.status : undefined;
        const status = lastStatus ?? (typeof test.status === "string" ? test.status : "unknown");
        const retried = results.some(
          (result) =>
            isRecord(result) && (result.status === "failed" || result.status === "timedOut"),
        );

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

  if (Array.isArray(node.suites)) {
    for (const suite of node.suites) walkSuites(suite, totals);
  }
}

/** Mirrors the report parsing in `check-flake-budget.ts` (that module exits on import).
 * `passed` intentionally excludes `flaky` in both branches so `executed`
 * (`passed + failed + flaky`) stays consistent — Playwright's `stats.expected`
 * already omits flaky, while the suite walk counts it separately. The resulting
 * rate is identical to the per-run budget's stats path.
 */
function readReport(path: string): Totals {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const data: unknown = JSON.parse(raw);

  if (!isRecord(data)) return { passed: 0, failed: 0, flaky: 0, skipped: 0 };

  const stats = isRecord(data.stats) ? data.stats : undefined;
  if (stats && typeof stats.expected === "number") {
    return {
      passed: count(stats.expected),
      failed: count(stats.unexpected),
      flaky: count(stats.flaky),
      skipped: count(stats.skipped),
    };
  }

  const totals: Totals = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  if (Array.isArray(data.suites)) {
    for (const suite of data.suites) walkSuites(suite, totals);
  }
  return totals;
}

function readHistory(path: string): { entries: HistoryEntry[]; malformed: number } {
  if (!existsSync(path)) return { entries: [], malformed: 0 };

  let raw: string;
  try {
    raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  } catch (error) {
    console.warn(`[flake-trend] cannot read ${path} — treating as empty (${String(error)})`);
    return { entries: [], malformed: 0 };
  }

  const entries: HistoryEntry[] = [];
  let malformed = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!isRecord(parsed)) throw new Error("line is not an object");

      const at = parsed.at;
      const executed = parsed.executed;
      const flaky = parsed.flaky;
      const failed = parsed.failed;
      if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) {
        throw new Error("invalid `at`");
      }
      if (
        typeof executed !== "number" ||
        typeof flaky !== "number" ||
        typeof failed !== "number" ||
        !Number.isFinite(executed) ||
        !Number.isFinite(flaky) ||
        !Number.isFinite(failed)
      ) {
        throw new Error("invalid counters");
      }

      entries.push({
        at,
        label: typeof parsed.label === "string" && parsed.label ? parsed.label : "unknown",
        executed,
        flaky,
        failed,
      });
    } catch {
      malformed += 1;
    }
  }

  return { entries, malformed };
}

function appendEntry(path: string, entry: HistoryEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

function rate(flaky: number, executed: number): number {
  return executed > 0 ? (flaky / executed) * 100 : 0;
}

function summarise(entries: HistoryEntry[]): WindowStats {
  const executed = entries.reduce((sum, entry) => sum + entry.executed, 0);
  const flaky = entries.reduce((sum, entry) => sum + entry.flaky, 0);
  const failed = entries.reduce((sum, entry) => sum + entry.failed, 0);
  return { runs: entries.length, executed, flaky, failed, rate: rate(flaky, executed) };
}

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** Keep a label from breaking the Markdown table. */
function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function printTable(entries: HistoryEntry[], window: WindowStats): void {
  const omitted = Math.max(0, entries.length - MAX_TABLE_ROWS);
  const shown = omitted > 0 ? entries.slice(-MAX_TABLE_ROWS) : entries;

  const header = ["At", "Label", "Executed", "Failed", "Flaky", "Rate"];
  const rows = shown.map((entry) => [
    entry.at,
    entry.label,
    String(entry.executed),
    String(entry.failed),
    String(entry.flaky),
    formatRate(rate(entry.flaky, entry.executed)),
  ]);
  rows.push([
    "TOTAL",
    `${window.runs} run${window.runs === 1 ? "" : "s"}`,
    String(window.executed),
    String(window.failed),
    String(window.flaky),
    formatRate(window.rate),
  ]);

  const all = [header, ...rows];
  const widths = header.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? "").length)),
  );

  if (omitted > 0) console.log(`   … ${omitted} earlier run(s) omitted\n`);
  for (const row of all) {
    console.log(
      row
        .map((cell, column) =>
          column <= 1 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]),
        )
        .join("  "),
    );
  }
}

function markdownTable(entries: HistoryEntry[], window: WindowStats, windowDays: number): string {
  const omitted = Math.max(0, entries.length - MAX_TABLE_ROWS);
  const shown = omitted > 0 ? entries.slice(-MAX_TABLE_ROWS) : entries;
  const lines = [
    `| At | Label | Executed | Failed | Flaky | Rate |`,
    `|---|---|---:|---:|---:|---:|`,
    ...(omitted > 0 ? [`| … | *${omitted} earlier run(s) omitted* | | | | |`] : []),
    ...shown.map(
      (entry) =>
        `| ${mdCell(entry.at)} | ${mdCell(entry.label)} | ${entry.executed} | ${entry.failed} | ${entry.flaky} | ${formatRate(rate(entry.flaky, entry.executed))} |`,
    ),
    `| **Total** | **${window.runs} run${window.runs === 1 ? "" : "s"} / ${windowDays}d** | **${window.executed}** | **${window.failed}** | **${window.flaky}** | **${formatRate(window.rate)}** |`,
  ];
  return lines.join("\n");
}

function writeSummary(markdown: string): void {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) {
    try {
      appendFileSync(target, markdown, "utf8");
    } catch (error) {
      console.warn(`[flake-trend] cannot write GITHUB_STEP_SUMMARY (${String(error)})`);
    }
  }
}

function main(): number {
  const reportArg = arg("append", "");
  const historyPath = resolve(arg("history", DEFAULT_HISTORY));
  const windowDays = Math.max(0, numberArg("window-days", 7));
  const maxRate = numberArg("max-rate", 1);
  const maxFlaky = numberArg("max-flaky", 0);
  const gate = hasFlag("check");
  const allowMissing = hasFlag("allow-missing");
  const label =
    arg("label", process.env.FLAKE_LABEL || process.env.GITHUB_JOB || "local").trim() || "local";

  if (reportArg) {
    const reportPath = resolve(reportArg);
    if (!existsSync(reportPath)) {
      if (!allowMissing) {
        console.error(`[flake-trend] report not found: ${reportPath}`);
        return 1;
      }
      console.warn(`[flake-trend] no report at ${reportPath} — not appending`);
    } else {
      let totals: Totals | null = null;
      try {
        totals = readReport(reportPath);
      } catch (error) {
        if (!allowMissing) {
          console.error(`[flake-trend] cannot parse ${reportPath}: ${String(error)}`);
          return 1;
        }
        console.warn(`[flake-trend] cannot parse ${reportPath} — not appending`);
      }

      if (totals) {
        const executed = totals.passed + totals.failed + totals.flaky;
        const entry: HistoryEntry = {
          // Standalone script: `@utils/date` pulls `$app/state`, which does not
          // resolve under plain `bun` — keep the history self-contained.
          at: new Date().toISOString(),
          label,
          executed,
          flaky: totals.flaky,
          failed: totals.failed,
        };
        appendEntry(historyPath, entry);
        console.log(
          `[flake-trend] appended ${label}: ${entry.flaky} flaky / ${entry.executed} executed (${formatRate(rate(entry.flaky, entry.executed))})`,
        );
      }
    }
  }

  const { entries, malformed } = readHistory(historyPath);
  if (malformed > 0) {
    console.warn(`[flake-trend] ignored ${malformed} corrupt line(s) in ${historyPath}`);
  }

  const cutoff = Date.now() - windowDays * DAY_MS;
  const windowed = entries
    .filter((entry) => Date.parse(entry.at) >= cutoff)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const window = summarise(windowed);

  const icon = window.rate > maxRate || window.flaky > maxFlaky ? "❌" : "✅";
  console.log(
    `\n${icon} Flake trend — ${windowDays}-day window · ${window.runs} run${window.runs === 1 ? "" : "s"} · ` +
      `${window.executed} executed · ${window.flaky} flaky · ${window.failed} failed · ${formatRate(window.rate)}`,
  );
  console.log(
    `   Budget: ≤${maxFlaky} flaky · ≤${maxRate}% (${gate ? "gating" : "report only"})\n`,
  );

  if (windowed.length > 0) {
    printTable(windowed, window);
  } else {
    console.log("   (no runs inside the window)");
  }
  console.log("");

  const reasons: string[] = [];
  if (window.flaky > maxFlaky) {
    reasons.push(`flaky ${window.flaky} > budget ${maxFlaky}`);
  }
  if (window.rate > maxRate) {
    reasons.push(`flake rate ${formatRate(window.rate)} > budget ${maxRate}%`);
  }

  const body =
    `## ${icon} Flake trend (${windowDays}-day rolling)\n\n` +
    (windowed.length > 0
      ? `${markdownTable(windowed, window, windowDays)}\n\n`
      : "_No runs inside the window._\n\n") +
    `**Budget:** ≤${maxFlaky} flaky · ≤${maxRate}% over ${windowDays} days — ` +
    (reasons.length > 0 ? `exceeded: ${reasons.join("; ")}` : "within budget") +
    `\n`;
  writeSummary(body);

  if (!gate) return 0;

  if (reasons.length > 0) {
    console.error(`[flake-trend] budget exceeded — ${reasons.join("; ")}`);
    console.log(`::error title=Flake trend::${reasons.join("; ")}`);
    return 1;
  }

  console.log(`[flake-trend] within budget (${window.flaky} flaky, ${formatRate(window.rate)})`);
  return 0;
}

process.exit(main());
