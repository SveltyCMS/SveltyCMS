#!/usr/bin/env bun
/**
 * @file scripts/precheck.ts
 * @description
 * Unified local precheck runner — single manifest for push and full CI parity.
 *
 * Tiers:
 *   push → pre-push hook: static analysis, unit tests, build (+ conditional lints)
 *          Heavy DB integration + benchmarks are CI-only (opt in with --include-db-tasks).
 *   full → optional manual run (static + unit + build + DB matrix + benchmarks).
 *
 * Usage:
 *   bun run verify:push                        # push tier (default)
 *   bun run scripts/precheck.ts --plan         # explain what WOULD run
 *   bun run scripts/precheck.ts --tier=push --include-db-tasks
 *   bun run scripts/precheck.ts --tier=full --db=postgresql
 *
 * ### Features:
 * - mirrors ci.yml db-tests and bench-core before code reaches GitHub
 * - change-aware skipping on push tier
 * - Docker reachability checks for network adapters
 * - progress dashboard with adaptive ETA and detailed error summary
 * - --plan / --explain mode for dry-run task inspection
 */

import { INTEGRATION_DB_MATRIX, type IntegrationDbType } from "../src/utils/test-db-credentials.ts";
import {
  analyzeChanges,
  buildPrecheckTasks,
  ensureTestSecret,
  getChangedPaths,
  getPrecheckPlan,
  resolveActiveTasks,
  validateCiParity,
  getLastCommandOutput,
  clearLastCommandOutput,
  type PrecheckOptions,
  type PrecheckTier,
  type Task,
} from "./precheck-shared.ts";

const VALID_DBS = INTEGRATION_DB_MATRIX;

function parseArgs(): PrecheckOptions & { plan?: boolean } {
  const argv = process.argv.slice(2);

  const tierArg = argv.find((a) => a.startsWith("--tier="))?.slice("--tier=".length);
  const tier: PrecheckTier = tierArg === "full" ? "full" : "push";

  const singleDb = argv.find((a) => a.startsWith("--db="))?.slice("--db=".length) as
    | IntegrationDbType
    | undefined;

  if (singleDb && !VALID_DBS.includes(singleDb)) {
    console.error(`❌ Invalid --db="${singleDb}". Valid: ${VALID_DBS.join(", ")}`);
    process.exit(1);
  }

  return {
    tier,
    skipBenchmarks: argv.includes("--skip-benchmarks"),
    singleDb,
    includeDbTasks: argv.includes("--include-db-tasks"),
    includeSqliteOnPush: argv.includes("--include-sqlite"),
    plan: argv.includes("--plan") || argv.includes("--explain"),
  };
}

export interface PrecheckResult {
  passed: boolean;
  failedTasks: string[];
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

const BOX_WIDTH = 62;
const BAR_WIDTH = 10;

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m${secs}s`;
}

function formatEta(ms: number): string {
  if (ms <= 0) return "~<1s";
  if (ms < 60000) return `~${Math.ceil(ms / 1000)}s`;
  const mins = Math.ceil(ms / 60000);
  return `~${mins}m`;
}

function renderProgressBar(completed: number, total: number): string {
  const pct = total > 0 ? completed / total : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

interface TaskResult {
  name: string;
  passed: boolean;
  elapsedMs: number;
  remediation?: string;
}

// ── ANSI helpers ──

const TTY = process.stdout.isTTY;
const C = {
  reset: TTY ? "\x1b[0m" : "",
  green: TTY ? "\x1b[32m" : "",
  red: TTY ? "\x1b[31m" : "",
  yellow: TTY ? "\x1b[33m" : "",
  bold: TTY ? "\x1b[1m" : "",
  dim: TTY ? "\x1b[2m" : "",
};

function colorStatus(text: string, passed: boolean): string {
  return passed ? `${C.green}${text}${C.reset}` : `${C.red}${text}${C.reset}`;
}

function printResultTable(results: TaskResult[]): void {
  const totalMs = results.reduce((s, r) => s + r.elapsedMs, 0);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${C.bold}📊 Precheck Results${C.reset}\n`);
  console.log("┌──────────────────────────────────────────────┬────────┬──────────┐");
  console.log("│ Check                                        │ Status │ Time     │");
  console.log("├──────────────────────────────────────────────┼────────┼──────────┤");

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const status = colorStatus(r.passed ? " PASS " : " FAIL ", r.passed);
    const time = formatTime(r.elapsedMs).padEnd(8);
    const name = r.name.padEnd(44);
    console.log(`│ ${icon} ${name}│ ${status} │ ${time} │`);
  }

  console.log("├──────────────────────────────────────────────┼────────┼──────────┤");
  const summaryLine = `${passed} passed · ${failed} failed · ${formatTime(totalMs)} total`;
  console.log(`│ ${summaryLine.padEnd(44)} │        │          │`);
  console.log("└──────────────────────────────────────────────┴────────┴──────────┘\n");

  if (failed > 0) {
    console.log(`${C.bold}### ⚠️  Needs Attention${C.reset}`);
    for (const r of results.filter((r) => !r.passed)) {
      if (r.remediation) {
        console.log(
          `  ${C.red}❌${C.reset} ${r.name} ${C.dim}(${formatTime(r.elapsedMs)})${C.reset}`,
        );
        console.log(`     ${C.yellow}→ Run: ${r.remediation}${C.reset}`);
      } else {
        console.log(
          `  ${C.red}❌${C.reset} ${r.name} ${C.dim}(${formatTime(r.elapsedMs)})${C.reset}`,
        );
      }
    }
    console.log();
  }
}

