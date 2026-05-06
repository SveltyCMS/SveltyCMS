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

const { dbAdapter } = vi.hoisted(() => {
  const dbAdapter = {
    auth: {
      getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getUserCount: vi.fn().mockResolvedValue({ success: true, data: 0 }),
    },
    crud: {
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      insert: vi.fn().mockResolvedValue({ success: true, data: {} }),
      update: vi.fn().mockResolvedValue({ success: true, data: {} }),
    },
    system: {
      preferences: {
        getMany: vi.fn().mockResolvedValue({ success: true, data: {} }),
        set: vi.fn().mockResolvedValue({ success: true }),
        setMany: vi.fn().mockResolvedValue({ success: true }),
      },
    },
    collection: {
      getModel: vi.fn(),
    },
  };
  return { dbAdapter };
});

// Mock db adapter
vi.mock("@src/databases/db", () => ({
  dbAdapter: dbAdapter,
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue(dbAdapter),
}));

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
      expect(dbAdapter!.auth.getAllUsers).toHaveBeenCalledWith(
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
      expect(dbAdapter!.auth.getAllUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ tenantId: otherTenant }),
        }),
        expect.objectContaining({ tenantId: otherTenant }),
      );
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        params: { path: "export" },
        locals: { user: mockAdmin, tenantId: myTenant },
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
      expect(dbAdapter!.auth.getAllUsers).not.toHaveBeenCalledWith({
        filter: { tenantId: otherTenant },
      });
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
      // Check if db.system.preferences.set was called with myTenant
      const db = (await import("@src/databases/db")).getDb();
      expect(db!.system.preferences.set).toHaveBeenCalledWith(
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
