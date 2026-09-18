/**
 * @file tests/unit/multi-tenancy/00-tenant-utils.test.ts
 * @description Tests for isValidTenantId() and isMultiTenantEnabled().
 *
 * Runs first (00- prefix) to avoid mock pollution from files that mock @utils/tenant.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidTenantId } from "@utils/tenant.server";

// Unmock modules that may have been mocked by other test files (Vitest caches
// module mocks across files in the same worker, causing cross-file leakage).
// These hoisted calls ensure real module implementations are used.
vi.unmock("@utils/tenant");
vi.unmock("@utils/tenant-isolation.server");
vi.unmock("@utils/logger");

// isMultiTenantEnabled() resolves MULTI_TENANT through the settings service — its
// only boundary. Override just that getter and keep the real module for every
// other consumer.
const privateSettings = vi.hoisted(() => ({
  multiTenant: undefined as unknown,
  throwOnRead: false,
}));

vi.mock("@src/services/core/settings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/services/core/settings-service")>();
  return {
    ...actual,
    getPrivateSettingSync: (key: string, tenantId?: string): unknown => {
      if (key === "MULTI_TENANT") {
        if (privateSettings.throwOnRead) throw new Error("Settings unavailable");
        return privateSettings.multiTenant;
      }
      return actual.getPrivateSettingSync(key as never, tenantId);
    },
  };
});

describe("isValidTenantId", () => {
  it("accepts safe tenant ids and rejects path traversal", () => {
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
    privateSettings.multiTenant = undefined;
    privateSettings.throwOnRead = false;
  });

  it("returns true when MULTI_TENANT is true", async () => {
    privateSettings.multiTenant = true;

    const mod = await import("@utils/tenant-isolation.server");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(true);
  });

  it("returns false when MULTI_TENANT is false", async () => {
    privateSettings.multiTenant = false;

    const mod = await import("@utils/tenant-isolation.server");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });

  it("returns false when MULTI_TENANT is unset", async () => {
    const mod = await import("@utils/tenant-isolation.server");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });

  it("returns false gracefully when the settings lookup throws", async () => {
    privateSettings.throwOnRead = true;

    const mod = await import("@utils/tenant-isolation.server");
    mod.resetMultiTenantCache();
    expect(mod.isMultiTenantEnabled()).toBe(false);
  });
});

describe("detectFullStructure", () => {
  beforeEach(() => {
    privateSettings.multiTenant = true;
    privateSettings.throwOnRead = false;
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
