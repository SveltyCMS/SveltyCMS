/**
 * @file tests/unit/api/export-import-security.test.ts
 * @description Unit tests for Export/Import API security, focusing on tenant isolation and IDOR.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

let dispatcherPOST: any;
beforeAll(async () => {
  const mod = await import("../../../src/routes/api/[...path]/+server");
  dispatcherPOST = mod.POST;
});

// Mock db adapter functions
const getAllUsers = vi.fn().mockResolvedValue({ success: true, data: [] });
const getUserCount = vi.fn().mockResolvedValue({ success: true, data: 0 });
const findOne = vi.fn().mockResolvedValue({ success: true, data: null });
const insert = vi.fn().mockResolvedValue({ success: true, data: {} });
const update = vi.fn().mockResolvedValue({ success: true, data: {} });
const prefGetMany = vi.fn().mockResolvedValue({ success: true, data: {} });
const prefSet = vi.fn().mockResolvedValue({ success: true });
const prefSetMany = vi.fn().mockResolvedValue({ success: true });
const getModel = vi.fn();

// Mock db adapter
vi.mock("@src/databases/db", () => {
  const db = {
    auth: { getAllUsers, getUserCount },
    crud: { findOne, insert, update },
    system: {
      preferences: { getMany: prefGetMany, set: prefSet, setMany: prefSetMany },
    },
    collection: { getModel },
  };
  return {
    dbAdapter: db,
    auth: db.auth,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue(db),
    getAuth: vi.fn().mockReturnValue(db.auth),
    isDbConnected: vi.fn().mockReturnValue(true),
  };
});

// Mock settings service
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true), // MULTI_TENANT = true
  getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
  invalidateSettingsCache: vi.fn(),
  getPublicSettingSync: vi.fn().mockReturnValue("mediaFolder"),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Export/Import API Security - Tenant Isolation", () => {
  const mockAdmin = {
    _id: "admin1",
    role: "admin",
    email: "admin@tenant1.com",
  };
  const mockSuperAdmin = {
    _id: "super1",
    role: "super-admin",
    email: "super@cms.com",
  };
  const myTenant = "tenant-1";
  const otherTenant = "tenant-2";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Export API (POST /api/export)", () => {
    it("should only export data for the current tenant for regular admin", async () => {
      const event = {
        params: { path: "export" },
        locals: { user: mockAdmin, tenantId: myTenant },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ type: "users" }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/export"),
        cookies: { get: vi.fn() },
      } as any;

      await dispatcherPOST(event);
      expect(getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ tenantId: myTenant }),
        }),
        expect.objectContaining({ tenantId: myTenant }),
      );
    });

    it("should allow super-admin to override tenantId", async () => {
      const event = {
        params: { path: "export" },
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ type: "users" }),
          headers: new Headers(),
        },
        url: new URL(`http://localhost/api/export?tenantId=${otherTenant}`),
        cookies: { get: vi.fn() },
      } as any;

      await dispatcherPOST(event);
      expect(getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ tenantId: otherTenant }),
        }),
        expect.objectContaining({ tenantId: otherTenant }),
      );
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockAdmin, tenantId: myTenant },
        params: { path: "export" },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ type: "users" }),
          headers: new Headers(),
        },
        url: new URL(`http://localhost/api/export?tenantId=${otherTenant}`),
        cookies: { get: vi.fn() },
      } as any;

      try {
        await dispatcherPOST(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
      expect(getAllUsers).not.toHaveBeenCalled();
    });
  });

  describe("Import API (POST /api/import/full)", () => {
    const mockImportData = {
      metadata: { export_id: "exp1", exported_at: new Date().toISOString() },
      settings: { SITE_NAME: "Imported Site" },
      collections: [],
    };

    it("should only import data to the current tenant for regular admin", async () => {
      const event = {
        params: { path: "import/full" },
        locals: { user: mockAdmin, tenantId: myTenant },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({
            data: mockImportData,
            options: { strategy: "overwrite" },
          }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/import/full"),
        cookies: { get: vi.fn() },
      } as any;

      await dispatcherPOST(event);
      expect(prefSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "system",
        myTenant,
      );
    });

    it("should prevent regular admin from importing to another tenant", async () => {
      const event = {
        params: { path: "import/full" },
        locals: { user: mockAdmin, tenantId: myTenant },
        request: {
          method: "POST",
          json: vi.fn().mockResolvedValue({ data: mockImportData }),
          headers: new Headers(),
        },
        url: new URL(`http://localhost/api/import/full?tenantId=${otherTenant}`),
        cookies: { get: vi.fn() },
      } as any;

      try {
        await dispatcherPOST(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });
  });
});
