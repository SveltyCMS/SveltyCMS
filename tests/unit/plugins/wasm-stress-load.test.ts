/**
 * @file tests/unit/plugins/wasm-stress-load.test.ts
 * @description Concurrent stress and load testing for the WASM Micro-Sandbox tier:
 * evaluates latency under concurrent borrow/return pressure, large payload marshalling (10KB–50KB),
 * dual-track contention, and memory growth stability across hundreds of executions.
 */

import { describe, expect, it, afterEach } from "vitest";
import { WasmPluginPool } from "@src/plugins/wasm/wasm-plugin-pool";
import { wasmPluginRunner } from "@src/plugins/wasm/wasm-plugin-runner";
import { pluginRegistry } from "@src/plugins/registry";
import { triggerLifecycleHook } from "@src/services/sdk/namespaces/collections/post-write";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { WasmHostContext, WasmPluginManifest } from "@src/plugins/wasm/types";

// Valid WASM module exporting wasm_before_save(i32, i32) -> i32 (returns 0: ok)
const BENCHMARK_WASM_BYTES = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x07,
  0x01,
  0x60,
  0x02,
  0x7f,
  0x7f,
  0x01,
  0x7f, // (i32, i32) -> i32
  0x03,
  0x02,
  0x01,
  0x00,
  0x07,
  0x14,
  0x01,
  0x10,
  ...Buffer.from("wasm_before_save"),
  0x00,
  0x00,
  0x0a,
  0x07,
  0x01,
  0x05,
  0x00,
  0x20,
  0x00,
  0x0f,
  0x0b, // return 0
]);

function createRealisticDocument(targetBytes: number): Record<string, unknown> {
  const filler = "x".repeat(1024);
  const itemsCount = Math.floor(targetBytes / 1024);
  const items = Array.from({ length: itemsCount }, (_, i) => ({
    id: `item-${i}`,
    title: `Document Section ${i}`,
    payload: filler,
    timestamp: "2026-11-05T16:00:00.000Z",
    tags: ["benchmark", "cms", "wasm", "micro-sandbox"],
    metadata: { version: i, active: true },
  }));

  return {
    _id: "doc-benchmark-100",
    title: "Large Benchmark Document",
    sections: items,
    author: { id: "user-1", name: "Administrator" },
  };
}

function createMockDbAdapter(): IDBAdapter {
  return {
    crud: {
      findMany: () => [],
      insert: () => ({ success: true }),
    },
  } as unknown as IDBAdapter;
}

function createMockContext(pluginId: string): WasmHostContext {
  return {
    pluginId,
    tenantId: "tenant-bench",
    user: { _id: "u-admin", email: "admin@corp.internal", role: "admin" } as any,
    dbAdapter: createMockDbAdapter(),
    pluginConfig: { maxLimit: 50 },
    capabilities: new Set(["db:read", "db:write:own"]),
    stats: {
      queryCount: 0,
      bytesWritten: 0,
      startTimeMs: performance.now(),
    },
  };
}

const mockSchema: Schema = {
  _id: "posts",
  name: "posts",
  fields: [],
  status: "published",
} as any;