function renderDashboard(
  tierLabel: string,
  results: TaskResult[],
  currentTask: string | null,
  pendingTasks: Task[],
  estimatedRemainingMs: number,
  previousLineCount: number = 0,
): number {
  // Move cursor up to overwrite the previous dashboard in-place.
  // \x1b[2J (clear screen) is silently ignored on Windows PowerShell 5.1,
  // but cursor-up + clear-to-end works reliably on all terminals.
  if (previousLineCount > 0 && TTY) {
    process.stdout.write(`\x1b[${previousLineCount}A\x1b[J`);
  }

  const total = results.length + (currentTask ? 1 : 0) + pendingTasks.length;
  const completed = results.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const bar = renderProgressBar(completed, total);
  const eta = formatEta(estimatedRemainingMs);
  const title = `SveltyCMS ${tierLabel}`;
  const contentW = BOX_WIDTH - 4;

  // Build the dashboard as a single string so we can count lines
  const lines: string[] = [];
  lines.push(`╔${"═".repeat(BOX_WIDTH - 2)}╗`);

  const titleLine = `${title} — ${completed}/${total} tasks · ${bar} ${pct}% · ${eta}`;
  const titlePad = contentW - titleLine.length;
  lines.push(`║  ${titleLine}${" ".repeat(Math.max(0, titlePad))}║`);
  lines.push(`╠${"═".repeat(BOX_WIDTH - 2)}╣`);

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const timeStr = `(${formatTime(r.elapsedMs)})`;
    const left = `${icon} ${r.name}`;
    const pad = contentW - left.length - timeStr.length;
    lines.push(`║  ${left}${" ".repeat(Math.max(1, pad))}${timeStr} ║`);
  }

  if (currentTask) {
    const right = `[running — ${eta}]`;
    const left = `▶ ${currentTask}`;
    const pad = contentW - left.length - right.length;
    lines.push(`║  ${left}${" ".repeat(Math.max(1, pad))}${right} ║`);
  }

  for (const t of pendingTasks) {
    const left = `⏳ ${t.name}`;
    const pad = contentW - left.length;
    lines.push(`║  ${left}${" ".repeat(Math.max(0, pad))}║`);
  }

  lines.push(`╚${"═".repeat(BOX_WIDTH - 2)}╝`);

  for (const line of lines) {
    process.stdout.write(line + "\n");
  }

  return lines.length;
}

function printFailedTaskOutput(
  taskName: string,
  output: { cmd: string; stdout: string; stderr: string; code: number | null },
): void {
  console.log(
    `\n${C.red}${C.bold}═ Task Failed: ${taskName} ═════════════════════════════════════════${C.reset}`,
  );
  console.log(`${C.bold}Command:${C.reset} ${output.cmd}`);
  if (output.code !== null) {
    console.log(`${C.bold}Exit Code:${C.reset} ${output.code}`);
  }
  if (output.stdout.trim()) {
    console.log(`\n${C.bold}--- Standard Output ---${C.reset}`);
    console.log(output.stdout.trim());
  }
  if (output.stderr.trim()) {
    console.log(`\n${C.bold}--- Error Output ---${C.reset}`);
    console.log(output.stderr.trim());
  }
  console.log(
    `${C.red}${C.bold}══════════════════════════════════════════════════════════════════════${C.reset}\n`,
  );
}

