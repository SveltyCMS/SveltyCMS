/**
 * @file tests/integration/databases/health-contract.test.ts
 * @description Cross-adapter connection health, pool diagnostics, and infrastructure tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { validateDatabaseResult } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";

let db: any = null;
let adapter: any = null;

/** Tenant-policy methods only exist in multi-tenant installs. */
const MULTI_TENANT = process.env.MULTI_TENANT === "true";

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  adapter = result?.adapter || db;
  if (!db) throw new Error("Database not initialized");
  // Core identity surface — hard-required (no soft-pass)
  expect(typeof adapter.isConnected).toBe("function");
  expect(typeof adapter.type).toBe("string");
  expect(adapter.type.length).toBeGreaterThan(0);
});

describe("Connection Health Contract — All Adapters", () => {
  it("isConnected returns true after initialization", () => {
    expect(typeof adapter.isConnected).toBe("function");
    expect(adapter.isConnected()).toBe(true);
  });

  it("type is a non-empty string", () => {
    expect(typeof adapter.type).toBe("string");
    expect(adapter.type.length).toBeGreaterThan(0);
  });

  it("getVersion returns a version string", async () => {
    expect(typeof adapter.getVersion).toBe("function");
    const result = await adapter.getVersion();
    validateDatabaseResult(result, { operation: "getVersion" });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe("string");
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("getCapabilities returns expected structure", () => {
    expect(typeof adapter.getCapabilities).toBe("function");
    const caps = adapter.getCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps).toBe("object");
  });

  it("isEmpty returns boolean", async () => {
    expect(typeof adapter.isEmpty).toBe("function");
    const result = await adapter.isEmpty();
    validateDatabaseResult(result, { operation: "isEmpty" });
    expect(typeof result.data).toBe("boolean");
  });

  it("getConnectionHealth returns health status", async () => {
    expect(typeof adapter.getConnectionHealth).toBe("function");
    const result = await adapter.getConnectionHealth();
    validateDatabaseResult(result, { operation: "getConnectionHealth", allowNullData: true });
    if (result.success && result.data) {
      expect(typeof result.data.healthy).toBe("boolean");
      expect(typeof result.data.latency).toBe("number");
    }
  });

  it("getPoolDiagnostics returns pool stats (networked DBs) or structured skip", async () => {
    // Optional on SQLite (single connection) — if present, must return valid shape
    if (typeof adapter.getPoolDiagnostics !== "function") {
      expect(adapter.type).toBe("sqlite");
      return;
    }
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
    expect(typeof adapter.queryBuilder).toBe("function");
    const builder = adapter.queryBuilder("system_preferences");
    expect(builder).toBeDefined();
    expect(typeof builder.where).toBe("function");
    expect(typeof builder.execute).toBe("function");
  });

  it("clearDatabase exists (destructive — not called)", () => {
    // Previously guarded with a silent `return`, which made the assertion dead.
    expect(typeof adapter.clearDatabase).toBe("function");
  });

  it("cleanupExpiredData exists and runs", async () => {
    expect(typeof adapter.cleanupExpiredData).toBe("function");
    const result = await adapter.cleanupExpiredData();
    validateDatabaseResult(result, {
      operation: "cleanupExpiredData",
      dataOptional: true,
      allowNullData: true,
    });
  });
});

describe("Tenant Policy Contract", () => {
  it.skipIf(!MULTI_TENANT)("enforceTenantPolicy exists (multi-tenant adapters)", async () => {
    expect(typeof db.enforceTenantPolicy).toBe("function");

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

  it.skipIf(!MULTI_TENANT)("getTenantContext returns tenant info", async () => {
    expect(typeof db.getTenantContext).toBe("function");

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
