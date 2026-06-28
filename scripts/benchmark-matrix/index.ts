/**
 * @file scripts/benchmark-matrix/index.ts
 * @description Smart benchmark matrix orchestrator.
 *
 * Starts ONE server per database, seeds comprehensive data once,
 * runs all benchmark tests against the shared server,
 * shows per-test results inline with ETA, stops on first failure, evaluates results.
 *
 * Features:
 * - clean, modern terminal output with running indicators
 * - ETA calculation using weighted heuristics
 * - smart test grouping with ordered execution
 * - fail-fast on first test failure
 * - per-database report evaluation
 *
 * Usage:
 *   bun run scripts/benchmark-matrix/index.ts              // all databases
 *   bun run scripts/benchmark-matrix/index.ts --db=sqlite  // single database
 *   bun run scripts/benchmark-matrix/index.ts --db=sqlite,mongodb  // specific databases
 */

import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DBS = ["sqlite", "mariadb", "postgresql", "mongodb"];
const filter =
  process.argv
    .find((a) => a.startsWith("--db="))
    ?.split("=")[1]
    .toLowerCase()
    .split(",") || null;
const databases = filter ? DBS.filter((d) => filter.includes(d)) : DBS;
const CONTINUE_ON_ERROR =
  process.argv.includes("--continue-on-error") ||
  process.argv.includes("--continue");

// Generate a unique run ID so finalizeReport can correlate all test subprocess results
const BENCHMARK_RUN_ID = randomUUID();

// Auto-discover all test files
const testFiles = fs
  .readdirSync("tests/benchmarks")
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

// Smart test ordering groups based on workload analysis
const GROUPS = [
  {
    name: "Core HTTP Read",
    parallel: true,
    tests: [
      "truth-latency",
      "rest-api-performance",
      "api-latency",
      "auth-performance",
      "failure-propagation",
      "circuit-breaker-failover",
      "chaos-resilience",
    ],
  },
  {
    name: "GraphQL + Cache",
    parallel: true,
    tests: [
      "graphql-api-performance",
      "graphql-stress",
      "cache-performance",
      "cache-hit-ratio",
      "negative-cache",
    ],
  },
  {
    name: "Feature HTTP Read",
    parallel: true,
    tests: [
      "admin-ux-vitality",
      "multi-tenant-performance",
      "openapi-performance",
      "relational-performance",
      "seo-performance",
      "mixed-workload",
      "realtime-performance",
    ],
  },
  {
    name: "SDK/Local Read",
    parallel: true,
    tests: [
      "local-api-performance",
      "entry-edit-hydration",
      "widget-performance",
      "etag-hash",
      "ai-performance",
      "telemetry-performance",
    ],
  },
  {
    name: "HTTP Write/Mutation",
    parallel: false,
    tests: [
      "hooks-performance",
      "production-day",
      "data-residency-failover",
      "temporal-integrity",
      "client-journey",
      "index-pressure",
      "right-to-be-forgotten-audit",
      "revision-stress",
    ],
  },
  {
    name: "SDK Write/Mutation",
    parallel: false,
    tests: [
      "local-api-throughput",
      "database-performance",
      "transaction-acid",
      "security-audit",
      "behavioral-learning",
      "cache-eviction-leak",
      "cache-service",
      "database-failover",
    ],
  },
  {
    name: "Filesystem + Stress",
    parallel: false,
    tests: [
      "content-scan",
      "content-incremental-reload",
      "content-scale-stress",
      "throttling-backoff-stress",
      "state-machine-transition",
      "media-performance",
      "media-upload-stress",
      "large-payload-streaming",
      "migration-scale",
      "concurrency-max",
      "concurrency-race",
      "concurrency-throughput",
      "dev-dependency-load",
      "edge-sync",
      "websocket-broadcast",
      "build-analysis",
    ],
  },
];

