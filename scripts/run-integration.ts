#!/usr/bin/env bun
/**
 * @file scripts/run-integration.ts
 * @description Windows-safe integration orchestrator with Valibot-validated args,
 *   reusable command executor, and phased lifecycle (Parse → Build → Setup → Run → Report).
 *
 * ## Why this script exists (harness history)
 * Bun on Windows cannot reliably spawn a long-lived preview server *from inside*
 * `bun test` (Job Object / child_process quirks). Working approach:
 *   **Start preview OUTSIDE bun test → then run bun test → kill preview.**
 *
 * ## Usage
 *   bun run scripts/run-integration.ts                  # build + one DB_TYPE (default sqlite)
 *   bun run scripts/run-integration.ts --no-build       # reuse harness-enabled build/
 *   bun run scripts/run-integration.ts --diff           # run only tests for changed files
 *   bun run scripts/run-integration.ts --retry          # retry failed tests up to 2 times
 *   bun run scripts/run-integration.ts --diff --retry   # combine flags
 *   DB_TYPE=postgresql bun run scripts/run-integration.ts
 *
 * ## Build / harness
 * Integration seed/reset need /api/testing. A normal `bun run build` strips that handler.
 * This orchestrator always verifies the harness; with --no-build a deploy-stripped
 * build is auto-rebuilt locally (CI fails closed so artifact bugs surface).
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import * as v from "valibot";
import {
  buildIntegrationServerEnv,
  cleanSqliteTestFiles,
  cleanupTestArtifacts,
  createIntegrationContext,
  detectDockerAdapterHints,
  ensureIntegrationBuild,
  ensurePortAvailable,
  stopChildProcessTree,
  waitForIntegrationHealth,
  writePrivateTestConfig,
  type IntegrationRunContext,
} from "./integration-harness.ts";

const ROOT = join(import.meta.dirname, "..");
const entryPoint = join(ROOT, "build", "index.js");
/** GitHub Actions / CI_QUIET: compact test output (failures + summary only). */
const isCIQuiet =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  process.env.CI_QUIET === "1" ||
  process.env.CI_QUIET === "true";

// ═══════════════════════════════════════════════════════════════════════════════
// §1 — Valibot Schemas
// ═══════════════════════════════════════════════════════════════════════════════

/** Validated CLI arguments — fails fast on invalid input. */
const ParsedArgsSchema = v.object({
  noBuild: v.optional(v.boolean(), false),
  /** Refuse auto-rebuild when --no-build and harness missing (CI default). */
  strictNoBuild: v.optional(v.boolean(), false),
  diff: v.optional(v.boolean(), false),
  diffBase: v.optional(v.pipe(v.string(), v.minLength(1)), "HEAD"),
  retryCount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)), 0),
  summary: v.optional(v.boolean(), false),
  testPaths: v.optional(v.array(v.string()), []),
  bunFlags: v.optional(v.array(v.string()), []),
});

type ParsedArgs = v.InferOutput<typeof ParsedArgsSchema>;

/** Validated integration context — ensures all required fields exist before spawn. */
const ContextSchema = v.object({
  root: v.string(),
  port: v.pipe(v.string(), v.minLength(1)),
  apiBaseUrl: v.pipe(v.string(), v.startsWith("http")),
  dbType: v.pipe(v.string(), v.minLength(1)),
  dbName: v.pipe(v.string(), v.minLength(1)),
  secrets: v.object({
    jwt: v.pipe(v.string(), v.minLength(8)),
    encryption: v.pipe(v.string(), v.minLength(16)),
    testApiSecret: v.pipe(v.string(), v.minLength(10)),
    adminPassword: v.pipe(v.string(), v.minLength(6)),
  }),
});

type ValidatedContext = v.InferOutput<typeof ContextSchema>;

function hasBunFlag(flags: string[], name: string): boolean {
  return flags.some((flag) => flag === name || flag.startsWith(`${name}=`));
}

function serialIntegrationBunFlags(flags: string[]): string[] {
  if (hasBunFlag(flags, "--max-concurrency")) return flags;
  return ["--max-concurrency=1", ...flags];
}

// ═══════════════════════════════════════════════════════════════════════════════
// §2 — Command Execution Engine
// ═══════════════════════════════════════════════════════════════════════════════

