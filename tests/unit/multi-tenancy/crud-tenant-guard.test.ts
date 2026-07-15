// @ts-nocheck
/**
 * @file tests/unit/multi-tenancy/crud-tenant-guard.test.ts
 * @description Tests for crud-tenant-guard.ts — the transparent proxy that auto-injects
 * tenantId into all CRUD operations when MULTI_TENANT is enabled.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ICrudAdapter } from "@src/databases/db-interface";

// We mock isMultiTenantEnabled to control multi-tenant mode per test
vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn(() => true),
  isValidTenantId: vi.fn(() => true),
  getTenantIdFromHostname: vi.fn(() => "test-tenant"),
  resetMultiTenantCache: vi.fn(),
}));

// Mock settings-service used by isMultiTenantEnabled
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => true),
}));

describe("crud-tenant-guard", () => {
  let mockInner: any;
  let guard: ICrudAdapter;

  beforeEach(async () => {
    // Dynamically import to pick up fresh mocks
    const { createTenantGuardedCrud, resetGuardCache } =
      await import("@src/databases/crud-tenant-guard");

    // Reset internal caches between tests
    resetGuardCache();

    // Reset mock state — import the mock directly to set return value
    const tenantMock = await import("@utils/tenant");
    (tenantMock.isMultiTenantEnabled as any).mockReturnValue(true);
    (tenantMock as any).resetMultiTenantCache();

    // Create a mock inner adapter that records all calls
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

    guard = createTenantGuardedCrud(mockInner, "inject");
  });

  // ─── P0: Auto-inject on reads ────────────────────────────────────

  describe("read operations (P0)", () => {
    it("injects tenantId into find options when missing", async () => {
      await guard.find("posts", {});
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, { tenantId: "global" });
    });

    it("injects tenantId into findMany options when missing", async () => {
      await guard.findMany("posts", {});
      expect(mockInner.findMany).toHaveBeenCalledWith("posts", {}, { tenantId: "global" });
    });

    it("injects tenantId into findOne options when missing", async () => {
      await guard.findOne("posts" as any, { _id: "1" });
      expect(mockInner.findOne).toHaveBeenCalledWith("posts", { _id: "1" }, { tenantId: "global" });
    });

    it("preserves existing tenantId in options", async () => {
      await guard.find("posts", {}, { tenantId: "tenant-a" as any });
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, { tenantId: "tenant-a" });
    });

    it("skips injection when bypassTenantCheck is true", async () => {
      await guard.find("posts", {}, { bypassTenantCheck: true });
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, { bypassTenantCheck: true });
    });
  });

  // ─── P0: Auto-inject on writes ────────────────────────────────────

  describe("write operations (P0)", () => {
    it("injects tenantId into insert data AND options", async () => {
      await guard.insert("posts", { title: "Hello" });
      expect(mockInner.insert).toHaveBeenCalledWith(
        "posts",
        { title: "Hello", tenantId: "global" },
        { tenantId: "global" },
      );
    });

    it("injects tenantId into insertMany items AND options", async () => {
      await guard.insertMany("posts", [{ title: "A" }, { title: "B" }]);
      const data = mockInner.insertMany.mock.calls[0][1];
      expect(data[0].tenantId).toBe("global");
      expect(data[1].tenantId).toBe("global");
      expect(mockInner.insertMany.mock.calls[0][2]).toEqual({ tenantId: "global" });
    });

    it("injects tenantId into update data AND options", async () => {
      await guard.update("posts", "1", { title: "Updated" });
      expect(mockInner.update).toHaveBeenCalledWith(
        "posts",
        "1",
        { title: "Updated", tenantId: "global" },
        { tenantId: "global" },
      );
    });

    it("preserves existing tenantId in write data", async () => {
      await guard.insert("posts", { title: "Hello", tenantId: "tenant-a" });
      expect(mockInner.insert).toHaveBeenCalledWith(
        "posts",
        { title: "Hello", tenantId: "tenant-a" },
        { tenantId: "global" }, // options still injected
      );
    });

    it("injects tenantId into updateMany data AND options", async () => {
      await guard.updateMany("posts", { status: "draft" }, { status: "published" });
      expect(mockInner.updateMany).toHaveBeenCalledWith(
        "posts",
        { status: "draft" },
        { status: "published", tenantId: "global" },
        { tenantId: "global" },
      );
    });
  });

  // ─── P0: Reject mode ─────────────────────────────────────────────

  describe("reject mode (P0)", () => {
    it("throws on writes when tenantId is missing in reject mode", async () => {
      const { createTenantGuardedCrud, resetGuardCache } =
        await import("@src/databases/crud-tenant-guard");
      resetGuardCache();
      const strictGuard = createTenantGuardedCrud(mockInner, "reject");
      await expect(strictGuard.insert("posts", { title: "Hello" })).rejects.toThrow(/tenantId/);
    });

    it("allows writes with bypassTenantCheck in reject mode", async () => {
      const { createTenantGuardedCrud, resetGuardCache } =
        await import("@src/databases/crud-tenant-guard");
      resetGuardCache();
      const strictGuard = createTenantGuardedCrud(mockInner, "reject");
      await expect(
        strictGuard.insert("posts", { title: "Hello" }, { bypassTenantCheck: true }),
      ).resolves.toBeDefined();
    });
  });

  // ─── P1: bypass mode ──────────────────────────────────────────────

  describe("bypass mode (P1)", () => {
    it("passes through all operations unchanged in bypass mode", async () => {
      const { createTenantGuardedCrud } = await import("@src/databases/crud-tenant-guard");
      const bypassGuard = createTenantGuardedCrud(mockInner, "bypass");
      await bypassGuard.find("posts", {});
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, undefined);
    });
  });

  // ─── P1: Multi-tenant off ─────────────────────────────────────────

  describe("multi-tenant disabled (P1)", () => {
    it("passes through without injection when multi-tenant is off", async () => {
      const tenantMock = await import("@utils/tenant");
      (tenantMock.isMultiTenantEnabled as any).mockReturnValue(false);
      (tenantMock as any).resetMultiTenantCache();

      const { createTenantGuardedCrud, resetGuardCache } =
        await import("@src/databases/crud-tenant-guard");
      resetGuardCache();
      const noMtGuard = createTenantGuardedCrud(mockInner, "inject");

      await noMtGuard.find("posts", {});
      expect(mockInner.find).toHaveBeenCalledWith("posts", {}, undefined);

      await noMtGuard.insert("posts", { title: "Hello" });
      expect(mockInner.insert).toHaveBeenCalledWith("posts", { title: "Hello" }, undefined);
    });
  });
});
