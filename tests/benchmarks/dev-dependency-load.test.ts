/**
 * @file tests/benchmarks/dev-dependency-load.test.ts
 * @description Developer Experience (DX) Toolchain Benchmark (Optimized)
 * @summary Measures type-check, format, and lint toolchain overhead for peak developer velocity.
 */

import { spawn } from "node:child_process";
import { test, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";

interface ToolResult {
  task: string;
  durationMs: number;
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

const isWindows = process.platform === "win32";

/**
 * Resolves binary executables with cross-platform extension support (.cmd on Windows).
 */
function resolveBin(name: string): string {
  const binDir = path.resolve(process.cwd(), "node_modules", ".bin");
  const candidates = isWindows
    ? [path.join(binDir, `${name}.cmd`), path.join(binDir, `${name}.exe`), path.join(binDir, name)]
    : [path.join(binDir, name)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fallback to system PATH resolution if not in node_modules/.bin
  return name;
}

/**
 * Asynchronous process execution with timeout guarding and buffer draining.
 */
function executeCommand(
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ durationMs: number; exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const proc = spawn(cmd, args, {
      shell: isWindows && (cmd.endsWith(".cmd") || cmd.endsWith(".bat")),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
    }, timeoutMs);

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        durationMs: performance.now() - start,
        exitCode: code ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

test("DX Toolchain Performance (Sync + Format + Lint)", async () => {
  console.log("🚀 Starting Developer Experience (DX) Toolchain Audit...\n");

  const oxfmtExec = resolveBin("oxfmt");
  const svelteCheckExec = resolveBin("svelte-check");
  const oxlintExec = resolveBin("oxlint");

  const results: ToolResult[] = [];
  const t0 = performance.now();

  // ── 1. FAST FORMATTER (oxfmt / prettier fallback) ─────────────────────────
  console.log("   → Benchmarking Fast Format...");
  const fmtRes = await executeCommand(oxfmtExec, ["--check", "src"]).catch(async () => {
    // Fallback through runner if direct binary execution differs
    return executeCommand(process.execPath, ["run", "format"]);
  });

  results.push({
    task: "Fast Format (oxfmt)",
    durationMs: fmtRes.durationMs,
    exitCode: fmtRes.exitCode,
  });

  if (fmtRes.exitCode !== 0) {
    console.warn(`⚠️ Formatter completed with warnings/exitCode: ${fmtRes.exitCode}`);
  }

  // ── 2. TYPE CHECKING (svelte-check) ───────────────────────────────────────
  console.log("   → Benchmarking Type Check (svelte-check)...");
  const checkRes = await executeCommand(svelteCheckExec, [
    "--tsconfig",
    "./tsconfig.json",
    "--threshold",
    "error",
  ]).catch(async () => {
    return executeCommand(process.execPath, ["run", "check"]);
  });

  results.push({
    task: "Type Check (svelte-check)",
    durationMs: checkRes.durationMs,
    exitCode: checkRes.exitCode,
  });

  if (checkRes.exitCode !== 0) {
    throw new Error(
      `Type Check failed (code ${checkRes.exitCode}):\n${checkRes.stderr || checkRes.stdout}`,
    );
  }

  // ── 3. RUST LINTER (oxlint) ───────────────────────────────────────────────
  console.log("   → Benchmarking Fast Lint (oxlint)...");
  const lintRes = await executeCommand(oxlintExec, ["src", "--deny-warnings"]).catch(async () => {
    return executeCommand(process.execPath, ["run", "lint"]);
  });

  results.push({
    task: "Fast Lint (oxlint)",
    durationMs: lintRes.durationMs,
    exitCode: lintRes.exitCode,
  });

  if (lintRes.exitCode !== 0) {
    throw new Error(
      `Linter failed (code ${lintRes.exitCode}):\n${lintRes.stderr || lintRes.stdout}`,
    );
  }

  const totalDurationMs = performance.now() - t0;

  // ── TELEMETRY & REPORTING ─────────────────────────────────────────────────
  console.log("\n📊 DX Toolchain Telemetry:");
  console.table(
    results.map((r) => ({
      Task: r.task,
      "Latency (ms)": r.durationMs.toFixed(2),
      Status: r.exitCode === 0 ? "PASSED" : "FAILED",
    })),
  );

  console.log(`⏱️  Total Toolchain Latency: ${totalDurationMs.toFixed(2)}ms\n`);

  expect(totalDurationMs).toBeLessThan(120_000);
}, 120_000);
