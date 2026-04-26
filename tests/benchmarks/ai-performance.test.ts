/**
 * @file tests/benchmarks/ai-performance.test.ts
 * @description Enterprise AI performance audit for SveltyCMS.
 * Measures the "Latency Tax" of internal CMS logic for AI enrichment and layout generation.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runAIAudit() {
  console.log("🚀 Starting Enterprise AI Performance Audit...\n");

  const { aiService } = await import("@src/services/ai-service");
  
  // Mock LLM Response to isolate CMS overhead
  const originalChat = aiService.chat;
  aiService.chat = async () => "Mocked LLM Response";

  await stabilize();

  try {
    // 1. Text Enrichment Loop
    console.log("   → Measuring AI Text Enrichment Logic...");
    const enrichResult = await runBenchmark({
      name: "AI Enrichment",
      iterations: 200,
      runs: 2,
      onIteration: async () => {
        await aiService.enrichText("Sample CMS content for enrichment.", "rewrite", "en");
      },
      silent: true,
    });

    // 2. Layout Generation Logic
    console.log("   → Measuring AI Layout Spec Generation...");
    const layoutResult = await runBenchmark({
      name: "AI Layout Spec",
      iterations: 100,
      runs: 1,
      onIteration: async () => {
        await aiService.generateLayoutSpec("A blog post layout with comments.", {});
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  AI INFRASTRUCTURE AUDIT",
      subtitle: `CMS Internal Tax (MOCKED LLM) • ${getDbType().toUpperCase()}`,
      results: [
        { ...enrichResult, layer: "Enrichment" },
        { ...layoutResult, layer: "Layout Gen" }
      ],
    });

    printSummaryTable([
      { key: "Avg Enrichment Overhead", val: enrichResult.avgMs, unit: "ms" },
      { key: "Avg Layout Spec Overhead", val: layoutResult.avgMs, unit: "ms" },
      { key: "Internal AI Bus Jitter", val: enrichResult.cv.toFixed(2), unit: "%" },
      { key: "Scalability Status", val: enrichResult.avgMs < 10 ? "ELITE" : "STABLE", unit: "" },
    ]);

    exportResult(enrichResult);
  } finally {
    aiService.chat = originalChat;
  }

  console.log("\n✅ AI performance audit completed.");
}

test("AI Service Internal Overhead", async () => {
  await runAIAudit();
}, 300000);