describe("WASM Micro-Sandbox — Concurrent Load & Memory Stress Testing", () => {
  afterEach(() => {
    wasmPluginRunner.destroyAll();
    pluginRegistry.clear();
  });

  it("handles 50 concurrent executions under pool saturation without drops", async () => {
    const manifest: WasmPluginManifest = {
      id: "stress-pool-test",
      name: "Stress Pool",
      version: "1.0.0",
      capabilities: ["db:read"],
      poolSize: 4, // 4 instances serving 50 concurrent requests
      timeoutMs: 500, // queue timeout
    };

    const pool = new WasmPluginPool(manifest, BENCHMARK_WASM_BYTES);
    await pool.initialize();

    const payload = createRealisticDocument(10 * 1024); // 10 KB payload

    // JIT Warm-up: 50 warm-up runs
    for (let i = 0; i < 50; i++) {
      const ctx = createMockContext("stress-pool-test");
      await pool.executeHook("beforeSave", payload, ctx);
    }

    // Concurrent burst: 50 parallel executions
    const CONCURRENCY = 50;
    const start = performance.now();
    const tasks = Array.from({ length: CONCURRENCY }, () => {
      const ctx = createMockContext("stress-pool-test");
      return pool.executeHook("beforeSave", payload, ctx);
    });

    const results = await Promise.all(tasks);
    const totalDuration = performance.now() - start;

    expect(results).toHaveLength(CONCURRENCY);
    const successful = results.filter((r) => r.success);
    expect(successful).toHaveLength(CONCURRENCY);

    const metrics = pool.getMetrics();
    expect(metrics.invocationsTotal).toBe(CONCURRENCY + 50);
    expect(metrics.invocationsFailed).toBe(0);
    expect(metrics.timeoutsTotal).toBe(0);
    expect(metrics.activeInstances).toBe(0); // all instances returned to pool
    expect(metrics.idleInstances).toBe(4);

    // Assert that average execution time remains tight
    expect(metrics.avgExecutionTimeMs).toBeGreaterThan(0);
    expect(totalDuration).toBeLessThan(1000); // 50 requests handled well within 1 second

    pool.destroy();
  });

  it("maintains memory stability across 250 sustained executions with 30KB documents", async () => {
    const manifest: WasmPluginManifest = {
      id: "memory-stability-test",
      name: "Memory Stability",
      version: "1.0.0",
      capabilities: [],
      poolSize: 2,
      maxMemoryPages: 8, // 512 KB per instance
    };

    const pool = new WasmPluginPool(manifest, BENCHMARK_WASM_BYTES);
    await pool.initialize();

    const initialMemory = pool.getAllocatedMemoryBytes();
    expect(initialMemory).toBeGreaterThan(0);

    const largePayload = createRealisticDocument(30 * 1024); // 30 KB document

    // Run 250 sequential & batched executions to stress memory & recycling
    const BATCH_SIZE = 25;
    for (let b = 0; b < 10; b++) {
      const tasks = Array.from({ length: BATCH_SIZE }, () => {
        const ctx = createMockContext("memory-stability-test");
        return pool.executeHook("beforeSave", largePayload, ctx);
      });
      const batchResults = await Promise.all(tasks);
      expect(batchResults.every((r) => r.success)).toBe(true);
    }

    const finalMemory = pool.getAllocatedMemoryBytes();
    // Memory should remain flat and bounded by the instance allocation
    expect(finalMemory).toBe(initialMemory);

    const metrics = pool.getMetrics();
    expect(metrics.invocationsTotal).toBe(250);
    expect(metrics.invocationsFailed).toBe(0);

    pool.destroy();
  });

  it("executes dual-track post-write path concurrently without 1st-party interference", async () => {
    // 1. Register 1st-party native plugin
    let nativeInvocations = 0;
    const nativePlugin = {
      metadata: {
        id: "native-counter",
        name: "Native Counter",
        version: "1.0.0",
        enabled: true,
      },
      hooks: {
        beforeSave: async (_ctx: any, _collId: string, data: any) => {
          nativeInvocations++;
          return { ...data, nativeProcessed: true };
        },
      },
    };
    await pluginRegistry.register(nativePlugin as any);

    // 2. Register 3rd-party WASM plugin
    const manifest: WasmPluginManifest = {
      id: "wasm-worker",
      name: "WASM Worker",
      version: "1.0.0",
      capabilities: ["db:read"],
      poolSize: 3,
    };
    await wasmPluginRunner.registerWasmPlugin(manifest, BENCHMARK_WASM_BYTES);

    const wasmPluginEntry = {
      metadata: {
        id: "wasm-worker",
        name: "WASM Worker",
        version: "1.0.0",
        enabled: true,
        isThirdParty: true,
      },
    };
    await pluginRegistry.register(wasmPluginEntry as any);
    pluginRegistry.invalidateHookPresence();

    const db = createMockDbAdapter();
    const payload = { title: "Dual Track Concurrency", body: "Fast path" };

    // 3. Fire 30 concurrent dual-track requests
    const CONCURRENCY = 30;
    const tasks = Array.from({ length: CONCURRENCY }, () => {
      return triggerLifecycleHook(
        db,
        "beforeSave",
        "posts",
        payload,
        { tenantId: "default" as DatabaseId },
        mockSchema,
      );
    });

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(CONCURRENCY);
    expect(nativeInvocations).toBe(CONCURRENCY);
    expect(results.every((r) => r.nativeProcessed === true)).toBe(true);

    const wasmMetrics = wasmPluginRunner.getAllMetrics();
    expect(wasmMetrics).toHaveLength(1);
    expect(wasmMetrics[0].invocationsTotal).toBe(CONCURRENCY);
    expect(wasmMetrics[0].invocationsFailed).toBe(0);
  });
});
