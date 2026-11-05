/**
 * @file tests/unit/plugins/post-write-wasm-dual-track.test.ts
 * @description Verifies dual-track execution on the post-write path: 1st-party native vs 3rd-party WASM pool.
 */

import { describe, expect, it, afterEach } from "vitest";
import { pluginRegistry } from "@src/plugins/registry";
import { wasmPluginRunner } from "@src/plugins/wasm/wasm-plugin-runner";
import type { WasmPluginManifest } from "@src/plugins/wasm/types";
import { triggerLifecycleHook } from "@src/services/sdk/namespaces/collections/post-write";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

const MOCK_WASM_BYTES = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00, // magic + version
  0x01,
  0x07,
  0x01,
  0x60,
  0x02,
  0x7f,
  0x7f,
  0x01,
  0x7f, // Type 0: (i32, i32) -> i32
  0x03,
  0x02,
  0x01,
  0x00, // Function: type index 0
  0x07,
  0x14,
  0x01,
  0x10,
  ...Buffer.from("wasm_before_save"),
  0x00,
  0x00, // Export: wasm_before_save = fn 0
  0x0a,
  0x07,
  0x01,
  0x05,
  0x00,
  0x20,
  0x00,
  0x0f,
  0x0b, // Code: local.get 0, return, end
]);

const mockDbAdapter = {
  crud: {
    findMany: () => [],
    insert: () => ({ success: true }),
  },
} as unknown as IDBAdapter;

const mockSchema: Schema = {
  _id: "posts",
  name: "posts",
  fields: [],
  status: "published",
} as any;

describe("Dual-Track Post-Write Path (Native vs WASM)", () => {
  afterEach(() => {
    wasmPluginRunner.destroyAll();
    pluginRegistry.clear();
  });

  it("bails immediately when no plugin implements the hook (0.00ms baseline)", () => {
    const rawData = { title: "Unmodified Post" };
    const t0 = performance.now();
    const result = triggerLifecycleHook(
      mockDbAdapter,
      "beforeSave",
      "posts",
      rawData,
      { tenantId: "default" as DatabaseId },
      mockSchema,
    );
    const duration = performance.now() - t0;

    expect(result).toBe(rawData);
    expect(duration).toBeLessThan(0.5);
  });

  it("executes 1st-party plugin natively in-process without WASM overhead", async () => {
    let nativeCalled = false;
    const nativePlugin = {
      metadata: {
        id: "native-seo",
        name: "Native SEO",
        version: "1.0.0",
        enabled: true,
      },
      hooks: {
        beforeSave: async (_ctx: any, _collId: string, data: any) => {
          nativeCalled = true;
          return { ...data, seoScore: 95 };
        },
      },
    };

    await pluginRegistry.register(nativePlugin as any);
    pluginRegistry.invalidateHookPresence();

    const result = await triggerLifecycleHook(
      mockDbAdapter,
      "beforeSave",
      "posts",
      { title: "Article" },
      { tenantId: "default" as DatabaseId },
      mockSchema,
    );

    expect(nativeCalled).toBe(true);
    expect(result.seoScore).toBe(95);
  });

  it("routes 3rd-party plugin through the pre-warmed WASM pool", async () => {
    const manifest: WasmPluginManifest = {
      id: "wasm-slugifier",
      name: "WASM Slugifier",
      version: "1.0.0",
      capabilities: ["db:read"],
      poolSize: 2,
    };

    await wasmPluginRunner.registerWasmPlugin(manifest, MOCK_WASM_BYTES);

    const wasmPluginEntry = {
      metadata: {
        id: "wasm-slugifier",
        name: "WASM Slugifier",
        version: "1.0.0",
        enabled: true,
        isThirdParty: true,
      },
    };

    await pluginRegistry.register(wasmPluginEntry as any);
    pluginRegistry.invalidateHookPresence();

    expect(wasmPluginRunner.isWasmPlugin("wasm-slugifier")).toBe(true);

    const result = await triggerLifecycleHook(
      mockDbAdapter,
      "beforeSave",
      "posts",
      { title: "My New Article" },
      { tenantId: "default" as DatabaseId },
      mockSchema,
    );

    expect(result).toBeDefined();

    // Verify telemetry captured the execution
    const metrics = wasmPluginRunner.getAllMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].pluginId).toBe("wasm-slugifier");
    expect(metrics[0].invocationsTotal).toBeGreaterThanOrEqual(1);
  });

  it("aborts mutation on trap when failure policy is fail-closed (default for beforeSave)", async () => {
    const TRAPPING_WASM_BYTES = new Uint8Array([
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
      0x7f,
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
      0x05,
      0x01,
      0x03,
      0x00,
      0x00, // unreachable instruction
      0x0b,
    ]);

    const manifest: WasmPluginManifest = {
      id: "trapping-plugin",
      name: "Trapping Plugin",
      version: "1.0.0",
      capabilities: [],
      poolSize: 1,
      defaultFailurePolicy: "fail-closed",
    };

    await wasmPluginRunner.registerWasmPlugin(manifest, TRAPPING_WASM_BYTES);

    const wasmPluginEntry = {
      metadata: {
        id: "trapping-plugin",
        name: "Trapping Plugin",
        version: "1.0.0",
        enabled: true,
        isThirdParty: true,
        defaultFailurePolicy: "fail-closed",
      },
    };

    await pluginRegistry.register(wasmPluginEntry as any);
    pluginRegistry.invalidateHookPresence();

    await expect(
      triggerLifecycleHook(
        mockDbAdapter,
        "beforeSave",
        "posts",
        { title: "Dangerous Write" },
        { tenantId: "default" as DatabaseId },
        mockSchema,
      ),
    ).rejects.toThrow('failed in hook "beforeSave"');
  });

  it("proceeds with original data on trap when failure policy is fail-open", async () => {
    const TRAPPING_WASM_BYTES = new Uint8Array([
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
      0x7f,
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
      0x05,
      0x01,
      0x03,
      0x00,
      0x00, // unreachable instruction
      0x0b,
    ]);

    const manifest: WasmPluginManifest = {
      id: "soft-fail-plugin",
      name: "Soft Fail Plugin",
      version: "1.0.0",
      capabilities: [],
      poolSize: 1,
      defaultFailurePolicy: "fail-open",
    };

    await wasmPluginRunner.registerWasmPlugin(manifest, TRAPPING_WASM_BYTES);

    const wasmPluginEntry = {
      metadata: {
        id: "soft-fail-plugin",
        name: "Soft Fail Plugin",
        version: "1.0.0",
        enabled: true,
        isThirdParty: true,
        defaultFailurePolicy: "fail-open",
      },
    };

    await pluginRegistry.register(wasmPluginEntry as any);
    pluginRegistry.invalidateHookPresence();

    const originalData = { title: "Soft Fail Safe Write" };
    const result = await triggerLifecycleHook(
      mockDbAdapter,
      "beforeSave",
      "posts",
      originalData,
      { tenantId: "default" as DatabaseId },
      mockSchema,
    );

    expect(result).toEqual(originalData);
  });
});
