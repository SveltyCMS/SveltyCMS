/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Hook & Middleware Pipeline.
 *              Measures individual hook overhead + realistic full pipeline latency.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const ITERATIONS = 2500;
const WARMUP = Math.floor(ITERATIONS * 0.15);
const RUNS = 3;

async function getHooks() {
  return {
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
}

function createMockEvent() {
  const url = new URL("http://localhost/api/test");
  return {
    url,
    request: new Request(url, { method: "GET" }),
    locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => "",
    },
    fetch: async () => new Response("OK", { status: 200 }),
    getClientAddress: () => "127.0.0.1",
    platform: {},
    isDataRequest: false,
    route: { id: "/api/test" },
    params: {},
    setHeaders: () => {},
  } as any;
}

const resolve = async () => new Response("OK", { status: 200 });

export async function runHooksBenchmark() {
  console.log("🛠️ Starting SveltyCMS Hook & Middleware Pipeline Benchmark...\n");

  logger.level = "silent";

  const hooks = await getHooks();
  const results: any[] = [];

  console.log("⏱️  Benchmarking individual hooks...");

  for (const [name, hookFn] of Object.entries(hooks)) {
    if (typeof hookFn !== "function") continue;

    console.log(`   → ${name}`);

    const result = await runBenchmark({
      name: `Hook: ${name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async () => {
        const event = createMockEvent();
        await Promise.resolve(hookFn({ event, resolve })).catch(() => {}); // ignore expected errors
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  // Full Hot-Path Pipeline
  console.log("\n🚀 Benchmarking Full Hook Pipeline (realistic hot path)...");

  const hotPathHooks = [
    hooks.handleTurboPipeline,
    hooks.handleCompression,
    hooks.handleSecurity,
    hooks.handleAuthentication,
    hooks.handleAuthorization,
    hooks.handleLocalSdk,
    hooks.handleApiRequests,
  ].filter(Boolean) as any[];

  const pipelineResult = await runBenchmark({
    name: "Full Hook Pipeline (Hot Path)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      let event = createMockEvent();
      for (const hookFn of hotPathHooks) {
        await Promise.resolve(hookFn({ event, resolve })).catch(() => {});
      }
    },
    silent: true,
  });

  exportResult(pipelineResult);

  logger.level = "info";

  // Identify Heaviest Hook
  const heaviestHook = results.reduce((prev, current) =>
    prev.avgMs > current.avgMs ? prev : current,
  );

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(140));
  console.log("   🛠️  SVELTYCMS HOOK & MIDDLEWARE PIPELINE AUDIT");
  console.log("   High-Fidelity • Multiple Runs • IQR Trimming • Memory Tracking");
  console.log("=".repeat(140));

  console.log(
    `| ${"Hook / Pipeline".padEnd(46)} | ${"Avg Latency".padEnd(24)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(46 + 24 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    const isHeaviest = r.name === heaviestHook.name;
    const displayName = `${r.name.replace("Hook: ", "")} ${isHeaviest ? " 🔥 [HEAVIEST]" : ""}`;

    console.log(
      `| ${displayName.padEnd(46)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(24) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(12)} |`,
    );
  }

  // Pipeline row
  const pipeRss =
    pipelineResult.rssDelta !== undefined
      ? `${pipelineResult.rssDelta >= 0 ? "+" : ""}${pipelineResult.rssDelta.toFixed(2)} MB`
      : "—";

  console.log("|" + "-".repeat(46 + 24 + 14 + 12 + 12 + 6) + "|");
  console.log(
    `| ${"FULL PIPELINE (Hot Path) 🚀".padEnd(46)} | ` +
      `${pipelineResult.avgMs.toFixed(4)} ms (±${pipelineResult.marginOfError.toFixed(3)})`.padEnd(
        24,
      ) +
      ` | ` +
      `${pipelineResult.p95Ms.toFixed(4)} ms`.padEnd(14) +
      ` | ` +
      `${Math.round(pipelineResult.rps).toLocaleString()}`.padEnd(12) +
      ` | ` +
      `${pipeRss.padEnd(12)} |`,
  );
  console.log("=".repeat(140));

  console.log(`\n✨ Pipeline Insights:`);
  console.log(`   • Total hot-path overhead: ${pipelineResult.avgMs.toFixed(4)} ms per request`);
  console.log(
    `   • Expected max throughput under this pipeline: ~${Math.floor(pipelineResult.rps).toLocaleString()} req/sec`,
  );
  console.log(
    `   • Memory growth in pipeline may indicate leaks in auth, SDK, or compression hooks`,
  );
  console.log(`   • Heaviest overhead detected in: ${heaviestHook.name.replace("Hook: ", "")}`);

  console.log("\n✅ Hook & Middleware benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Hook & Middleware Pipeline Performance", async () => {
    await runHooksBenchmark();
  }, 450000);
}
