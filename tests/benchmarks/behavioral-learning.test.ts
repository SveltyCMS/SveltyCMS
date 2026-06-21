/**
 * @file tests/benchmarks/behavioral-learning.test.ts
 * @description Behavioral Learning Engine Micro-Benchmark & Verification
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
import { expect } from "bun:test";

async function runBehavioralBenchmark() {
  console.log(`🚀 Starting BehavioralLearning Engine Benchmark...\n`);

  const TENANT = "global";
  const results = [];

  // --- 1. VERIFICATION OF SKINNERIAN REINFORCEMENT LOGIC ---
  console.log("   → Verifying Skinnerian Operant Conditioning scoring...");

  // Set up initial navigation state
  const fromPath = "/admin/collections";
  const toPathA = "/admin/collections/posts";
  const toPathB = "/admin/collections/pages";

  // Record standard hits
  recordNavigation(TENANT, fromPath, toPathA);
  recordNavigation(TENANT, fromPath, toPathB);

  // Confirm prediction is currently equal or based on order of insertion/scores
  const prediction1 = predictNextPath(TENANT, fromPath);
  expect(prediction1).toBeDefined();

  // Apply Positive Reinforcement to path A
  reinforceTransition(TENANT, fromPath, toPathA);
  const prediction2 = predictNextPath(TENANT, fromPath);
  expect(prediction2).toBe("/admin/collections/posts"); // "posts" should now be the clear winner due to +2.0 reinforcement

  // Apply Punishment/Bounce to path A
  penalizeTransition(TENANT, fromPath, toPathA);
  // Apply Positive Reinforcement to path B to make it the winner
  reinforceTransition(TENANT, fromPath, toPathB);
  reinforceTransition(TENANT, fromPath, toPathB);
  const prediction3 = predictNextPath(TENANT, fromPath);
  expect(prediction3).toBe("/admin/collections/pages"); // "pages" should take over due to posts penalty and pages reinforcement

  // Apply Extinction to alternative paths when pages is navigated to
  applyExtinction(TENANT, fromPath, "pages");
  console.log("   ✅ Skinnerian verification passed.");

  // --- 2. BENCHMARK RECORDING LATENCY ---
  console.log(
    "   → Benchmarking Access Recording (recordCollectionAccess, recordEntryAccess, recordNavigation)...",
  );
  const recordResult = await runBenchmark({
    name: "Access Recording",
    iterations: 10000,
    warmupIterations: 100,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const id = Math.random().toString(36).substring(2, 7);
      recordCollectionAccess(TENANT, `col-${id}`);
      recordEntryAccess(TENANT, `col-${id}`, `entry-${id}`);
      recordNavigation(TENANT, `/path-${id}`, `/next-${id}`);
    },
  });
  results.push({ ...recordResult, layer: "Learner", shortLabel: "Record" });

  // --- 3. BENCHMARK PREDICTION LATENCY ---
  console.log("   → Benchmarking Path Prediction (predictNextPath)...");
  // Seed a lot of transitions first to simulate a real running system
  for (let i = 0; i < 500; i++) {
    recordNavigation(TENANT, `/from-${i % 20}`, `/to-${i}`);
  }
  const predictResult = await runBenchmark({
    name: "Path Prediction",
    iterations: 5000,
    warmupIterations: 50,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const idx = Math.floor(Math.random() * 20);
      predictNextPath(TENANT, `/from-${idx}`);
    },
  });
  results.push({ ...predictResult, layer: "Learner", shortLabel: "Predict" });

  // --- 4. BENCHMARK REINFORCEMENT & EXTINCTION LATENCY ---
  console.log("   → Benchmarking Operant Reinforcement Loops (reinforce, penalize, extinction)...");
  const reinforcementResult = await runBenchmark({
    name: "Reinforcement Cycles",
    iterations: 5000,
    warmupIterations: 50,
    runs: 3,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const idx = Math.floor(Math.random() * 20);
      reinforceTransition(TENANT, `/from-${idx}`, `/to-${idx}`);
      penalizeTransition(TENANT, `/from-${idx}`, `/to-${idx}`);
      applyExtinction(TENANT, `/from-${idx}`, `/to-${idx}`);
    },
  });
  results.push({ ...reinforcementResult, layer: "Learner", shortLabel: "Reinforce" });

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
    { key: "Reinforcement Loop Cycles", val: reinforcementResult.avgMs, unit: "ms" },
  ]);
}

test("Behavioral Learning Engine Performance Audit", async () => {
  await runBehavioralBenchmark();
}, 60000);