function printErrorSummary(failedResults: TaskResult[], options: PrecheckOptions): void {
  const contentW = BOX_WIDTH - 4;
  const count = failedResults.length;

  console.error(`\n╔${"═".repeat(BOX_WIDTH - 2)}╗`);

  const title = `❌ ${count} task(s) failed`;
  const titlePad = contentW - title.length;
  console.error(`║  ${title}${" ".repeat(Math.max(0, titlePad))}║`);

  console.error(`╠${"═".repeat(BOX_WIDTH - 2)}╣`);

  for (const r of failedResults) {
    const timeStr = `(${formatTime(r.elapsedMs)})`;
    const line1 = `❌ ${r.name} ${timeStr}`;
    const pad1 = contentW - line1.length;
    console.error(`║  ${line1}${" ".repeat(Math.max(0, pad1))}║`);

    if (r.remediation) {
      const hint = `   → Run: ${r.remediation}`;
      const pad2 = contentW - hint.length;
      console.error(`║  ${hint}${" ".repeat(Math.max(0, pad2))}║`);
    }
  }

  console.error(`╠${"═".repeat(BOX_WIDTH - 2)}╣`);

  const fixMsg = "Fix the issues above, commit, and push again.";
  const fixPad = contentW - fixMsg.length;
  console.error(`║  ${fixMsg}${" ".repeat(Math.max(0, fixPad))}║`);

  const noBypassMsg = "DO NOT bypass the gate — CI will reject the same issues.";
  const noBypassPad = contentW - noBypassMsg.length;
  console.error(`║  ${noBypassMsg}${" ".repeat(Math.max(0, noBypassPad))}║`);

  if (options.tier === "push") {
    const dockerMsg =
      "Ensure Docker DBs are up: docker compose -f tests/docker-compose.yml --profile postgresql up -d";
    const dockerPad = contentW - dockerMsg.length;
    console.error(`║  ${dockerMsg}${" ".repeat(Math.max(0, dockerPad))}║`);
  }

  console.error(`╚${"═".repeat(BOX_WIDTH - 2)}╝\n`);
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/**
 * Run all active precheck tasks with progress dashboard.
 *
 * @param options        Tier, skip flags, etc.
 * @param prebuiltTasks  Optional — pass tasks built by the CLI to avoid
 *                       rebuilding them inside this function.
 */
export async function runPrecheck(
  options: PrecheckOptions,
  prebuiltTasks?: Task[],
): Promise<PrecheckResult> {
  const start = performance.now();
  const changedPaths = options.changedPaths ?? (options.tier === "push" ? getChangedPaths() : []);
  const profile = analyzeChanges(changedPaths);
  const testSecret = ensureTestSecret();

  const tasks =
    prebuiltTasks ??
    buildPrecheckTasks(options.tier, profile, testSecret, {
      skipBenchmarks: options.skipBenchmarks,
      singleDb: options.singleDb,
      includeDbTasks: options.includeDbTasks,
    });
  const activeTasks = resolveActiveTasks(tasks);

  // Compute initial ETA from plan
  const plan = getPrecheckPlan(options.tier, profile, testSecret, {
    skipBenchmarks: options.skipBenchmarks,
    singleDb: options.singleDb,
    includeDbTasks: options.includeDbTasks,
  });
  let estimatedRemainingMs = plan.totalEstimatedMs;

  const results: TaskResult[] = [];
  const failedTasks: string[] = [];
  const tierLabel = options.tier === "full" ? "Full Precheck" : "Pre-Push";

  // Print initial dashboard once (all tasks pending)
  let dashboardLines = renderDashboard(tierLabel, [], null, activeTasks, estimatedRemainingMs);

  // Adaptive correction factor — refined as each task completes
  let actualTimeSoFar = 0;
  let estimateTimeSoFar = 0;

  for (let i = 0; i < activeTasks.length; i++) {
    const task = activeTasks[i];
    const remaining = activeTasks.slice(i + 1);

    const taskStart = performance.now();
    const thisEstimate = task.estimatedMs ?? 60000;

    let success = false;
    let errorThrown: unknown = undefined;
    clearLastCommandOutput();
    try {
      const result = task.run();
      success = await result;
    } catch (err) {
      errorThrown = err;
      success = false;
    }

    const elapsed = performance.now() - taskStart;
    actualTimeSoFar += elapsed;
    estimateTimeSoFar += thisEstimate;

    // Adaptive ETA: use correction factor from this task's actual vs estimated
    const remainingEstimate = remaining.reduce((sum, t) => sum + (t.estimatedMs ?? 60000), 0);
    const correction = thisEstimate > 0 ? elapsed / thisEstimate : 1;
    estimatedRemainingMs = Math.max(0, Math.round(remainingEstimate * correction));

    if (errorThrown) {
      console.error(`\n❌ ${task.name} crashed:`, errorThrown);
    }

    const IS_WINDOWS = process.platform === "win32";
    if (!success && task.remediation && process.stdout.isTTY && process.stdin.isTTY) {
      console.log(`\n${C.yellow}⚠️  Task "${task.name}" failed.${C.reset}`);
      const answer = prompt(
        `   Would you like to run the remediation command? (${task.remediation}) [Y/n] `,
      );
      if (answer === null || answer.trim().toLowerCase() !== "n") {
        console.log(`   Running remediation: ${task.remediation}...`);
        const [cmd, ...args] = task.remediation.split(/\s+/);
        const { spawnSync } = require("node:child_process");
        const fixResult = spawnSync(cmd, args, { stdio: "inherit", shell: IS_WINDOWS });
        if (fixResult.status === 0) {
          console.log(`   ${C.green}✅ Remediation successful! Re-running check...${C.reset}`);
          try {
            const reResult = task.run();
            success = await reResult;
          } catch {
            success = false;
          }

          // If it was formatting and is now passing, offer to amend the commit
          if (success && task.name === "Format, Lint & Check") {
            const commitAnswer = prompt(
              `   Would you like to automatically amend these formatting fixes into your current commit? [Y/n] `,
            );
            if (commitAnswer === null || commitAnswer.trim().toLowerCase() !== "n") {
              console.log(`   Staging and amending commit...`);
              spawnSync("git", ["add", "."], { stdio: "inherit", shell: IS_WINDOWS });
              const commitResult = spawnSync(
                "git",
                ["commit", "--amend", "--no-edit", "--no-verify"],
                { stdio: "inherit", shell: IS_WINDOWS },
              );
              if (commitResult.status === 0) {
                console.log(
                  `   ${C.green}✅ Successfully amended formatting fixes into commit!${C.reset}`,
                );
              } else {
                console.log(`   ❌ Failed to amend commit.`);
              }
            }
          }
        } else {
          console.log(`   ${C.red}❌ Remediation failed.${C.reset}`);
        }
      }
    }

    results.push({
      name: task.name,
      passed: success,
      elapsedMs: elapsed,
      remediation: task.remediation,
    });

    // Refresh the progress dashboard in-place after each task
    dashboardLines = renderDashboard(
      tierLabel,
      results,
      remaining.length > 0 ? remaining[0].name : null,
      remaining.slice(1),
      estimatedRemainingMs,
      dashboardLines,
    );

    if (!success) {
      failedTasks.push(task.name);
      const output = getLastCommandOutput();
      if (output) {
        printFailedTaskOutput(task.name, output);
        // Track extra output lines so the cursor-up on the next
        // renderDashboard skips over this error block too
        dashboardLines += 8;
      }
    }
  }

  // Final dashboard — all tasks completed (overwrite previous)
  renderDashboard(tierLabel, results, null, [], 0, dashboardLines);

  if (failedTasks.length > 0) {
    printErrorSummary(
      results.filter((r) => !r.passed),
      options,
    );
  }

  const totalElapsed = performance.now() - start;

  // Always show actual vs estimated for feedback loop
  if (actualTimeSoFar > 0 && estimateTimeSoFar > 0) {
    console.log(
      `⏱  Total: ${formatTime(totalElapsed)} (estimated: ${formatTime(plan.totalEstimatedMs)}, actual/estimate: ${(actualTimeSoFar / estimateTimeSoFar).toFixed(1)}x)`,
    );
  }

  // Compact result table — only shown on failures (dashboard covers success path)
  if (failedTasks.length > 0) {
    printResultTable(results);
  }

  return {
    passed: failedTasks.length === 0,
    failedTasks,
    elapsedMs: totalElapsed,
  };
}

// ---------------------------------------------------------------------------
// Header + exit messaging
// ---------------------------------------------------------------------------

function printHeader(options: PrecheckOptions, profile: ReturnType<typeof analyzeChanges>) {
  const tierLabel = options.tier === "full" ? "Full CI Precheck" : "Pre-Push Precheck";

  console.log(`⚡ Running ${tierLabel}...\n`);

  if (options.tier === "push") {
    console.log("🔎 Push change profile:");
    console.log(`   Source/tests code:  ${profile.hasSourceCode ? "yes" : "no"}`);
    console.log(`   CI/infra scripts:   ${profile.hasInfra ? "yes" : "no"}`);
    console.log(`   Database layer:     ${profile.hasDbInfra ? "yes" : "no"}`);
    console.log(`   Admin theme routes: ${profile.hasAdminTheme ? "yes" : "no"}`);
    console.log(`   Documentation:      ${profile.hasDocs ? "yes" : "no"}`);
    console.log(`   CI smoke (build): ${profile.needsCiSmoke ? "yes" : "no"}`);
    if (options.includeDbTasks) console.log("   DB tasks: included (--include-db-tasks)");
    if (profile.paths.length <= 12) {
      console.log(`   Files: ${profile.paths.join(", ") || "(none — running full gate)"}`);
    } else {
      console.log(`   Files: ${profile.paths.length} changed`);
    }
  } else {
    console.log("🔎 Full tier: running complete static + DB matrix checks");
    if (options.singleDb) console.log(`   Single DB: ${options.singleDb}`);
    if (options.skipBenchmarks) console.log("   Benchmarks: skipped");
  }
}

function printSuccess(options: PrecheckOptions) {
  if (options.tier === "full") {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ Full precheck passed.                                   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Pre-push passed — build + unit tests cleared.           ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  4-DB integration + benchmarks + E2E run in GitHub CI only. ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

function printFailure(options: PrecheckOptions, failedTasks: string[]) {
  console.error(`\n❌ ${failedTasks.length} task(s) failed:`);
  for (const name of failedTasks) console.error(`   - ${name}`);
  console.error("\n   Fix the issues above, commit, and push again.");
  console.error(
    "   Ensure Docker DBs are up: docker compose -f tests/docker-compose.yml --profile postgresql up -d",
  );
  if (options.tier === "push") {
    console.error(
      "   Optional DB matrix locally: bun run scripts/precheck.ts --tier=push --include-db-tasks",
    );
  }
  console.error("   DO NOT bypass the gate — CI will reject the same issues.\n");
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

export async function runPrecheckCli(
  options: PrecheckOptions & { plan?: boolean },
): Promise<number> {
  const changedPaths = options.changedPaths ?? (options.tier === "push" ? getChangedPaths() : []);
  const profile = analyzeChanges(changedPaths);

  printHeader(options, profile);
  validateCiParity();

  // Build tasks ONCE — used both for counting and execution
  const testSecret = ensureTestSecret();
  const tasks = buildPrecheckTasks(options.tier, profile, testSecret, {
    skipBenchmarks: options.skipBenchmarks,
    singleDb: options.singleDb,
    includeDbTasks: options.includeDbTasks,
  });

  // --plan / --explain mode: show what WOULD run, then exit
  if (options.plan) {
    const plan = getPrecheckPlan(options.tier, profile, testSecret, {
      skipBenchmarks: options.skipBenchmarks,
      singleDb: options.singleDb,
      includeDbTasks: options.includeDbTasks,
    });

    console.log(
      `\n🧪 Planned tasks (${plan.taskNames.length} active, ${plan.skipped.length} skipped):\n`,
    );
    plan.taskNames.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

    if (plan.skipped.length > 0) {
      console.log(`\n⏭  Skipped (${plan.skipped.length}):`);
      plan.skipped.forEach((name) => console.log(`  - ${name}`));
    }

    console.log(`\n⏱  Estimated total: ${formatTime(plan.totalEstimatedMs)}`);
    return 0;
  }

  const activeCount = resolveActiveTasks(tasks).length;
  console.log(`\n🚦 Running ${activeCount} checks...\n`);

  // Pass pre-built tasks so runPrecheck doesn't rebuild them
  const result = await runPrecheck({ ...options, changedPaths }, tasks);

  if (!result.passed) {
    printFailure(options, result.failedTasks);
    return 1;
  }

  printSuccess(options);
  return 0;
}

async function main() {
  const exitCode = await runPrecheckCli(parseArgs());
  process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Precheck crashed:", err);
    process.exit(1);
  });
}
