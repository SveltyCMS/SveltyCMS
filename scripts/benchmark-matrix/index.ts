/**
 * @file scripts/benchmark-matrix/index.ts
 * @description Smart benchmark matrix orchestrator.
 *
 * Starts ONE server per database, seeds comprehensive data once,
 * runs all benchmark tests against the shared server,
 * shows per-test results inline with ETA, stops on first failure, evaluates results.
 *
 * Features:
 * - clean, minimal terminal output with \r running indicators
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
import { getDockerDefaultDbCredentials } from "../../src/utils/test-db-credentials.ts";

const DBS = ["sqlite", "mariadb", "postgresql", "mongodb"];
const filter =
  process.argv
    .find((a) => a.startsWith("--db="))
    ?.split("=")[1]
    .toLowerCase()
    .split(",") || null;
const databases = filter ? DBS.filter((d) => filter.includes(d)) : DBS;
const CONTINUE_ON_ERROR =
  process.argv.includes("--continue-on-error") || process.argv.includes("--continue");

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
    const raw = fs.readFileSync(jsonlPath, "utf8").trim().split("\n").filter(Boolean);
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
    const p = spawn("bun", ["test", `tests/benchmarks/${file}`, "--timeout", "300000"], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: {
        ...serverEnv,
        API_BASE_URL: baseUrl,
        BENCHMARK_MATRIX: "1",
        BENCHMARK_RUN_ID: runId,
      } as Record<string, string>,
    });

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

function calculateGroupDuration(
  groupFiles: string[],
  historicWeights: Record<string, number>,
  concurrency: number,
): string {
  let sum = 0;
  for (const file of groupFiles) {
    const name = getTestName(file);
    sum += historicWeights[name] || TEST_WEIGHTS[name] || 10;
  }
  return formatTime(sum / concurrency);
}

function printProgressDashboard(opts: {
  groupName: string;
  groupDone: number;
  groupTotal: number;
  runningCount: number;
  completedGlobal: number;
  totalGlobal: number;
  testEtaSeconds: number;
  globalEtaSeconds: number;
}) {
  const width = 16;
  const percent = Math.min(100, Math.max(0, (opts.completedGlobal / opts.totalGlobal) * 100));
  const filled = Math.round((width * percent) / 100);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
  const active = opts.runningCount > 0 ? ` (${opts.runningCount} active)` : "";
  const testEta = opts.runningCount > 0 ? ` | Test ETA: ${formatTime(opts.testEtaSeconds)}` : "";
  const line1 = `  \u2192 Group [${opts.groupName}]: ${opts.groupDone}/${opts.groupTotal} passed${active}${testEta}`;
  const line2 = `  \uD83D\uDCCA ${bar} ${Math.round(percent)}% | ${opts.completedGlobal}/${opts.totalGlobal} done | Total: ${formatTime(opts.globalEtaSeconds)}`;
  process.stdout.write(`\r\x1B[K${line1}\n\x1B[K${line2}\x1B[1A`);
}

let globalRemainingFiles: string[] = [];
const activeTestDurations = new Map<string, number>();

function calculateGlobalRemainingSeconds(
  runningTests: Set<string>,
  historicWeights: Record<string, number>,
  concurrency: number,
): number {
  let combinedWeightSeconds = 0;
  for (const file of globalRemainingFiles) {
    const name = getTestName(file);
    combinedWeightSeconds += historicWeights[name] || TEST_WEIGHTS[name] || 10;
  }
  for (const file of runningTests) {
    const name = getTestName(file);
    const totalEst = historicWeights[name] || TEST_WEIGHTS[name] || 10;
    const elapsed = (activeTestDurations.get(file) || 0) / 1000;
    combinedWeightSeconds += Math.max(totalEst * 0.2, totalEst - elapsed);
  }
  return Math.max(0, combinedWeightSeconds / concurrency);
}

async function run() {
  let totalFailed = 0;

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

    process.stdout.write(`  Starting server... `);

    const dbCreds = getDockerDefaultDbCredentials(db);

    const serverEnv = {
      ...process.env,
      DB_TYPE: db,
      PORT: String(port),
      API_BASE_URL: baseUrl,
      TEST_MODE: "true",
      BENCHMARK: "true",
      NODE_ENV: "test",
      USE_REDIS: "false",
      LOG_LEVEL: "fatal",
      QUIET: "true",
      JWT_SECRET_KEY: "Benchmark-JWT-Secret-Key-2026-32ch",
      ENCRYPTION_KEY: "Benchmark-Encryption-Key-2026-32ch",
      TEST_API_SECRET: apiSecret,
      ADMIN_PASSWORD: adminPassword,
      SVELTY_BENCHMARK_SUITE: "true",
      BENCHMARK_RECORD: "1",
      DB_NAME: "sveltycms_test",
      DB_HOST: "127.0.0.1",
      DB_USER: dbCreds.user,
      DB_PASSWORD: dbCreds.password,
      DB_PORT:
        db === "mariadb" ? "3306" : db === "postgresql" ? "5432" : db === "mongodb" ? "27017" : "",
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

    // ── Phase 2: System setup (best-effort) + testing API seed ──
    process.stdout.write(`  Setting up system... `);
    try {
      execSync("bun run scripts/setup-system.ts", {
        env: { ...serverEnv, API_BASE_URL: baseUrl, PRESET: "demo" },
        stdio: "pipe",
        shell: process.platform === "win32",
        timeout: 120_000,
      } as any);
      console.log("OK");
    } catch (e: any) {
      // Wizard seed can fail when live config/private.ts exists — testing API seed below is authoritative.
      console.log("SKIP");
      const note = e.stderr?.toString().slice(0, 200) || e.message;
      if (note) console.error(`  Setup note: ${note}`);
    }

    // Seed benchmark data via testing API
    process.stdout.write(`  Seeding benchmark data... `);
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
      if (seedRes.ok) {
        console.log("OK");
      } else {
        const txt = await seedRes.text().catch(() => "");
        console.log("FAILED");
        console.error(`  Seed error (${seedRes.status}): ${txt.slice(0, 300)}`);
        server.kill("SIGKILL");
        process.exit(1);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("FAILED");
      console.error(`  Seed error: ${msg}`);
      server.kill("SIGKILL");
      process.exit(1);
    }

    // ── Phase 3: Run tests ──
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const startTime = Date.now();

    // ETA tracking
    let totalElapsedTime = 0;
    let completedTests = 0;

    // Load historic weights
    const historicWeights = getHistoricWeights();

    // Initialize global time tracker
    globalRemainingFiles = orderedTests.filter((f) => !SKIP_IN_MATRIX.has(getTestName(f)));
    const totalGlobalCount = globalRemainingFiles.length;

    // Count skipped tests
    for (const file of orderedTests) {
      if (SKIP_IN_MATRIX.has(getTestName(file))) skipped++;
    }

    const runningTests = new Set<string>();

    for (const group of GROUPS) {
      const groupFiles = orderedTests.filter(
        (f) => group.tests.includes(getTestName(f)) && !SKIP_IN_MATRIX.has(getTestName(f)),
      );
      if (groupFiles.length === 0) continue;

      const concurrency = group.parallel ? (db === "sqlite" ? 1 : 3) : 1;
      const aboutTime = calculateGroupDuration(groupFiles, historicWeights, concurrency);

      console.log(`\n  \u26A1 ${group.name} (${groupFiles.length} tests \u2248 ${aboutTime})`);
      console.log(`  ${"\u2500".repeat(45)}`);

      const groupQueue = [...groupFiles];
      const groupTotalCount = groupFiles.length;
      let groupPassedCount = 0;
      const activePromises: Promise<void>[] = [];
      activeTestDurations.clear();

      // UI ticker (200ms refresh)
      const UIInterval = setInterval(() => {
        for (const file of runningTests) {
          activeTestDurations.set(file, (activeTestDurations.get(file) || 0) + 200);
        }
        // Calculate test-level ETA for active tests
        let testEtaSeconds = 0;
        for (const file of runningTests) {
          const name = getTestName(file);
          const totalEst = historicWeights[name] || TEST_WEIGHTS[name] || 10;
          const elapsed = (activeTestDurations.get(file) || 0) / 1000;
          const remaining = Math.max(0, totalEst - elapsed);
          if (testEtaSeconds === 0 || remaining < testEtaSeconds) testEtaSeconds = remaining;
        }
        const currentGlobalEta = calculateGlobalRemainingSeconds(
          runningTests,
          historicWeights,
          concurrency,
        );
        printProgressDashboard({
          groupName: group.name,
          groupDone: groupPassedCount,
          groupTotal: groupTotalCount,
          runningCount: runningTests.size,
          completedGlobal: completedTests,
          totalGlobal: totalGlobalCount,
          testEtaSeconds,
          globalEtaSeconds: currentGlobalEta,
        });
      }, 200);

      while (groupQueue.length > 0 || activePromises.length > 0) {
        while (activePromises.length < concurrency && groupQueue.length > 0) {
          const file = groupQueue.shift()!;
          globalRemainingFiles = globalRemainingFiles.filter((f) => f !== file);
          runningTests.add(file);
          activeTestDurations.set(file, 0);

          const name = getTestName(file);

          const testPromise = (async () => {
            const { code, durationMs, output } = await spawnTestProcess(
              file,
              serverEnv,
              baseUrl,
              BENCHMARK_RUN_ID,
            );
            runningTests.delete(file);
            activeTestDurations.delete(file);
            completedTests++;
            totalElapsedTime += durationMs;

            // Wipe the dashboard line before logging permanent result
            process.stdout.write("\r\x1B[K\n\x1B[K\x1B[1A");

            const seqNum = groupPassedCount + 1;
            const durationSec = (durationMs / 1000).toFixed(1);

            if (code !== 0) {
              failed++;
              clearInterval(UIInterval);
              console.log(
                `  ${seqNum.toString().padEnd(2)} ${name.padEnd(35)} \u274C  FAILED (${durationSec}s)`,
              );
              const lines = output.split("\n").filter(Boolean);
              const tail = lines.slice(-20);
              console.log(`  ${"\u2500".repeat(55)}`);
              for (const line of tail) console.log(`  ${line}`);
              console.log(`  ${"\u2500".repeat(55)}`);
              if (!CONTINUE_ON_ERROR) {
                server.kill("SIGKILL");
                process.exit(1);
              }
            } else {
              groupPassedCount++;
              passed++;
              console.log(
                `  ${seqNum.toString().padEnd(2)} ${name.padEnd(35)} \u2705  ${durationSec}s`,
              );
            }
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

      clearInterval(UIInterval);
      process.stdout.write("\r\x1B[K\n\x1B[K\x1B[1A");
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── Phase 4: Finalize report (batch MDX write) ──
    process.stdout.write(`  Finalizing report...`);
    try {
      process.env.DB_TYPE = db;
      process.env.BENCHMARK_MATRIX = "1";
      const { finalizeReport } = await import("../../tests/benchmarks/modules/benchmark-reporting");
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

      // Look for \uD83D\uDD34 indicators in trend labels
      const trendLines = content.split("\n").filter((l) => l.includes("### "));
      for (const line of trendLines) {
        const m = line.match(/### [^\s]+\s+(.+?)\s+[\u26AA\uD83D\uDFE2\uD83D\uDD34]/u);
        const name = m?.[1]?.trim();
        // Check for red indicators or negative percentages
        if (line.includes("\uD83D\uDD34")) {
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

run();
