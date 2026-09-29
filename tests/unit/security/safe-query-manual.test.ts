/**
 * @file tests/unit/security/safe-query-manual.test.ts
 * @description Security hardening for safeQuery multi-tenant isolation.
 */
import { withSystemScope } from "@src/databases/system-tenant-scope";

import { describe, it, expect, beforeEach, vi } from "vitest";

// Properly mock @src/databases/config-state
vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as any).__privateEnv,
  setPrivateEnv: (env: any) => {
    (globalThis as any).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

import {
  assertTenantContext,
  isMultiTenantMode,
  resetSafeQueryCache,
  safeQuery,
} from "../../../src/utils/security/safe-query";

describe("safeQuery Hardening", () => {
  beforeEach(() => {
    // Reset global privateEnv before each test
    (globalThis as any).__privateEnv = null;
    resetSafeQueryCache();
  });

  it("returns the caller's object unchanged (same reference, no clone) on the bypass path", () => {
    // Reference identity is the allocation proof: a defensive copy would fail this.
    const query = { name: "test", count: 2 };
    expect(safeQuery(query, "tenant-1", { bypassSafeQuery: true })).toBe(query);
  });

  it("should allow scoped tenantId in multi-tenant mode", () => {
    // Set multi-tenant mode in the mocked config
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const query = { name: "test" };
    const result = safeQuery(query, "tenant-1");
    expect((result as any).tenantId).toBe("tenant-1");
    expect(result.name).toBe("test");
  });

  it("should treat an explicit null tenantId as the global scope in multi-tenant mode", () => {
    // Set multi-tenant mode in the mocked config
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const query = { name: "test" };
    // `tenantId: null` is the *documented* explicit global scope — rows with
    // `tenantId IS NULL` (multi-tenancy.mdx → "Explicit Global Scope"), not a
    // missing context. Rejecting it broke every global-tenant read once
    // MULTI_TENANT was active (the global admin, public pages, wizard content).
    const result = safeQuery(query, null);
    expect((result as any).tenantId).toBeNull();
    expect(result.name).toBe("test");
  });

  it("should not overwrite a narrower explicit query filter with the global scope", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const result = safeQuery({ name: "test", tenantId: "tenant-1" }, null);
    expect((result as any).tenantId).toBe("tenant-1");
  });

  it("should throw error on undefined tenantId in multi-tenant mode", () => {
    // Set multi-tenant mode in the mocked config
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const query = { name: "test" };
    expect(() => safeQuery(query, undefined)).toThrow("Security Violation");
  });

  it("should allow undefined tenantId in single-tenant mode", () => {
    // Set single-tenant mode in the mocked config
    (globalThis as any).__privateEnv = { MULTI_TENANT: false };
    const query = { name: "test" };
    const result = safeQuery(query, undefined);
    expect((result as any).tenantId).toBeUndefined();
    expect(result.name).toBe("test");
  });

  it("should allow null tenantId in single-tenant mode", () => {
    // Set single-tenant mode in the mocked config
    (globalThis as any).__privateEnv = { MULTI_TENANT: false };
    const query = { name: "test" };
    const result = safeQuery(query, null);
    expect(result.name).toBe("test");
  });

  it("should bypass tenant check with branded systemScope in multi-tenant mode", async () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const { withSystemScope } = await import("@src/databases/system-tenant-scope");
    const query = { name: "test" };
    const result = safeQuery(query, undefined, withSystemScope("testing") as any);
    expect(result.name).toBe("test");
  });

  it("should honor branded systemScope in multi-tenant mode", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const result = safeQuery({ name: "test" }, undefined, withSystemScope("bootstrap"));
    expect(result.name).toBe("test");
  });

  it("should exclude soft-deleted and legacy rows by default", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: false };
    const result = safeQuery({ name: "test" }, undefined);
    expect((result as any).isDeleted).toEqual({ $ne: true });
  });

  it("should omit soft-delete filter when includeDeleted is true", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: false };
    const result = safeQuery({ name: "test" }, undefined, {
      includeDeleted: true,
    });
    expect((result as any).isDeleted).toBeUndefined();
  });

  it("assertTenantContext fails closed under MULTI_TENANT without tenantId", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    resetSafeQueryCache();
    expect(isMultiTenantMode()).toBe(true);
    expect(() => assertTenantContext({})).toThrow("Security Violation");
    expect(() => assertTenantContext({ tenantId: "t1" })).not.toThrow();
    // Explicit global scope (IS NULL rows) is a scope decision, not a missing one.
    expect(() => assertTenantContext({ tenantId: null })).not.toThrow();
    expect(() => assertTenantContext(withSystemScope("bootstrap"))).not.toThrow();
    // Forged systemScope must not pass
    expect(() =>
      assertTenantContext({ systemScope: { kind: "system", reason: "scheduler" } } as any),
    ).toThrow("Security Violation");
  });

  it("assertTenantContext is a no-op in single-tenant mode", () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: false };
    resetSafeQueryCache();
    expect(isMultiTenantMode()).toBe(false);
    expect(() => assertTenantContext(undefined)).not.toThrow();
  });
});
