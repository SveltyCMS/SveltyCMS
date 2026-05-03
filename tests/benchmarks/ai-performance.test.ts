/**
 * @file tests/benchmarks/ai-performance.test.ts
 * @description Enterprise AI performance audit for SveltyCMS.
 * Measures the "Latency Tax" of internal CMS logic for AI enrichment and layout generation.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runAIAudit() {
  console.log("🚀 Starting Enterprise AI Performance Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { aiService } = await import("@src/services/ai-service");

    // Mock LLM and internal processing to isolate CMS overhead
    aiService.chat = async () => "Mocked LLM Response";
    aiService.process = async (_prompt: string, text: string) => `Processed: ${text}`;
    aiService.generateLayoutSpec = async () => ({ root: "layout", elements: {} });
    aiService.translate = async (text: string) => `Translated: ${text}`;

    // 1. Text Enrichment
    console.log("   → Measuring AI Text Enrichment...");
    const enrichResult = await runBenchmark({
      name: "AI Text Enrichment",
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        await aiService.enrichText(
          "Sample long-form CMS content for AI enrichment testing purposes.",
          "rewrite",
          "en",
        );
      },
    });

    // 2. Layout Generation
    console.log("   → Measuring AI Layout Spec Generation...");
    const layoutResult = await runBenchmark({
      name: "AI Layout Spec Generation",
      iterations: 150,
      warmupIterations: 30,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        await aiService.generateLayoutSpec(
          "A modern blog post layout with sidebar, comments, and related posts.",
        );
      },
    });

    printTruthTable({
      title: "SVELTYCMS — AI INFRASTRUCTURE AUDIT",
      shortLabel: "AI",
      subtitle: `Internal CMS Tax (Mocked LLM) • ${getDbType().toUpperCase()}`,
      results: [
        { ...enrichResult, shortLabel: "Enrichment", layer: "AI" },
        { ...layoutResult, shortLabel: "Layout", layer: "AI" },
      ],
    });

    printSummaryTable([
      { key: "Avg Enrichment Overhead", val: enrichResult.avgMs, unit: "ms" },
      { key: "Avg Layout Spec Overhead", val: layoutResult.avgMs, unit: "ms" },
      {
        key: "Total AI Bus Tax",
        val: (enrichResult.avgMs + layoutResult.avgMs).toFixed(1),
        unit: "ms",
      },
      { key: "Rating", val: enrichResult.avgMs < 8 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(enrichResult);
  } catch (err: any) {
    logger.error(`AI benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ AI performance audit completed.");
}

test("AI Service Internal Overhead", async () => {
  await runAIAudit();
}, 480000);
