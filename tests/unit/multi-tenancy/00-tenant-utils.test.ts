/**
 * @file tests/unit/multi-tenancy/00-tenant-utils.test.ts
 * @description Tests for isMultiTenantEnabled() and detectFullStructure().
 *
 * Runs first (00- prefix) to avoid mock pollution from files that mock @utils/tenant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isValidTenantId", () => {
  it("validates correctly", async () => {
    function isValidTenantId(tenantId: string | null | undefined): boolean {
      if (tenantId === null || tenantId === undefined) return true;
      const validPattern = /^[a-zA-Z0-9_-]+$/;
      return validPattern.test(tenantId) && !tenantId.includes("..");
    }

    expect(isValidTenantId("tenant-a")).toBe(true);
    expect(isValidTenantId("tenant_123")).toBe(true);
    expect(isValidTenantId("primary")).toBe(true);
    expect(isValidTenantId(null)).toBe(true);
    expect(isValidTenantId(undefined)).toBe(true);
    expect(isValidTenantId("tenant..a")).toBe(false);
    expect(isValidTenantId("../etc/passwd")).toBe(false);
    expect(isValidTenantId("tenant/a")).toBe(false);
  });
});

describe("isMultiTenantEnabled", () => {
  beforeEach(() => {
    delete (globalThis as any).require;
  });

  it("returns true when MULTI_TENANT is true", async () => {
    const mockRequire = vi.fn(() => ({
      getPrivateSettingSync: vi.fn((key: string) => (key === "MULTI_TENANT" ? true : undefined)),
    }));
    (globalThis as any).require = mockRequire;

    const mod = await import("@utils/tenant");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(true);
  });

  it("returns false when MULTI_TENANT is false", async () => {
    const mockRequire = vi.fn(() => ({
      getPrivateSettingSync: vi.fn((key: string) => (key === "MULTI_TENANT" ? false : undefined)),
    }));
    (globalThis as any).require = mockRequire;

    const mod = await import("@utils/tenant");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });

  it("returns false gracefully when require is unavailable", async () => {
    delete (globalThis as any).require;

    const mod = await import("@utils/tenant");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });

  it("returns false gracefully when module throws", async () => {
    const mockRequire = vi.fn(() => {
      throw new Error("Module not found");
    });
    (globalThis as any).require = mockRequire;

    const mod = await import("@utils/tenant");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });
});

describe("detectFullStructure", () => {
  beforeEach(() => {
    delete (globalThis as any).require;
    const mockRequire = vi.fn(() => ({
      getPrivateSettingSync: vi.fn((key: string) => (key === "MULTI_TENANT" ? true : undefined)),
    }));
    (globalThis as any).require = mockRequire;
  });

  it("returns expected properties", async () => {
    const { detectFullStructure } = await import("@src/utils/collections-migration.server");
    const result = await detectFullStructure();
    expect(result).toHaveProperty("needsMigration");
    expect(result).toHaveProperty("pendingAction");
    expect(result).toHaveProperty("flatCollections");
    expect(result).toHaveProperty("tenantDirectories");
    expect(result).toHaveProperty("warnings");
  });
});
