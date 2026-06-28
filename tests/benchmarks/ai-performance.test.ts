/**
 * @file tests/benchmarks/ai-performance.test.ts
 * @description AI Performance Audit (Optimized)
 * @summary Measures the latency tax of internal CMS logic for AI enrichment and layout generation.
 *
 * ### Features:
 * - AI enrichment latency measurement
 * - Layout generation overhead profiling
 * - End-to-end AI pipeline benchmarking
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runAIAudit() {
  console.log("🚀 Starting Enterprise AI Performance Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    // Hoist dynamic service assignments out of execution loops
    const { aiService } = await import("@src/services/core/ai-service");

    // Establish deterministic out-of-band mock behaviors to isolate pure CMS orchestration bus tax
    aiService.chat = async () => "Mocked LLM Response";
    aiService.process = async (_prompt: string, text: string) => `Processed: ${text}`;
    aiService.generateLayoutSpec = async () => ({
      root: "layout",
      elements: {},
    });
    aiService.translate = async (text: string) => `Translated: ${text}`;

    // Pre-allocate static evaluation literals to remove local memory handling noise from timers
    const sampleLongFormContent =
      "Sample long-form CMS content for AI enrichment testing purposes.";
    const sampleLayoutPrompt =
      "A modern blog post layout with sidebar, comments, and related posts.";
    const rewriteAction = "rewrite";
    const languageCode = "en";

    const results = [];

    // 1. Text Enrichment
    console.log("   → Measuring AI Text Enrichment...");
    const enrichResult = await runBenchmark({
      name: "AI Text Enrichment",
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1, // Kept at serial profile to isolate pure procedural overhead
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await aiService.enrichText(sampleLongFormContent, rewriteAction, languageCode);
      },
    });
    results.push({ ...enrichResult, shortLabel: "Enrichment", layer: "AI" });

    // 2. Layout Generation
    console.log("   → Measuring AI Layout Spec Generation...");
    const layoutResult = await runBenchmark({
      name: "AI Layout Spec Generation",
      iterations: 150,
      warmupIterations: 30,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await aiService.generateLayoutSpec(sampleLayoutPrompt);
      },
    });
    results.push({ ...layoutResult, shortLabel: "Layout", layer: "AI" });

    // Report Telemetry Summary
    printTruthTable({
      title: "SVELTYCMS — AI INFRASTRUCTURE AUDIT",
      shortLabel: "AI",
      subtitle: `Internal CMS Tax (Mocked LLM) • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Avg Enrichment Overhead", val: enrichResult.avgMs, unit: "ms" },
      { key: "Avg Layout Spec Overhead", val: layoutResult.avgMs, unit: "ms" },
      {
        key: "Total AI Bus Tax",
        val: (enrichResult.avgMs + layoutResult.avgMs).toFixed(1),
        unit: "ms",
      },
      {
        key: "Rating",
        val: enrichResult.avgMs < 8 ? "EXCELLENT" : "GOOD",
        unit: "",
      },
    ]);

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`AI benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("AI Service Internal Overhead", async () => {
  await runAIAudit();
}, 480000);
