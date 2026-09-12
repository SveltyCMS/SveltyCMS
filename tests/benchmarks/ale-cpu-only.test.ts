/**
 * @file tests/benchmarks/ale-cpu-only.test.ts
 * @description Isolated CPU-cost measurement for AES-256-GCM field encryption
 * (no DB write noise). Measures effective CPU utilization + per-op latency of
 * encryptDocumentFields over a sustained loop so process.cpuUsage() is stable.
 */
import { performance } from "node:perf_hooks";
import { test, describe, expect } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { encryptDocumentFields } from "@utils/security/field-encryption";

const COLLECTION_ID = "ale_cpu";
const TEST_TENANT = "global";
const ITERATIONS = 20000;
const FIELDS = ["email"];

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

describe("ALE — isolated AES-256-GCM CPU cost", () => {
  test("measure CPU utilization + latency of field encryption (sustained)", async () => {
    const ctx = { collectionId: COLLECTION_ID, tenantId: TEST_TENANT };
    const times: number[] = [];

    // warmup
    for (let i = 0; i < 2000; i++) {
      await encryptDocumentFields({ _id: `w${i}`, email: `user${i}@example.com` }, FIELDS, ctx);
    }

    const cpuBefore = process.cpuUsage();
    const wallStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      await encryptDocumentFields({ _id: `e${i}`, email: `user${i}@example.com` }, FIELDS, ctx);
      times.push(performance.now() - t0);
    }
    const wallEnd = performance.now();
    const cpuAfter = process.cpuUsage();

    const totalWallMs = wallEnd - wallStart;
    const cpuMs = (cpuAfter.user - cpuBefore.user + cpuAfter.system - cpuBefore.system) / 1000;
    const cpuPercent = Math.max(0, Math.min(100, (cpuMs / Math.max(totalWallMs, 1)) * 100));
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);

    const result = {
      iterations: ITERATIONS,
      avgMs: avgMs,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      totalWallMs,
      cpuMs,
      cpuPercent,
      opsPerSec: (ITERATIONS / totalWallMs) * 1000,
    };
    console.log("[ale-cpu] result:", JSON.stringify(result, null, 2));

    const fs = await import("node:fs");
    const path = await import("node:path");
    const out = path.resolve("tests/benchmarks/results/ale-cpu-only.json");
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log("[ale-cpu] written:", out);

    expect(result.opsPerSec).toBeGreaterThan(0);
    expect(result.avgMs).toBeGreaterThan(0);
  }, 300_000);
});
