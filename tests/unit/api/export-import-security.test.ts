/**
 * @file tests/unit/api/export-import-security.test.ts
 * @description Unit tests for Export/Import API security, focusing on tenant isolation and IDOR.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as exportData } from "@src/routes/api/export/+server";
import { POST as importData } from "@src/routes/api/import/full/+server";
import { dbAdapter } from "@src/databases/db";

// Mock db adapter
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getAllUsers: vi.fn().mockResolvedValue([]),
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
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({
    system: {
      preferences: {
        set: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  }),
}));

// Mock settings service
vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true), // MULTI_TENANT = true
  getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
  invalidateSettingsCache: vi.fn(),
}));

// Mock logger
vi.mock("@utils/logger.server", () => ({
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
        locals: { user: mockAdmin, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ type: "users" }) },
        url: new URL("http://localhost/api/export"),
      } as any;

      await exportData(event);
      expect(dbAdapter!.auth.getAllUsers).toHaveBeenCalledWith({
        filter: { tenantId: myTenant },
      });
    });

    it("should allow super-admin to override tenantId", async () => {
      const event = {
        locals: { user: mockSuperAdmin, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ type: "users" }) },
        url: new URL(`http://localhost/api/export?tenantId=${otherTenant}`),
      } as any;

      await exportData(event);
      expect(dbAdapter!.auth.getAllUsers).toHaveBeenCalledWith({
        filter: { tenantId: otherTenant },
      });
    });

    it("should prevent regular admin from overriding tenantId", async () => {
      const event = {
        locals: { user: mockAdmin, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ type: "users" }) },
        url: new URL(`http://localhost/api/export?tenantId=${otherTenant}`),
      } as any;

      try {
        await exportData(event);
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
        locals: { user: mockAdmin, tenantId: myTenant },
        request: {
          json: vi.fn().mockResolvedValue({
            data: mockImportData,
            options: { strategy: "overwrite" },
          }),
        },
        url: new URL("http://localhost/api/import/full"),
      } as any;

      await importData(event);
      // Check if db.system.preferences.set was called with myTenant
      // In the implementation, it's called via getDb().system.preferences.set
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
        locals: { user: mockAdmin, tenantId: myTenant },
        request: { json: vi.fn().mockResolvedValue({ data: mockImportData }) },
        url: new URL(`http://localhost/api/import/full?tenantId=${otherTenant}`),
      } as any;

      try {
        await importData(event);
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });
  });
});
