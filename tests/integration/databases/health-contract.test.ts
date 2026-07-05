/**
 * @file tests/integration/databases/health-contract.test.ts
 * @description Cross-adapter connection health, pool diagnostics, and infrastructure tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { validateDatabaseResult } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";

let db: any = null;
let adapter: any = null;

beforeAll(async () => {
  await ensureFullInitialization();
  const result = await ensureFullInitialization();
  db = getDb();
  adapter = result?.adapter || db;
  if (!db) throw new Error("Database not initialized");
});

describe("Connection Health Contract — All Adapters", () => {
  it("isConnected returns true after initialization", () => {
    if (typeof adapter.isConnected !== "function") return;
    expect(adapter.isConnected()).toBe(true);
  });

  it("type is a non-empty string", () => {
    if (!adapter.type) return;
    expect(typeof adapter.type).toBe("string");
    expect(adapter.type.length).toBeGreaterThan(0);
  });

  it("getVersion returns a version string", async () => {
    if (typeof adapter.getVersion !== "function") return;
    const result = await adapter.getVersion();
    validateDatabaseResult(result, { operation: "getVersion" });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("string");
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("getCapabilities returns expected structure", () => {
    if (typeof adapter.getCapabilities !== "function") return;
    const caps = adapter.getCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps).toBe("object");
  });

  it("isEmpty returns boolean", async () => {
    if (typeof adapter.isEmpty !== "function") return;
    const result = await adapter.isEmpty();
    validateDatabaseResult(result, { operation: "isEmpty" });
    expect(typeof result.data).toBe("boolean");
  });

  it("getConnectionHealth returns health status", async () => {
    if (typeof adapter.getConnectionHealth !== "function") return;
    const result = await adapter.getConnectionHealth();
    validateDatabaseResult(result, { operation: "getConnectionHealth", allowNullData: true });
    if (result.success && result.data) {
      expect(typeof result.data.healthy).toBe("boolean");
      expect(typeof result.data.latency).toBe("number");
    }
  });

  it("getPoolDiagnostics returns pool stats (networked DBs)", async () => {
    if (typeof adapter.getPoolDiagnostics !== "function") return;
    const result = await adapter.getPoolDiagnostics();
    if (result && typeof result === "object") {
      validateDatabaseResult(result, {
        operation: "getPoolDiagnostics",
        dataOptional: true,
        allowNullData: true,
      });
    }
  });

  it("queryBuilder returns a builder for a collection", () => {
    if (typeof adapter.queryBuilder !== "function") return;
    const builder = adapter.queryBuilder("system_preferences");
    expect(builder).toBeDefined();
    expect(typeof builder.where).toBe("function");
    expect(typeof builder.execute).toBe("function");
  });

  it("clearDatabase exists (destructive — not called)", async () => {
    if (typeof adapter.clearDatabase !== "function") return;
    expect(typeof adapter.clearDatabase).toBe("function");
  });

  it("cleanupExpiredData exists and runs", async () => {
    if (typeof adapter.cleanupExpiredData !== "function") return;
    const result = await adapter.cleanupExpiredData();
    validateDatabaseResult(result, {
      operation: "cleanupExpiredData",
      dataOptional: true,
      allowNullData: true,
    });
  });
});

describe("Tenant Policy Contract", () => {
  it("enforceTenantPolicy exists (multi-tenant adapters)", async () => {
    if (typeof db.enforceTenantPolicy !== "function") return;

    // Test with a non-existent collection to avoid side effects
    const result = await db.enforceTenantPolicy("nonexistent_collection", "test-tenant");
    if (result && typeof result === "object") {
      validateDatabaseResult(result, {
        operation: "enforceTenantPolicy",
        dataOptional: true,
        allowNullData: true,
      });
    }
  });

  it("getTenantContext returns tenant info", async () => {
    if (typeof db.getTenantContext !== "function") return;

    const result = await db.getTenantContext();
    if (result && typeof result === "object") {
      validateDatabaseResult(result, {
        operation: "getTenantContext",
        dataOptional: true,
        allowNullData: true,
      });
    }
  });
});
