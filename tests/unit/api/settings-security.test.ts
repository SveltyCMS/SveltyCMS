/**
 * @file tests/unit/api/settings-security.test.ts
 * @description Unit tests for settings security and isolation.
 */

import { describe, it, expect, vi } from "vitest";
import { createMockSuperAdmin, createDbAdapterStub } from "../utils/mock-factories";

// Mock dependencies

// Mock dependencies
// Mock dependencies
vi.mock("@src/databases/db", () => {
  const dbAdapter = createDbAdapterStub();

  // Custom overrides for settings tests
  (dbAdapter.system.preferences.get as any) = vi
    .fn()
    .mockResolvedValue({ success: true, data: {} });

  return {
    dbAdapter,
    getDb: vi.fn().mockReturnValue(dbAdapter),
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    isDbConnected: vi.fn().mockReturnValue(true),
    getAuth: vi.fn().mockReturnValue(dbAdapter.auth),
  };
});

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
  getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
  updateSettingsFromSnapshot: vi.fn().mockResolvedValue({ success: true }),
  settingsService: {
    getPrivateSettingSync: vi.fn().mockReturnValue(false),
    getPublicSettingSync: vi.fn().mockReturnValue(true),
    getUntypedSetting: vi.fn().mockResolvedValue(undefined),
    getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
    updateSettingsFromSnapshot: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

import { GET as dispatcherGET } from "@src/routes/api/[...path]/+server";
import * as settingsService from "@src/services/core/settings-service";

describe("Settings API Security Unit Tests", () => {
  // Removed unused createMockEvent

  it("should allow authenticated users with tenantId", async () => {
    const event = {
      locals: { user: createMockSuperAdmin({ _id: "u1" }), tenantId: "t1" },
      params: { path: "settings" },
      request: { method: "GET", headers: new Headers() },
      url: new URL("http://localhost/api/settings"),
      cookies: { get: vi.fn() },
    } as any;

    const response = await dispatcherGET(event);
    expect(response.status).toBe(200);
    expect(settingsService.getAllSettings).toHaveBeenCalled();
  });
});