function getHistoricWeights(): Record<string, number> {
  const jsonlPath = "tests/benchmarks/results/history.jsonl";
  const weights: Record<string, number> = {};
  if (!fs.existsSync(jsonlPath)) return weights;

  try {
    const raw = fs
      .readFileSync(jsonlPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const entries = raw.map((line) => JSON.parse(line));

    const groups: Record<string, number[]> = {};
    for (const e of entries) {
      if (e.testFile && e.wallClockMs && e.status === "SUCCESS") {
        const baseName = path.basename(e.testFile).replace(".test.ts", "");
        if (!groups[baseName]) groups[baseName] = [];
        groups[baseName].push(e.wallClockMs);
      }
    }

    for (const [testFile, times] of Object.entries(groups)) {
      const avgSec = times.reduce((a, b) => a + b, 0) / times.length / 1000;
      weights[testFile] = Math.max(avgSec, 1);
    }
  } catch {
    // fallback
  }
  return weights;
}

// Tests to skip in matrix mode (not meaningful against a shared server)
const SKIP_IN_MATRIX = new Set([
  "cold-start-phased", // Measures server boot time, meaningless against shared server
  "setup-proxy", // Measures server boot + cold start, meaningless against shared server
  "longevity-soak", // Runs for hours, not suitable for matrix
  "memory-stability", // Runs for minutes measuring memory, not suitable for matrix
]);

/**
 * Estimated test durations (seconds) for ETA weighting.
 * Used as fallback when fewer than 3 tests have completed,
 * then actual averages take over.
 */
const TEST_WEIGHTS: Record<string, number> = {
  // Core HTTP Read: ~12s avg
  "truth-latency": 15,
  "rest-api-performance": 5,
  "api-latency": 3,
  "auth-performance": 5,
  "failure-propagation": 3,
  "circuit-breaker-failover": 2,
  "chaos-resilience": 60,
  // GraphQL + Cache: ~10s avg
  "graphql-api-performance": 10,
  "graphql-stress": 10,
  "cache-performance": 8,
  "cache-hit-ratio": 10,
  "negative-cache": 5,
  // Feature HTTP Read: ~10s avg
  "admin-ux-vitality": 10,
  "multi-tenant-performance": 15,
  "openapi-performance": 8,
  "relational-performance": 12,
  "seo-performance": 10,
  "mixed-workload": 15,
  "realtime-performance": 10,
  // SDK/Local Read: ~5s avg
  "local-api-performance": 5,
  "entry-edit-hydration": 8,
  "widget-performance": 10,
  "etag-hash": 15,
  "ai-performance": 5,
  "telemetry-performance": 5,
  // HTTP Write/Mutation: ~20s avg
  "hooks-performance": 15,
  "production-day": 20,
  "data-residency-failover": 15,
  "temporal-integrity": 10,
  "client-journey": 15,
  "index-pressure": 30,
  "right-to-be-forgotten-audit": 15,
  "revision-stress": 20,
  // SDK Write/Mutation: ~20s avg
  "local-api-throughput": 20,
  "database-performance": 25,
  "transaction-acid": 15,
  "security-audit": 20,
  "behavioral-learning": 10,
  "cache-eviction-leak": 15,
  "cache-service": 20,
  "database-failover": 15,
  // Filesystem + Stress: ~30s avg
  "content-scan": 15,
  "content-incremental-reload": 20,
  "content-scale-stress": 20,
  "throttling-backoff-stress": 15,
  "state-machine-transition": 20,
  "media-performance": 30,
  "media-upload-stress": 25,
  "large-payload-streaming": 20,
  "migration-scale": 25,
  "concurrency-max": 30,
  "concurrency-race": 30,
  "concurrency-throughput": 30,
  "dev-dependency-load": 15,
  "edge-sync": 10,
  "websocket-broadcast": 20,
  "build-analysis": 60,
};

function getTestName(file: string): string {
  return file.replace(".test.ts", "");
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

async function healthOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function spawnTestProcess(
  file: string,
  serverEnv: Record<string, string>,
  baseUrl: string,
  runId: string,
): Promise<{ code: number; durationMs: number; output: string }> {
  return new Promise((resolve) => {
    const testStartTime = performance.now();
    const p = spawn(
      "bun",
      ["test", `tests/benchmarks/${file}`, "--timeout", "300000"],
      {
        stdio: ["inherit", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: {
          ...serverEnv,
          API_BASE_URL: baseUrl,
          BENCHMARK_MATRIX: "1",
          BENCHMARK_RUN_ID: runId,
        } as Record<string, string>,
      },
    );

    let output = "";
    p.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    p.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });

    p.on("close", (code) => {
      const durationMs = performance.now() - testStartTime;
      resolve({
        code: code ?? 1,
        durationMs,
        output,
      });
    });
  });
}

function renderProgressBar(
  completed: number,
  total: number,
  active: number,
  etaStr: string,
) {
  const width = 20;
  const percent = Math.min(100, Math.max(0, (completed / total) * 100));
  const completedWidth = Math.round((width * percent) / 100);
  const remainingWidth = width - completedWidth;
  const bar = `[${"=".repeat(completedWidth)}${">".repeat(percent < 100 && completedWidth > 0 ? 1 : 0)}${" ".repeat(Math.max(0, remainingWidth - (percent < 100 && completedWidth > 0 ? 1 : 0)))}]`;
  process.stdout.write(
    `\r\x1B[K  Progress: ${bar} ${Math.round(percent)}% (${completed}/${total} done, ${active} running) | ETA: ${etaStr} remaining`,
  );
}

function getRemainingWeight(
  running: Set<string>,
  queue: string[],
  weights: Record<string, number>,
  concurrency: number,
): number {
  let sum = 0;
  for (const file of queue) {
    const name = getTestName(file);
    sum += weights[name] || TEST_WEIGHTS[name] || 10;
  }
  for (const file of running) {
    const name = getTestName(file);
    sum += (weights[name] || TEST_WEIGHTS[name] || 10) * 0.5;
  }
  return sum / concurrency;
}

async function run() {
  let totalFailed = 0;
  console.log(`  Found ${testFiles.length} benchmark test files`);

  // Build ordered test list from smart groups
  const allGroupedNames = new Set(GROUPS.flatMap((g) => g.tests));
  const orderedTests: string[] = [];

  for (const group of GROUPS) {
    for (const testName of group.tests) {
      const file = testFiles.find((f) => getTestName(f) === testName);
      if (file && !orderedTests.includes(file)) {
        orderedTests.push(file);
      }
    }
  }

  // Add any remaining ungrouped tests at the end
  for (const file of testFiles) {
    if (!allGroupedNames.has(getTestName(file))) {
      orderedTests.push(file);
    }
  }

  for (const db of databases) {
    const useRedis = process.env.USE_REDIS === "true";
    const dbLabel = useRedis ? `${db.toUpperCase()}+REDIS` : db.toUpperCase();
    console.log(`\n${"\u2501".repeat(70)}`);
    console.log(`  ${dbLabel}: ${orderedTests.length} tests`);
    console.log(`${"\u2501".repeat(70)}`);

    // ── Phase 1: Start server ──
    const port = 4173 + Math.floor(Math.random() * 500);
    const baseUrl = `http://127.0.0.1:${port}`;
    const apiSecret = "SVELTYCMS_TEST_SECRET_2026";
    const adminPassword = "Password123!";

    process.stdout.write(`  [${db.toUpperCase()}] Starting server... `);

    const serverEnv = {
      ...process.env,
      DB_TYPE: db,
      PORT: String(port),
      API_BASE_URL: baseUrl,
      TEST_MODE: "true",
      USE_REDIS: "false",
      LOG_LEVEL: "fatal",
      QUIET: "true",
      JWT_SECRET_KEY: "Benchmark-JWT-Secret-Key-2026",
      ENCRYPTION_KEY: "Benchmark-Encryption-Key-2026-32ch",
      TEST_API_SECRET: apiSecret,
      ADMIN_PASSWORD: adminPassword,
      SVELTY_BENCHMARK_SUITE: "true",
      DB_NAME: "sveltycms_test",
      DB_HOST: "127.0.0.1",
      DB_USER: db === "sqlite" ? "" : "testuser",
      DB_PASSWORD: db === "sqlite" ? "" : "testpass",
      DB_PORT:
        db === "mariadb"
          ? "3306"
          : db === "postgresql"
            ? "5432"
            : db === "mongodb"
              ? "27017"
              : "",
    } as Record<string, string>;

    const server = spawn("node", ["build/index.js"], {
      env: serverEnv,
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    // Collect server stderr for debugging if needed
    let serverLogs = "";
    server.stderr.on("data", (d: Buffer) => {
      serverLogs += d.toString();
    });

    // Wait for server to be healthy
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      if (await healthOk(baseUrl)) {
        healthy = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!healthy) {
      console.log("FAILED");
      console.error(`  Server at ${baseUrl} did not start in 30s`);
      console.error(`  Logs: ${serverLogs.slice(0, 500)}`);
      server.kill("SIGKILL");
      process.exit(1);
    }
    console.log("OK");

    // ── Phase 2: System setup + seed ──
    process.stdout.write(`  [${db.toUpperCase()}] Setting up system... `);
    try {
      execSync("bun run scripts/setup-system.ts", {
        env: { ...serverEnv, API_BASE_URL: baseUrl, PRESET: "demo" },
        stdio: "pipe",
        shell: process.platform === "win32",
        timeout: 120_000,
      } as any);
      console.log("OK");
    } catch (e: any) {
      console.log("FAILED");
      console.error(
        `  Setup error: ${e.stderr?.toString().slice(0, 300) || e.message}`,
      );
      server.kill("SIGKILL");
      process.exit(1);
    }

    // Seed benchmark data via testing API
    process.stdout.write(`  [${db.toUpperCase()}] Seeding benchmark data... `);
    try {
      const seedRes = await fetch(`${baseUrl}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": apiSecret,
        },
        body: JSON.stringify({
          action: "seed",
          email: "admin@example.com",
          password: adminPassword,
        }),
      });
      if (seedRes.ok) console.log("OK");
      else {
        const txt = await seedRes.text().catch(() => "");
        console.log(`WARN (${seedRes.status}: ${txt.slice(0, 100)})`);
      }
    } catch {
      console.log(
        "WARN (seed endpoint not available, will be seeded per-test)",
      );
    }

    // ── Phase 3: Run tests ──
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const startTime = Date.now();

    // ETA tracking
    let totalElapsedTime = 0; // ms of completed (non-skipped) tests
    let completedTests = 0;

    // Load historic weights
    const historicWeights = getHistoricWeights();

    // Compute total weight of all runnable tests for initial ETA estimate
    const runnableTests = orderedTests.filter(
      (f) => !SKIP_IN_MATRIX.has(getTestName(f)),
    );
    const totalRunnable = runnableTests.length;

    // Count skipped tests
    for (const file of orderedTests) {
      if (SKIP_IN_MATRIX.has(getTestName(file))) {
        skipped++;
      }
    }

    // Group execution loop
    const runningTests = new Set<string>();

    for (const group of GROUPS) {
      const groupFiles = orderedTests.filter(
        (f) =>
          group.tests.includes(getTestName(f)) &&
          !SKIP_IN_MATRIX.has(getTestName(f)),
      );
      if (groupFiles.length === 0) continue;

      const groupWeight = groupFiles.reduce((sum, f) => {
        const name = getTestName(f);
        return sum + (historicWeights[name] || TEST_WEIGHTS[name] || 10);
      }, 0);
      const groupDuration = formatTime(groupWeight / (group.parallel ? 3 : 1));

      console.log(
        `\n  \u2500\u2500\u2500 ${group.name} (${groupFiles.length} tests · ~${groupDuration}) \u2500\u2500\u2500`,
      );

      const concurrency = group.parallel ? (db === "sqlite" ? 1 : 3) : 1;
      const groupQueue = [...groupFiles];
      const activePromises: Promise<void>[] = [];

      while (groupQueue.length > 0 || activePromises.length > 0) {
        while (activePromises.length < concurrency && groupQueue.length > 0) {
          const file = groupQueue.shift()!;
          const name = getTestName(file);
          runningTests.add(file);

          // Re-render progress bar
          const remainingWeight = getRemainingWeight(
            runningTests,
            groupQueue,
            historicWeights,
            concurrency,
          );
          const etaStr = formatTime(remainingWeight);
          renderProgressBar(
            completedTests,
            totalRunnable,
            runningTests.size,
            etaStr,
          );

          const testPromise = (async () => {
            const { code, durationMs, output } = await spawnTestProcess(
              file,
              serverEnv,
              baseUrl,
              BENCHMARK_RUN_ID,
            );
            const durationSec = (durationMs / 1000).toFixed(1);
            runningTests.delete(file);
            completedTests++;
            totalElapsedTime += durationMs;

            // Clear progress bar line to write output cleanly
            process.stdout.write("\r\x1B[K");

            if (code !== 0) {
              failed++;
              console.log(
                `  \u2716 ${name.padEnd(30)} FAILED (${durationSec}s)`,
              );
              // Show last 30 lines of output for debugging
              const lines = output.split("\n").filter(Boolean);
              const tail = lines.slice(-30);
              console.log(`  ${"\u2500".repeat(60)}`);
              for (const line of tail) console.log(`  ${line}`);
              console.log(`  ${"\u2500".repeat(60)}`);
              if (!CONTINUE_ON_ERROR) {
                console.log(`  Stopping \u2014 fix the failure and re-run.`);
                server.kill("SIGTERM");
                await new Promise((r) => setTimeout(r, 300));
                server.kill("SIGKILL");
                process.exit(1);
              }
            } else {
              passed++;
              console.log(`  \u2713 ${name.padEnd(30)} ${durationSec}s`);
            }

            // Re-render progress bar
            const nextRemaining = getRemainingWeight(
              runningTests,
              groupQueue,
              historicWeights,
              concurrency,
            );
            renderProgressBar(
              completedTests,
              totalRunnable,
              runningTests.size,
              formatTime(nextRemaining),
            );
          })();

          activePromises.push(testPromise);
          testPromise.then(() => {
            const idx = activePromises.indexOf(testPromise);
            if (idx !== -1) activePromises.splice(idx, 1);
          });
        }

        if (activePromises.length > 0) {
          await Promise.race(activePromises);
        }
      }
    }

    // Clear progress bar line at end
    process.stdout.write("\r\x1B[K");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Phase 4: Finalize report (batch MDX write) ──
    process.stdout.write(`  Finalizing report...`);
    try {
      const { finalizeReport } =
        await import("../../tests/benchmarks/modules/benchmark-reporting");
      await finalizeReport(BENCHMARK_RUN_ID);
      process.stdout.write(" OK\n");
    } catch (e: any) {
      process.stdout.write(` ${e.message}\n`);
    }

    // ── Phase 5: Evaluate report ──
    let reportedRegressions = false;
    const reportPath = `docs/project/benchmarks/benchmark_${db}.mdx`;
    if (fs.existsSync(reportPath)) {
      const content = fs.readFileSync(reportPath, "utf8");
      const regressions: string[] = [];

      // Look for 🔴 indicators in trend labels
      const trendLines = content.split("\n").filter((l) => l.includes("### "));
      for (const line of trendLines) {
        const m = line.match(/### [^\s]+\s+(.+?)\s+[⚪🟢🔴]/u);
        const name = m?.[1]?.trim();
        // Check for red indicators or negative percentages
        if (line.includes("🔴")) {
          const pct = line.match(/[-+]\d+%/);
          if (name && pct) regressions.push(`${name} ${pct[0]}`);
        }
      }

      if (regressions.length) {
        reportedRegressions = true;
        console.log(`  \u26A0 Regressions detected:`);
        for (const r of regressions) console.log(`       ${r}`);
      }
    }

    // ── Summary ──
    console.log(`  ${"\u2500".repeat(55)}`);
    console.log(
      `  ${db.toUpperCase()}: ${passed} passed, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ""} in ${elapsed}s`,
    );
    if (fs.existsSync(reportPath)) {
      const trend = reportedRegressions ? "Regressions found" : "All stable";
      console.log(`  Evaluated: benchmark_${db}.mdx \u2192 ${trend}`);
    }

    totalFailed += failed;

    // Cleanup
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    server.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
  }

  if (totalFailed > 0) {
    console.log(`\n  Done. Completed with ${totalFailed} failures.`);
    process.exit(1);
  } else {
    console.log(`\n  Done.`);
  }
}

run().catch((err) => {
  console.error("Matrix failed:", err);
  process.exit(1);
});
