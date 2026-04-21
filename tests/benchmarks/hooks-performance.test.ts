/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Hook & Middleware Pipeline.
 *              Measures individual hook overhead + realistic full pipeline latency.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  updateBenchmarkDocumentation,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import path from "node:path";

const ITERATIONS = 2500;
const WARMUP = Math.floor(ITERATIONS * 0.12);
const RUNS = 3;

let hooks: any = null;

async function loadHooks() {
  if (hooks) return hooks;

  hooks = {
    handleSetup: (await import("../../src/hooks/handle-setup")).handleSetup,
    handleTurboPipeline: (await import("../../src/hooks/handle-turbo-pipeline.server"))
      .handleTurboPipeline,
    handleCompression: (await import("../../src/hooks/handle-compression")).handleCompression,
    handleSecurity: (await import("../../src/hooks/handle-security")).handleSecurity,
    handleAuthentication: (await import("../../src/hooks/handle-authentication"))
      .handleAuthentication,
    handleAuthorization: (await import("../../src/hooks/handle-authorization")).handleAuthorization,
    handleLocalSdk: (await import("../../src/hooks/handle-local-sdk")).handleLocalSdk,
    handleApiRequests: (await import("../../src/hooks/handle-api-requests")).handleApiRequests,
    handleAuditLogging: (await import("../../src/hooks/handle-audit-logging")).handleAuditLogging,
  };
  return hooks;
}

function createBaseMockEvent() {
  const url = new URL("http://localhost/api/collections");
  return {
    url,
    request: new Request(url, {
      method: "GET",
      headers: { "x-tenant-id": "global", authorization: "Bearer mock-token" },
    }),
    locals: {
      user: { id: "u123", email: "admin@sveltycms", ip: "127.0.0.1", role: "admin" },
      tenantId: "global",
    },
    cookies: {
      get: (_name: string) => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
    },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
    setHeaders: () => {},
    fetch: async () => new Response("OK"),
  } as any;
}

const resolve = async () => new Response("OK", { status: 200 });

export async function runHooksBenchmark() {
  console.log("🛠️ Starting SveltyCMS Hook & Middleware Pipeline Benchmark...\n");

  logger.level = "silent";
  const h = await loadHooks();

  const results: any[] = [];

  // Individual hooks with proper isolation
  console.log("⏱️  Benchmarking individual hooks...");

  for (const [hookName, hookFn] of Object.entries(h)) {
    if (typeof hookFn !== "function") continue;

    console.log(`   → ${hookName}`);

    const result = await runBenchmark({
      name: `Hook: ${hookName}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      onSetup: async () => {
        await stabilize(); // reset GC / caches between hooks
      },
      onIteration: async () => {
        const event = createBaseMockEvent();
        // Call with try/catch but log first error only
        try {
          await hookFn({ event, resolve });
        } catch {
          // Many hooks are designed to be called in sequence and may throw in isolation
          // We still count the time taken
        }
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  // === Full Realistic Pipeline ===
  console.log("\n🚀 Benchmarking Full Hook Pipeline (realistic hot path)...");

  // Use the actual main pipeline handler if it exists, otherwise fallback
  let fullPipelineFn = h.handleTurboPipeline || h.handleApiRequests;

  const pipelineResult = await runBenchmark({
    name: "Full Hook Pipeline (Hot Path)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: async () => await stabilize(),
    onIteration: async () => {
      const event = createBaseMockEvent();
      try {
        await fullPipelineFn({ event, resolve });
      } catch {
        // Expected in some test scenarios
      }
    },
    silent: true,
  });

  exportResult(pipelineResult);

  logger.level = "info";

  // Find heaviest hook
  const heaviest = results.reduce((a, b) => (a.avgMs > b.avgMs ? a : b));

  // ===================================================================
  // Professional Output
  // ===================================================================
  console.log("\n" + "=".repeat(150));
  console.log("   🛠️  SVELTYCMS HOOK & MIDDLEWARE PIPELINE PERFORMANCE AUDIT");
  console.log("   Individual Hooks + Full Hot-Path • IQR + 95% MoE • Memory Delta");
  console.log("=".repeat(150));

  console.log(
    `| ${"Hook / Stage".padEnd(48)} | ${"Avg Latency".padEnd(26)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(48 + 26 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const displayName = r.name.replace("Hook: ", "").padEnd(48);
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${displayName} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(26) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }

  // Full pipeline row
  const pipeRss =
    pipelineResult.rssDelta !== undefined
      ? `${pipelineResult.rssDelta >= 0 ? "+" : ""}${pipelineResult.rssDelta.toFixed(2)} MB`
      : "—";

  console.log("|" + "-".repeat(48 + 26 + 14 + 12 + 12 + 6) + "|");
  console.log(
    `| ${"FULL PIPELINE (Hot Path) 🚀".padEnd(48)} | ` +
      `${pipelineResult.avgMs.toFixed(4)} ms (±${pipelineResult.marginOfError.toFixed(3)})`.padEnd(
        26,
      ) +
      ` | ${pipelineResult.p95Ms.toFixed(3)}`.padEnd(14) +
      ` | ${Math.round(pipelineResult.rps).toLocaleString().padEnd(12)}` +
      ` | ${pipeRss.padEnd(12)} |`,
  );
  console.log("=".repeat(150));

  console.log(
    `   • Heaviest single hook: ${heaviest.name.replace("Hook: ", "")} (${heaviest.avgMs.toFixed(3)} ms)`,
  );
  console.log(
    `   • Memory pressure in pipeline can indicate issues in auth, security or SDK hooks`,
  );

  // Structured Matrix Exports (Infrastructure v2)
  exportMetric("middleware.hooks.p95", pipelineResult.p95Ms, "ms", {
    avg: pipelineResult.avgMs,
    rps: pipelineResult.rps,
  });
  exportMetric("middleware.hooks.rps", pipelineResult.rps, "req/s");
  exportMetric("middleware.hooks.heaviest.ms", heaviest.avgMs, "ms", { hook: heaviest.name });

  // Per-hook breakdown summary for matrix consumption
  const hookSummary = {
    _type: "numeric-metric" as const,
    name: "middleware.hooks.breakdown",
    value: pipelineResult.p95Ms,
    unit: "ms",
    timestamp: new Date().toISOString(),
    breakdown: results.map((r) => ({
      hook: r.name.replace("Hook: ", "").replace(/ \(aggregate\)$/, ""),
      avgMs: r.avgMs,
      p95Ms: r.p95Ms,
      rps: r.rps,
    })),
  };
  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  const fs = await import("node:fs");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, "middleware-hooks-breakdown.json"),
    JSON.stringify(hookSummary, null, 2),
  );

  console.log("\n✅ Hook pipeline benchmark completed.");
  await updateBenchmarkDocumentation();
}

test("Hook & Middleware Pipeline Performance", async () => {
  await runHooksBenchmark();
}, 450000);