interface ExecOptions {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  label?: string;
  /** Pipe stdio and capture output (for parsing test results). */
  capture?: boolean;
  /** Tee output to the parent process. */
  tee?: boolean;
  /** Exit codes that are considered successful (default: [0]). */
  okCodes?: number[];
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  ok: boolean;
}

class Exec {
  /**
   * Spawn a child process with consistent logging, error handling, and optional capture.
   */
  static async run(opts: ExecOptions): Promise<ExecResult> {
    const {
      cmd,
      args,
      cwd = ROOT,
      env = process.env as Record<string, string>,
      label,
      capture = false,
      tee = true,
      okCodes = [0],
    } = opts;

    const prefix = label ? `[${label}]` : "";
    if (label && !capture) {
      console.log(`${prefix} Running: ${cmd} ${args.join(" ")}`);
    }

    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd,
        env,
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        shell: process.platform === "win32" && !capture,
      });

      let stdout = "";
      let stderr = "";

      if (capture) {
        child.stdout?.on("data", (d: Buffer) => {
          const text = d.toString();
          stdout += text;
          if (tee) process.stdout.write(text);
        });
        child.stderr?.on("data", (d: Buffer) => {
          const text = d.toString();
          stderr += text;
          if (tee) process.stderr.write(text);
        });
      }

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        const ok = okCodes.includes(exitCode);
        if (!ok && label) {
          console.error(`${prefix} exited with code ${exitCode}`);
        }
        resolve({ exitCode, stdout, stderr, ok });
      });

      child.on("error", (err) => {
        console.error(`${prefix} spawn error: ${err.message}`);
        resolve({ exitCode: 1, stdout, stderr, ok: false });
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3 — Argument Parsing (Valibot-validated)
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(): ParsedArgs {
  const raw = process.argv.slice(2);
  const parsed: Record<string, unknown> = {
    testPaths: [] as string[],
    bunFlags: [] as string[],
  };

  for (const a of raw) {
    if (a === "--no-build") parsed.noBuild = true;
    else if (a === "--strict-no-build") {
      parsed.noBuild = true;
      parsed.strictNoBuild = true;
    } else if (a === "--diff" || a === "--changed") parsed.diff = true;
    else if (a.startsWith("--diff-base=")) parsed.diffBase = a.slice("--diff-base=".length);
    else if (a === "--retry") {
      parsed.retryCount = 2;
      parsed.summary = true;
    } else if (a.startsWith("--retry=")) {
      parsed.retryCount = parseInt(a.slice("--retry=".length), 10) || 2;
      parsed.summary = true;
    } else if (a === "--report" || a === "--summary") parsed.summary = true;
    else if (a === "--no-summary" || a === "--no-report") parsed.summary = false;
    else if (a.endsWith("run-integration.ts")) {
      /* skip self */
    } else if (
      a.includes("tests/") ||
      a.includes("tests\\") ||
      a.endsWith(".test.ts") ||
      a.endsWith(".spec.ts")
    )
      (parsed.testPaths as string[]).push(a);
    else if (a.startsWith("-")) (parsed.bunFlags as string[]).push(a);
  }

  // CI artifact path: never silently rebuild a stripped bundle (masking bad uploads)
  if (
    parsed.noBuild &&
    !parsed.strictNoBuild &&
    (process.env.CI === "true" || process.env.CI === "1")
  ) {
    parsed.strictNoBuild = true;
  }

  const result = v.safeParse(ParsedArgsSchema, parsed);
  if (!result.success) {
    for (const issue of result.issues) {
      console.error(`  ❌ ${issue.message}`);
    }
    process.exit(2);
  }
  return result.output;
}

function validateContext(ctx: IntegrationRunContext): ValidatedContext {
  const result = v.safeParse(ContextSchema, ctx);
  if (!result.success) {
    for (const issue of result.issues) {
      console.error(`  ❌ ${issue.message}`);
    }
    process.exit(2);
  }
  return result.output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §4 — Smart Filtering (git diff)
// ═══════════════════════════════════════════════════════════════════════════════

function resolveChangedTestPaths(baseRef: string): string[] {
  const changedFiles: string[] = [];
  const seen = new Set<string>();

  const addUnique = (output: string) => {
    for (const f of output
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (f && !seen.has(f)) {
        seen.add(f);
        changedFiles.push(f);
      }
    }
  };

  const gitOps = [
    ["git", "diff", "--name-only", "--diff-filter=ACMR"],
    ["git", "diff", "--name-only", "--cached", "--diff-filter=ACMR"],
    ["git", "ls-files", "--others", "--exclude-standard"],
  ];

  // Add merge-base diff
  let mergeBase = "";
  try {
    mergeBase = execSync("git merge-base HEAD origin/next", { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    /* ok */
  }
  const base = mergeBase || baseRef;
  gitOps.push(["git", "diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);

  for (const [cmd, ...args] of gitOps) {
    try {
      addUnique(execSync([cmd, ...args].join(" "), { encoding: "utf8", cwd: ROOT }));
    } catch {
      /* ok */
    }
  }

  if (changedFiles.length === 0) {
    console.log("ℹ️  No changed files detected.");
    return [];
  }

  console.log(`📋 Changed files: ${changedFiles.length}`);
  for (const f of changedFiles.slice(0, 8)) console.log(`   ${f}`);
  if (changedFiles.length > 8) console.log(`   ... and ${changedFiles.length - 8} more`);

  const testPaths = new Set<string>();
  for (const file of changedFiles) {
    const n = file.replace(/\\/g, "/");
    if (n.startsWith("tests/integration/")) {
      testPaths.add(n);
      continue;
    }
    if (n.startsWith("src/databases/")) testPaths.add("tests/integration/databases/");
    if (n.startsWith("src/routes/api/") || n.startsWith("src/hooks/"))
      testPaths.add("tests/integration/api/");
    if (n.startsWith("src/routes/")) testPaths.add("tests/integration/routes/");
    if (n.startsWith("src/services/sdk/")) testPaths.add("tests/integration/sdk/");
    if (n.includes("collectionbuilder")) testPaths.add("tests/integration/collectionbuilder/");
    if (
      n.startsWith("src/services/") ||
      n.startsWith("src/utils/") ||
      n.startsWith("src/content/")
    ) {
      testPaths.add("tests/integration/api/");
      testPaths.add("tests/integration/databases/");
    }
  }

  const paths = [...testPaths];
  if (paths.length === 0) return [];
  console.log(`🎯 Resolved ${paths.length} test path(s)`);
  for (const p of paths) console.log(`   ${p}`);
  return paths;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §5 — Test Output Parser
// ═══════════════════════════════════════════════════════════════════════════════

interface TestResult {
  suite: string;
  name: string;
  status: "pass" | "fail";
  durationMs: number;
  file: string;
  line?: number;
}

interface FlakyResult {
  test: TestResult;
  retries: number;
  finalStatus: "pass" | "fail";
}

function parseTestOutput(output: string, fileHint: string): TestResult[] {
  const results: TestResult[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*\((pass|fail)\)\s+(.+?)\s*\[([\d.]+)ms\]/);
    if (!match) continue;
    const [, status, fullName, duration] = match;
    const parts = fullName.split(" > ").map((s) => s.trim());
    results.push({
      suite: parts[0] || fullName,
      name: parts.slice(1).join(" > ") || fullName,
      status: status as "pass" | "fail",
      durationMs: parseFloat(duration),
      file: fileHint,
    });
  }
  return results;
}

/** Parse bun's final tally when detailed (pass)/(fail) lines are suppressed (--only-failures). */
function parseBunTally(output: string): { pass: number; fail: number } | null {
  let pass: number | null = null;
  let fail: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    const p = line.match(/^\s*(\d+)\s+pass\b/);
    if (p) pass = Number.parseInt(p[1], 10);
    const f = line.match(/^\s*(\d+)\s+fail\b/);
    if (f) fail = Number.parseInt(f[1], 10);
  }
  if (pass === null && fail === null) return null;
  return { pass: pass ?? 0, fail: fail ?? 0 };
}

function extractTestFilter(test: TestResult): string {
  return test.name || test.suite;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6 — Flaky Detection & Retry
// ═══════════════════════════════════════════════════════════════════════════════

async function retryFailedTests(
  failures: TestResult[],
  testPaths: string[],
  bunFlags: string[],
  env: Record<string, string>,
  maxRetries: number,
): Promise<FlakyResult[]> {
  const results: FlakyResult[] = [];

  for (const test of failures) {
    let passed = false;
    let retries = 0;
    const filter = extractTestFilter(test);
    const filePath = test.file || testPaths[0];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      retries = attempt;
      console.log(`\n🔄 Retry ${attempt}/${maxRetries}: ${test.suite} > ${test.name}`);

      const res = await Exec.run({
        cmd: "bun",
        args: [
          "test",
          "--timeout",
          "300000",
          ...serialIntegrationBunFlags(bunFlags),
          filePath,
          "-t",
          filter,
        ],
        env,
        capture: true,
        tee: true,
        label: `retry-${attempt}`,
        okCodes: [0, 1],
      });

      if (res.exitCode === 0) {
        passed = true;
        console.log(`   ✅ Passed on retry ${attempt}!`);
        break;
      }
      console.log(`   ❌ Still failing after retry ${attempt}`);
    }

    results.push({ test, retries, finalStatus: passed ? "pass" : "fail" });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §7 — Summary Report
// ═══════════════════════════════════════════════════════════════════════════════

function printSummaryReport(
  results: TestResult[],
  flaky: FlakyResult[],
  totalDurationMs: number,
  tally?: { pass: number; fail: number } | null,
): void {
  // Prefer bun tally when present (accurate under --only-failures); else per-test rows
  const fromRowsPass = results.filter((r) => r.status === "pass").length;
  const fromRowsFail = results.filter((r) => r.status === "fail").length;
  const passed = tally ? tally.pass : fromRowsPass;
  const failed = tally ? tally.fail : fromRowsFail;
  const total = tally ? tally.pass + tally.fail : results.length;
  const recovered = flaky.filter((f) => f.finalStatus === "pass").length;
  const persistent = flaky.filter((f) => f.finalStatus === "fail").length;
  const sec = (totalDurationMs / 1000).toFixed(2);

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                    INTEGRATION TEST REPORT                      ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(
    `║  Total: ${String(total).padEnd(5)} │ Pass: ${String(passed).padEnd(5)} │ Fail: ${String(failed).padEnd(5)} │ ${sec}s`,
  );
  if (flaky.length > 0) console.log(`║  Flaky recovered: ${recovered} │ persistent: ${persistent}`);

  if (failed > 0 && fromRowsFail > 0) {
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log("║  FAILED:                                                        ║");
    for (const r of results.filter((r) => r.status === "fail")) {
      const name = `${r.suite} > ${r.name}`;
      const dur = `${r.durationMs.toFixed(1)}ms`;
      console.log(
        `║  ✗ ${(name.length > 50 ? name.slice(0, 47) + "..." : name).padEnd(50)} ${dur.padStart(8)}  ║`,
      );
    }
  }

  if (flaky.length > 0) {
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log("║  FLAKY:                                                         ║");
    for (const f of flaky) {
      const status = f.finalStatus === "pass" ? "♻ RECOVERED" : "✗ STILL FAILS";
      const name = `${f.test.suite} > ${f.test.name}`;
      console.log(
        `║  ${status.padEnd(14)} ${(name.length > 43 ? name.slice(0, 40) + "..." : name).padEnd(43)} (${f.retries}r) ║`,
      );
    }
  }

  const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  if (sorted.length > 0 && !isCIQuiet) {
    console.log("╠══════════════════════════════════════════════════════════════════╣");
    console.log("║  SLOWEST:                                                       ║");
    for (const r of sorted) {
      const name = `${r.suite} > ${r.name}`;
      console.log(
        `║  ${(name.length > 50 ? name.slice(0, 47) + "..." : name).padEnd(50)} ${r.durationMs.toFixed(0).padStart(6)}ms ║`,
      );
    }
  }

  const finalFailures = Math.max(0, failed - recovered + persistent);
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  if (finalFailures === 0)
    console.log("║  ✅ ALL TESTS PASSED                                            ║");
  else
    console.log(
      `║  ❌ ${finalFailures} TEST(S) FAILED                                            ║`,
    );
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// §8 — Phased Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

/** Phase 1: Parse & Validate — fast-fail on bad inputs before any work starts. */
async function phaseParse(): Promise<{
  args: ParsedArgs;
  ctx: ValidatedContext;
  testPaths: string[];
}> {
  const args = parseArgs();
  const rawCtx = createIntegrationContext(ROOT);
  const ctx = validateContext(rawCtx);

  let testPaths = args.testPaths;
  if (args.diff) {
    const changed = resolveChangedTestPaths(args.diffBase);
    if (changed.length > 0) testPaths = [...new Set([...testPaths, ...changed])];
    else if (testPaths.length === 0) testPaths = ["tests/integration/"];
  }
  if (testPaths.length === 0) testPaths = ["tests/integration/"];

  return { args, ctx, testPaths };
}

/** Phase 2: Build — ensure harness-enabled production server. */
async function phaseBuild(args: ParsedArgs): Promise<void> {
  try {
    if (args.noBuild) {
      console.log(
        args.strictNoBuild
          ? "ℹ️  --no-build (strict): reuse artifact; fail if harness missing"
          : "ℹ️  --no-build: reuse build/ if harness present, else auto-rebuild",
      );
    }
    await ensureIntegrationBuild(ROOT, {
      noBuild: args.noBuild,
      strictNoBuild: args.strictNoBuild,
    });
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!existsSync(entryPoint)) {
    console.error(`❌ Missing ${entryPoint}. Run without --no-build first.`);
    process.exit(1);
  }
}

/** Phase 3: Setup — config, port, server startup. */
async function phaseSetup(
  ctx: ValidatedContext,
): Promise<{ server: ChildProcess; serverLog: string[] }> {
  cleanupTestArtifacts(ctx.root);
  writePrivateTestConfig(ctx);
  cleanSqliteTestFiles(ctx.root, ctx.dbType, ctx.dbName);

  await ensurePortAvailable(ctx.port, ctx.apiBaseUrl);

  const { available: dockerHints, detail: dockerDetail } = detectDockerAdapterHints();
  console.log(`🐳 Docker: ${dockerHints.join(", ")}`);
  console.log(`   ${dockerDetail}`);
  console.log(`📌 CMS: DB_TYPE=${ctx.dbType}`);

  console.log(`🚀 Starting preview on :${ctx.port} (DB_TYPE=${ctx.dbType})...`);
  const serverEnv = buildIntegrationServerEnv(ctx);
  /** Ring buffer of server logs — dump only on failure in quiet CI mode. */
  const serverLog: string[] = [];
  /** Keep a short tail so failure dumps stay scannable (not full boot spam). */
  const MAX_LOG_LINES = 40;

  const server = spawn("node", [entryPoint], {
    cwd: ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  const pushLog = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
    const text = typeof chunk === "string" ? chunk : chunk.toString();
    if (!isCIQuiet) {
      if (stream === "stderr") process.stderr.write(`[srv] ${text}`);
      else process.stdout.write(`[srv] ${text}`);
      return;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      serverLog.push(line);
      if (serverLog.length > MAX_LOG_LINES) serverLog.shift();
    }
  };

  server.stdout?.on("data", (d) => pushLog(d, "stdout"));
  server.stderr?.on("data", (d) => pushLog(d, "stderr"));
  server.on("exit", (code) => {
    if (code !== null && code !== 0) console.error(`[srv] early exit code=${code}`);
  });

  try {
    await waitForIntegrationHealth(ctx.apiBaseUrl, { testApiSecret: ctx.secrets.testApiSecret });
  } catch (err) {
    if (serverLog.length > 0) {
      console.error("── preview server log (tail) ──");
      for (const line of serverLog) console.error(line);
      console.error("── end preview log ──");
    }
    throw err;
  }
  return { server, serverLog };
}

/** Phase 4: Run — execute the test suite with optional retry. */
async function phaseRun(
  args: ParsedArgs,
  ctx: ValidatedContext,
  testPaths: string[],
  dockerHints: string[],
): Promise<{
  exitCode: number;
  results: TestResult[];
  flaky: FlakyResult[];
  tally: { pass: number; fail: number } | null;
}> {
  const env = {
    ...buildIntegrationServerEnv(ctx),
    BUN_TEST_MOCKS: "false",
    SVELTY_DOCKER_ADAPTERS: dockerHints.join(","),
  };

  if (!isCIQuiet) {
    console.log(`   TEST_API_SECRET pinned → len=${ctx.secrets.testApiSecret.length}`);
  }

  // Quiet CI: hide passing tests (bun still prints failure details + final tally).
  const quietBunFlags = isCIQuiet ? ["--only-failures"] : [];
  // Allow explicit bunFlags to override quiet defaults if caller already set reporter opts
  const reporterAlreadySet =
    hasBunFlag(args.bunFlags, "--dots") ||
    hasBunFlag(args.bunFlags, "--only-failures") ||
    hasBunFlag(args.bunFlags, "--reporter");

  const primary = await Exec.run({
    cmd: "bun",
    args: [
      "test",
      "--timeout",
      "300000",
      ...serialIntegrationBunFlags(args.bunFlags),
      ...(reporterAlreadySet ? [] : quietBunFlags),
      ...testPaths,
    ],
    env,
    capture: true,
    tee: true,
    label: "test",
    okCodes: [0, 1],
  });

  const combinedOut = `${primary.stdout}\n${primary.stderr}`;
  const results = parseTestOutput(combinedOut, testPaths[0]);
  const tally = parseBunTally(combinedOut);
  const failures = results.filter((r) => r.status === "fail");
  const flaky: FlakyResult[] = [];
  let exitCode = primary.exitCode;

  if (args.retryCount > 0 && failures.length > 0) {
    console.log(
      `\n🔍 Flaky detection: ${failures.length} failed — retrying up to ${args.retryCount}x...\n`,
    );
    const retried = await retryFailedTests(
      failures,
      testPaths,
      args.bunFlags,
      env,
      args.retryCount,
    );
    flaky.push(...retried);

    const persistent = flaky.filter((f) => f.finalStatus === "fail");
    const recovered = flaky.filter((f) => f.finalStatus === "pass").length;
    if (persistent.length === 0 && recovered > 0) {
      console.log(`\n♻️  All ${recovered} failed test(s) recovered — treating as pass.`);
      exitCode = 0;
    }
  }

  return { exitCode, results, flaky, tally };
}

/** Phase 5: Cleanup — stop server, clean artifacts, release port. */
async function phaseCleanup(server: ChildProcess, ctx: ValidatedContext): Promise<void> {
  await stopChildProcessTree(null, { label: "bun test", graceMs: 400 });
  await stopChildProcessTree(server, { label: "preview", graceMs: 800 });
  await sleep(200);
  try {
    await ensurePortAvailable(ctx.port, ctx.apiBaseUrl);
  } catch {
    /* ok */
  }
  cleanupTestArtifacts(ctx.root);
  console.log("\n🧹 Server stopped.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// §9 — Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const totalStart = performance.now();

  // Phase 1: Parse & Validate
  const { args, ctx, testPaths } = await phaseParse();

  // Phase 2: Build
  await phaseBuild(args);

  // Phase 3: Setup
  const dockerHints = (await detectDockerAdapterHints()).available;
  const { server, serverLog } = await phaseSetup(ctx);

  // Phase 4: Run
  let exitCode = 1;
  let allResults: TestResult[] = [];
  let flakyResults: FlakyResult[] = [];
  let tally: { pass: number; fail: number } | null = null;
  try {
    const run = await phaseRun(args, ctx, testPaths, dockerHints);
    exitCode = run.exitCode;
    allResults = run.results;
    flakyResults = run.flaky;
    tally = run.tally;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }

  // On failure in quiet CI, surface a short buffered server tail for diagnosis
  if (exitCode !== 0 && isCIQuiet && serverLog.length > 0) {
    const interesting = serverLog.filter((l) =>
      /error|fail|warn|exception|crash|ECONN|ENOENT|FATAL/i.test(l),
    );
    const dump = interesting.length > 0 ? interesting.slice(-25) : serverLog.slice(-25);
    console.error("\n── preview server log (failure tail) ──");
    for (const line of dump) console.error(line);
    console.error("── end preview log ──\n");
  }

  // Phase 5: Cleanup
  await phaseCleanup(server, ctx);

  // Report: always in CI (compact gate signal); locally only with --summary/--retry
  if (isCIQuiet || args.summary || args.retryCount > 0) {
    printSummaryReport(allResults, flakyResults, performance.now() - totalStart, tally);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
