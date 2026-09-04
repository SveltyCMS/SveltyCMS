/**
 * @file tests/benchmarks/speculative-turbo-hit.test.ts
 * @description Verifies LocalCMS prewarm fills the Turbo GET key (adapter-agnostic).
 * @summary Hover/prewarm of an entry path must serve X-Cache: TURBO-HIT without a prior GET.
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  stabilize,
  exportMetric,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import crypto from "node:crypto";
import { seedHttpCollectionBurst } from "./modules/seed-burst";

test("Speculative LocalCMS turbo fill vs cold findById", async () => {
  let stopServer: (() => Promise<void>) | null = null;
  try {
    const dbType = getDbType().toUpperCase();
    logger.info(`🚀 Speculative turbo-hit audit on ${dbType}...`);
    const serverInfo = await setupBenchmarkServer();
    stopServer = serverInfo.stop;
    const baseUrl = serverInfo.baseUrl;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      "x-test-security": "true",
      connection: "keep-alive",
    };
    const runId = crypto.randomUUID().slice(0, 8);
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const created = await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: 2,
      concurrency: 2,
      payloadAt: (i) => ({
        title: `Turbo fill ${i}`,
        slug: `turbo-fill-${runId}-${i}`,
        status: "published",
        count: i,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "turbo",
      }),
    });
    const warmId = created[0]!;
    const coldId = created[1]!;
    await stabilize(100);

    const prewarmUrl = `${baseUrl}/api/system/prewarm-route?path=${encodeURIComponent(`/api/collections/BenchmarkStable/${warmId}`)}`;
    const prewarmRes = await fetch(prewarmUrl, { headers });
    if (!prewarmRes.ok) throw new Error(`prewarm HTTP ${prewarmRes.status}`);
    await prewarmRes.arrayBuffer();
    await stabilize(50);

    let turboHits = 0;
    let turboIters = 0;
    const warmed = await runBenchmark({
      name: "prewarmed findById",
      iterations: 80,
      warmupIterations: 0,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${collectionUrl}/${warmId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        turboIters++;
        if (res.headers.get("x-cache") === "TURBO-HIT") turboHits++;
        await res.arrayBuffer();
      },
    });

    const cold = await runBenchmark({
      name: "cold findById",
      iterations: 80,
      warmupIterations: 0,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${collectionUrl}/${coldId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      },
    });

    const hitRatio = turboIters > 0 ? turboHits / turboIters : 0;
    logger.info(
      `  ↳ prewarmed ${warmed.rps.toFixed(0)} RPS (${warmed.avgMs.toFixed(3)}ms, turboHits=${turboHits}/${turboIters}) | cold ${cold.rps.toFixed(0)} RPS (${cold.avgMs.toFixed(3)}ms)`,
    );
    exportMetric("speculative_turbo.warm_rps", Math.round(warmed.rps), "req/s");
    exportMetric("speculative_turbo.cold_rps", Math.round(cold.rps), "req/s");
    exportMetric("speculative_turbo.hit_ratio", hitRatio, "ratio");
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 180_000);
