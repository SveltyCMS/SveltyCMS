// @ts-nocheck
/**
 * @file tests/unit/multi-tenancy/crud-tenant-guard.test.ts
 * @description Fail-closed tenant guard for CRUD (no synthetic tenantId="global").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ICrudAdapter } from "@src/databases/db-interface";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as any).__privateEnv,
  setPrivateEnv: (env: any) => {
    (globalThis as any).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

describe("crud-tenant-guard", () => {
  let mockInner: any;
  let guard: ICrudAdapter;

  beforeEach(async () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };

    const { createTenantGuardedCrud, resetGuardCache } =
      await import("@src/databases/crud-tenant-guard");
    const { resetSafeQueryCache } = await import("@src/utils/security/safe-query");

    resetGuardCache();
    resetSafeQueryCache();

    mockInner = {
      find: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      findByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
      count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      exists: vi.fn().mockResolvedValue({ success: true, data: false }),
      aggregate: vi.fn().mockResolvedValue({ success: true, data: [] }),
      streamMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
      insertMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      update: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
      updateMany: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 1 } }),
      upsert: vi.fn().mockResolvedValue({ success: true, data: { _id: "1" } }),
      upsertMany: vi.fn().mockResolvedValue({ success: true, data: { upsertedCount: 1 } }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      deleteMany: vi.fn().mockResolvedValue({ success: true, data: { deletedCount: 1 } }),
      restore: vi.fn().mockResolvedValue({ success: true }),
      atomicIncrement: vi.fn().mockResolvedValue({ success: true, data: { _id: "1", count: 2 } }),
    };

    // Default boot mode is reject (fail-closed)
    guard = createTenantGuardedCrud(mockInner, "reject");
  });

  describe("fail-closed under MULTI_TENANT", () => {
    it("throws on find when tenantId is missing", async () => {
      await expect(guard.find("posts", {})).rejects.toThrow(/Security Violation|tenant/i);
      expect(mockInner.find).not.toHaveBeenCalled();
    });

    it("throws on insert when tenantId is missing", async () => {
      await expect(guard.insert("posts", { title: "Hello" })).rejects.toThrow(
        /Security Violation|tenant/i,
      );
      expect(mockInner.insert).not.toHaveBeenCalled();
    });

    it("allows find with explicit tenantId", async () => {
      await guard.find("posts", {}, { tenantId: "tenant-a" as any });
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, { tenantId: "tenant-a" });
    });

    it("copies options.tenantId into insert data when data omits it", async () => {
      await guard.insert("posts", { title: "Hello" }, { tenantId: "tenant-a" as any });
      expect(mockInner.insert).toHaveBeenCalledWith(
        "posts",
        { title: "Hello", tenantId: "tenant-a" },
        { tenantId: "tenant-a" },
      );
    });

    it("preserves existing tenantId in write data", async () => {
      await guard.insert(
        "posts",
        { title: "Hello", tenantId: "tenant-a" },
        { tenantId: "tenant-a" as any },
      );
      expect(mockInner.insert).toHaveBeenCalledWith(
        "posts",
        { title: "Hello", tenantId: "tenant-a" },
        { tenantId: "tenant-a" },
      );
    });

    it("allows branded systemScope for system ops", async () => {
      const { withSystemScope } = await import("@src/databases/system-tenant-scope");
      const opts = withSystemScope("scheduler");
      await guard.find("posts", {}, opts as any);
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, opts);
    });
  });

  describe("bypass mode", () => {
    it("passes through unchanged", async () => {
      const { createTenantGuardedCrud } = await import("@src/databases/crud-tenant-guard");
      const bypassGuard = createTenantGuardedCrud(mockInner, "bypass");
      await bypassGuard.find("posts", {});
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, undefined);
    });
  });

  describe("multi-tenant disabled", () => {
    it("passes through without requiring tenantId", async () => {
      (globalThis as any).__privateEnv = { MULTI_TENANT: false };
      const { createTenantGuardedCrud, resetGuardCache } =
        await import("@src/databases/crud-tenant-guard");
      const { resetSafeQueryCache } = await import("@src/utils/security/safe-query");
      resetGuardCache();
      resetSafeQueryCache();

      const noMtGuard = createTenantGuardedCrud(mockInner, "reject");
      // When MT is off, guard returns inner adapter directly — no wrapper layer.
      // Calls pass through with caller's exact arguments.
      await noMtGuard.find("posts", {});
      expect(mockInner.find).toHaveBeenCalledWith("posts", {});

      await noMtGuard.insert("posts", { title: "Hello" });
      expect(mockInner.insert).toHaveBeenCalledWith("posts", { title: "Hello" });
    });
  });
});
