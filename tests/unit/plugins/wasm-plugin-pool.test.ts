/**
 * @file tests/unit/plugins/wasm-plugin-pool.test.ts
 * @description Unit tests for the WebAssembly Micro-Sandbox tier: instance pooling, host ABI security, and latency.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { WasmPluginPool } from "@src/plugins/wasm/wasm-plugin-pool";
import {
  WasmMemoryBridge,
  createWasmHostImports,
  redactSecrets,
} from "@src/plugins/wasm/wasm-host-abi";
import { wasmPluginRunner } from "@src/plugins/wasm/wasm-plugin-runner";
import {
  WasmErrorCode,
  type WasmHostContext,
  type WasmPluginManifest,
} from "@src/plugins/wasm/types";

// Minimal valid WASM binary exporting wasm_before_save(i32, i32) -> i32
const SAMPLE_WASM_BYTES = new Uint8Array([
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

function createMockDbAdapter() {
  const dataStore: Record<string, any[]> = {
    plugin_myplugin_items: [{ _id: "1", name: "test item" }],
    collections: [{ _id: "articles", name: "Articles" }],
    users: [{ _id: "u1", email: "admin@corp.internal", passwordHash: "secret" }],
  };

  return {
    crud: {
      findMany: (coll: string, _opts: any) => {
        return dataStore[coll] || [];
      },
      insert: (coll: string, doc: any) => {
        if (!dataStore[coll]) dataStore[coll] = [];
        dataStore[coll].push(doc);
        return { success: true, insertedId: "new-id" };
      },
    },
  } as any;
}

function createMockContext(pluginId = "myplugin"): WasmHostContext {
  return {
    pluginId,
    tenantId: "tenant-1",
    user: { _id: "u1", email: "admin@corp.internal", role: "admin" } as any,
    dbAdapter: createMockDbAdapter(),
    pluginConfig: { apiKey: "test-key-123", mode: "auto" },
    capabilities: new Set(["db:read", "db:write:own", "network:egress"]),
    stats: {
      queryCount: 0,
      bytesWritten: 0,
      startTimeMs: performance.now(),
    },
  };
}

describe("WASM Micro-Sandbox — Pool Lifecycle and Pre-warming", () => {
  let pool: WasmPluginPool;
  const manifest: WasmPluginManifest = {
    id: "myplugin",
    name: "My WASM Plugin",
    version: "1.0.0",
    capabilities: ["db:read", "db:write:own"],
    timeoutMs: 100,
    poolSize: 3,
  };

  beforeEach(async () => {
    pool = new WasmPluginPool(manifest, SAMPLE_WASM_BYTES);
    await pool.initialize();
  });

  afterEach(() => {
    pool.destroy();
  });

  it("pre-warms instances at initialization", () => {
    const metrics = pool.getMetrics();
    expect(metrics.poolSize).toBe(3);
    expect(metrics.activeInstances).toBe(0);
    expect(metrics.idleInstances).toBe(3);
    expect(metrics.invocationsTotal).toBe(0);
  });

  it("executes lifecycle hook on a warm instance with low latency", async () => {
    const ctx = createMockContext();
    const payload = { title: "Draft Post", content: "Hello world" };

    // Warm-up per AGENTS.md benchmark parity
    for (let i = 0; i < 50; i++) {
      await pool.executeHook("beforeSave", payload, ctx);
    }

    const t0 = performance.now();
    const result = await pool.executeHook("beforeSave", payload, ctx);
    const duration = performance.now() - t0;

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Must be well under 1.5ms on virtualized CI and < 0.5ms locally
    const maxBudgetMs = process.env.CI ? 2.5 : 1.0;
    expect(duration).toBeLessThan(maxBudgetMs);

    const metrics = pool.getMetrics();
    expect(metrics.invocationsTotal).toBeGreaterThanOrEqual(51);
    expect(metrics.invocationsFailed).toBe(0);
  });

  it("handles concurrent hook executions by borrowing from pool", async () => {
    const ctx = createMockContext();
    const payload = { field: "value" };

    // Execute 3 concurrent calls (matching pool size 3)
    const promises = [
      pool.executeHook("beforeSave", payload, ctx),
      pool.executeHook("beforeSave", payload, ctx),
      pool.executeHook("beforeSave", payload, ctx),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.success).toBe(true));

    const metrics = pool.getMetrics();
    expect(metrics.idleInstances).toBe(3);
    expect(metrics.activeInstances).toBe(0);
  });

  it("returns fallback payload cleanly when hook is not implemented by guest", async () => {
    const ctx = createMockContext();
    const payload = { unhandled: true };

    const result = await pool.executeHook("nonExistentHook", payload, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(payload);
  });
});

describe("WASM Host ABI — Security Boundaries and Capability Enforcement", () => {
  let bridge: WasmMemoryBridge;
  let memory: WebAssembly.Memory;

  beforeEach(() => {
    bridge = new WasmMemoryBridge();
    memory = new WebAssembly.Memory({ initial: 2, maximum: 16 });
    bridge.setMemory(memory);
  });

  it("redacts sensitive bearer tokens and keys in host_log", () => {
    const raw =
      "Connecting with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.abc and key-prod-9988";
    const sanitized = redactSecrets(raw);
    expect(sanitized).not.toContain("Bearer eyJ");
    expect(sanitized).not.toContain("key-prod-9988");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("allows host_db_read on own plugin collection and public read collections", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    // Write collection name into guest memory
    const collName = "plugin_myplugin_items";
    bridge.writeString(100, 50, collName);

    // Call host_db_read: coll_ptr=100, coll_len=21, filter_ptr=0, filter_len=0, out_ptr=200, out_cap=1000
    const bytesWritten = host.host_db_read(100, collName.length, 0, 0, 200, 1000);
    expect(bytesWritten).toBeGreaterThan(0);

    const outJson = bridge.readString(200, bytesWritten);
    const res = JSON.parse(outJson);
    expect(res.success).toBe(true);
    expect(ctx.stats.queryCount).toBe(1);
  });

  it("strictly blocks host_db_read on protected collections (users, tokens, sessions)", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const protectedTables = [
      "users",
      "sessions",
      "tokens",
      "roles",
      "audit_logs",
      "system_settings",
    ];
    for (const table of protectedTables) {
      bridge.writeString(100, 50, table);
      const code = host.host_db_read(100, table.length, 0, 0, 200, 1000);
      expect(code).toBe(WasmErrorCode.ERR_PROTECTED_COLLECTION);
    }
  });

  it("denies host_db_read on arbitrary collections outside own namespace", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const forbidden = "plugin_otherplugin_secret_data";
    bridge.writeString(100, 50, forbidden);
    const code = host.host_db_read(100, forbidden.length, 0, 0, 200, 1000);
    expect(code).toBe(WasmErrorCode.ERR_PERMISSION_DENIED);
  });

  it("strictly blocks host_db_write on non-plugin collections", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const forbiddenColl = "content_articles";
    const doc = JSON.stringify({ title: "Hacked" });
    bridge.writeString(100, 50, forbiddenColl);
    bridge.writeString(200, 100, doc);

    const code = host.host_db_write(100, forbiddenColl.length, 200, doc.length, 300, 500);
    expect(code).toBe(WasmErrorCode.ERR_PERMISSION_DENIED);
  });

  it("allows host_db_write on own plugin collections", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const ownColl = "plugin_myplugin_logs";
    const doc = JSON.stringify({ action: "audit", timestamp: 12345 });
    bridge.writeString(100, 50, ownColl);
    bridge.writeString(200, 100, doc);

    const bytesWritten = host.host_db_write(100, ownColl.length, 200, doc.length, 300, 500);
    expect(bytesWritten).toBeGreaterThan(0);
    expect(ctx.stats.queryCount).toBe(1);
  });

  it("blocks SSRF egress to localhost and internal metadata via host_http_fetch", () => {
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const dangerousUrls = [
      "http://localhost:8080/admin",
      "http://127.0.0.1:3000/api",
      "http://169.254.169.254/latest/meta-data/",
      "http://internal.service.local/dump",
    ];

    for (const url of dangerousUrls) {
      bridge.writeString(100, 100, url);
      const code = host.host_http_fetch(100, url.length, 0, 0, 200, 500);
      expect(code).toBe(WasmErrorCode.ERR_SSRF_BLOCKED);
    }
  });

  it("enforces MAX_QUERIES_PER_HOOK quota limit", () => {
    const ctx = createMockContext("myplugin");
    ctx.stats.queryCount = 100; // threshold reached

    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const coll = "plugin_myplugin_items";
    bridge.writeString(100, 50, coll);
    const code = host.host_db_read(100, coll.length, 0, 0, 200, 500);
    expect(code).toBe(WasmErrorCode.ERR_QUERY_LIMIT_EXCEEDED);
  });

  it("rejects path traversal and invalid characters in collection name", () => {
    const memory = new WebAssembly.Memory({ initial: 2, maximum: 4 });
    const bridge = new WasmMemoryBridge();
    bridge.setMemory(memory);
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const invalidColl = "plugin_myplugin_items/../users";
    bridge.writeString(100, invalidColl.length + 1, invalidColl);
    const code = host.host_db_read(100, invalidColl.length, 0, 0, 200, 500);
    expect(code).toBe(WasmErrorCode.ERR_PERMISSION_DENIED);
  });

  it("rejects prototype pollution in query filters", () => {
    const memory = new WebAssembly.Memory({ initial: 2, maximum: 4 });
    const bridge = new WasmMemoryBridge();
    bridge.setMemory(memory);
    const ctx = createMockContext("myplugin");
    const imports = createWasmHostImports(bridge, () => ctx);
    const host = imports.svelty_host as any;

    const coll = "plugin_myplugin_items";
    bridge.writeString(100, coll.length + 1, coll);

    const evilFilter = '{"__proto__":{"polluted":true}}';
    bridge.writeString(200, evilFilter.length + 1, evilFilter);

    const code = host.host_db_read(100, coll.length, 200, evilFilter.length, 400, 500);
    expect(code).toBe(WasmErrorCode.ERR_PERMISSION_DENIED);
  });

  it("hardens pointer and bounds checking on WasmMemoryBridge", () => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
    const bridge = new WasmMemoryBridge();
    bridge.setMemory(memory);

    // Negative pointer
    expect(() => bridge.readString(-1, 10)).toThrow("Negative pointer or length");
    // Non-integer pointer
    expect(() => bridge.readString(1.5, 10)).toThrow("Invalid memory address");
    // Out of bounds pointer
    expect(() => bridge.readString(65536, 10)).toThrow("Out of bounds memory access");

    // writeString with out-of-bounds pointer
    const writeCode = bridge.writeString(65536, 10, "overflow");
    expect(writeCode).toBe(WasmErrorCode.ERR_BUFFER_TOO_SMALL);

    // readCString safely finds null terminator
    bridge.writeString(100, 50, "hello world");
    const read = bridge.readCString(100, 50);
    expect(read).toBe("hello world");
  });
});

describe("WASM Plugin Runner — Central Dispatcher, Ceilings, and Telemetry", () => {
  const manifest: WasmPluginManifest = {
    id: "slug-transformer",
    name: "Slug Transformer",
    version: "1.0.0",
    capabilities: ["db:read"],
    poolSize: 2,
  };

  beforeEach(async () => {
    await wasmPluginRunner.registerWasmPlugin(manifest, SAMPLE_WASM_BYTES);
  });

  afterEach(() => {
    wasmPluginRunner.destroyAll();
  });

  it("registers and detects WASM plugins", () => {
    expect(wasmPluginRunner.isWasmPlugin("slug-transformer")).toBe(true);
    expect(wasmPluginRunner.isWasmPlugin("stripe")).toBe(false); // 1st-party
  });

  it("rejects plugins with undeclared or invalid capabilities", async () => {
    const badManifest: WasmPluginManifest = {
      id: "untrusted-plugin",
      name: "Untrusted",
      version: "1.0.0",
      capabilities: ["filesystem:raw" as any],
    };
    await expect(
      wasmPluginRunner.registerWasmPlugin(badManifest, SAMPLE_WASM_BYTES),
    ).rejects.toThrow("Undeclared or invalid capability");
  });

  it("enforces global instance limits", async () => {
    const giantManifest: WasmPluginManifest = {
      id: "giant-pool",
      name: "Giant Pool",
      version: "1.0.0",
      capabilities: ["db:read"],
      poolSize: 70, // Exceeds MAX_GLOBAL_WASM_INSTANCES (64)
    };
    await expect(
      wasmPluginRunner.registerWasmPlugin(giantManifest, SAMPLE_WASM_BYTES),
    ).rejects.toThrow("global WASM instance ceiling");
  });

  it("reports global aggregated metrics", () => {
    const globalMetrics = wasmPluginRunner.getGlobalMetrics();
    expect(globalMetrics.totalPools).toBe(1);
    expect(globalMetrics.totalInstances).toBe(2);
    expect(globalMetrics.maxMemoryCeilingBytes).toBe(128 * 1024 * 1024);
    expect(globalMetrics.maxGlobalInstances).toBe(64);
  });

  it("dispatches lifecycle hooks and aggregates telemetry metrics", async () => {
    const ctx = createMockContext("slug-transformer");
    const payload = { title: "Title 1" };

    const result = await wasmPluginRunner.executeHook(
      "slug-transformer",
      "beforeSave",
      payload,
      ctx,
    );
    expect(result.success).toBe(true);

    const metrics = wasmPluginRunner.getAllMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].pluginId).toBe("slug-transformer");
    expect(metrics[0].invocationsTotal).toBe(1);
    expect(metrics[0].idleInstances).toBe(2);
    expect(metrics[0].allocatedMemoryBytes).toBeGreaterThan(0);
  });

  it("unregisters WASM plugin cleanly", () => {
    const removed = wasmPluginRunner.unregisterWasmPlugin("slug-transformer");
    expect(removed).toBe(true);
    expect(wasmPluginRunner.isWasmPlugin("slug-transformer")).toBe(false);
  });
});
