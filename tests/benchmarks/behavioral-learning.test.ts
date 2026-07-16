/**
 * @file tests/benchmarks/behavioral-learning.test.ts
 * @description Behavioral Learning Engine Micro-Benchmark & Verification (Optimized)
 * @summary Measures latency of tracking operations, prefetch predictions, and Skinnerian reinforcement calculations.
 */

import { test, runBenchmark, printTruthTable, printSummaryTable } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import {
  recordCollectionAccess,
  recordEntryAccess,
  recordNavigation,
  reinforceTransition,
  penalizeTransition,
  applyExtinction,
  predictNextPath,
} from "@src/services/intelligence/behavioral-learner";
import { expect } from "vitest";

async function runBehavioralBenchmark() {
  console.log(`🚀 Starting BehavioralLearning Engine Benchmark...\n`);

  const TENANT = "global";
  const results = [];

  // --- 1. VERIFICATION OF SKINNERIAN REINFORCEMENT LOGIC ---
  console.log("   → Verifying Skinnerian Operant Conditioning scoring...");

  const fromPath = "/admin/collections";
  const toPathA = "/admin/collections/posts";
  const toPathB = "/admin/collections/pages";

  recordNavigation(TENANT, fromPath, toPathA);
  recordNavigation(TENANT, fromPath, toPathB);

  const prediction1 = predictNextPath(TENANT, fromPath);
  expect(prediction1).toBeDefined();

  reinforceTransition(TENANT, fromPath, toPathA);
  const prediction2 = predictNextPath(TENANT, fromPath);
  expect(prediction2).toBe("/admin/collections/posts");

  penalizeTransition(TENANT, fromPath, toPathA);
  reinforceTransition(TENANT, fromPath, toPathB);
  reinforceTransition(TENANT, fromPath, toPathB);
  const prediction3 = predictNextPath(TENANT, fromPath);
  expect(prediction3).toBe("/admin/collections/pages");

  applyExtinction(TENANT, fromPath, "pages");
  console.log("   ✅ Skinnerian verification passed.");

  // Pre-allocate configurations, dimensions, and targets to eliminate hot path allocations
  const RECORD_ITERATIONS = 10000;
  const LOOP_ITERATIONS = 5000;
  const INDEX_RANGE = 20;

  // Pre-build uniform identifier strings to insulate algorithmic pipelines from runtime GC spikes
  const staticIds = Array.from({ length: RECORD_ITERATIONS }, (_, i) => `b${i}`);

  // Pre-generate index lookups to remove micro-mathematical runtime calculations from timers
  const predictiveIndexes = Array.from({ length: LOOP_ITERATIONS }, (_, i) => i % INDEX_RANGE);

  // --- 2. BENCHMARK RECORDING LATENCY ---
  console.log(
    "   → Benchmarking Access Recording (recordCollectionAccess, recordEntryAccess, recordNavigation)...",
  );
  const recordResult = await runBenchmark({
    name: "Access Recording",
    iterations: RECORD_ITERATIONS,
    warmupIterations: 100,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async (i: number) => {
      const targetId = staticIds[i] ?? "fallback";
      recordCollectionAccess(TENANT, `col-${targetId}`);
      recordEntryAccess(TENANT, `col-${targetId}`, `entry-${targetId}`);
      recordNavigation(TENANT, `/path-${targetId}`, `/next-${targetId}`);
    },
  });
  results.push({ ...recordResult, layer: "Learner", shortLabel: "Record" });

  // --- 3. BENCHMARK PREDICTION LATENCY ---
  console.log("   → Benchmarking Path Prediction (predictNextPath)...");
  for (let i = 0; i < 500; i++) {
    recordNavigation(TENANT, `/from-${i % INDEX_RANGE}`, `/to-${i}`);
  }

  const predictResult = await runBenchmark({
    name: "Path Prediction",
    iterations: LOOP_ITERATIONS,
    warmupIterations: 50,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async (i: number) => {
      const idx = predictiveIndexes[i] ?? 0;
      predictNextPath(TENANT, `/from-${idx}`);
    },
  });
  results.push({ ...predictResult, layer: "Learner", shortLabel: "Predict" });

  // --- 4. BENCHMARK REINFORCEMENT & EXTINCTION LATENCY ---
  console.log("   → Benchmarking Operant Reinforcement Loops (reinforce, penalize, extinction)...");
  const reinforcementResult = await runBenchmark({
    name: "Reinforcement Cycles",
    iterations: LOOP_ITERATIONS,
    warmupIterations: 50,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async (i: number) => {
      const idx = predictiveIndexes[i] ?? 0;
      const targetFrom = `/from-${idx}`;
      const targetTo = `/to-${idx}`;

      reinforceTransition(TENANT, targetFrom, targetTo);
      penalizeTransition(TENANT, targetFrom, targetTo);
      applyExtinction(TENANT, targetFrom, targetTo);
    },
  });
  results.push({
    ...reinforcementResult,
    layer: "Learner",
    shortLabel: "Reinforce",
  });

  // --- 5. PRINT RESULTS ---
  printTruthTable({
    title: "SVELTYCMS — BEHAVIORAL LEARNING PERFORMANCE",
    shortLabel: "Behavioral",
    subtitle: "Internal Behavioral Scoring & Prediction Latencies",
    results,
  });

  printSummaryTable([
    { key: "Recording Overhead", val: recordResult.avgMs, unit: "ms" },
    { key: "Prediction (Best Match)", val: predictResult.avgMs, unit: "ms" },
    {
      key: "Reinforcement Loop Cycles",
      val: reinforcementResult.avgMs,
      unit: "ms",
    },
  ]);
}

test("Behavioral Learning Engine Performance Audit", async () => {
  await runBehavioralBenchmark();
}, 60000);
