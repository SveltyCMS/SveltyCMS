/**
 * @file tests/unit/api/settings-security.test.ts
 * @description Unit tests for settings security and isolation.
 */

import { describe, it, expect, vi } from "vitest";
// Removed unused RequestEvent import

// Mock dependencies

// Mock dependencies
// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    system: { preferences: { getMany: vi.fn(), set: vi.fn() } },
  },
  getDb: vi.fn().mockReturnValue({
    system: { preferences: { getMany: vi.fn(), set: vi.fn() } },
  }),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/services/settings-service", () => ({
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
import * as settingsService from "@src/services/settings-service";

describe("Settings API Security Unit Tests", () => {
  // Removed unused createMockEvent

  it("should allow authenticated users with tenantId", async () => {
    const event = {
      locals: { user: { _id: "u1", role: "admin" }, tenantId: "t1" },
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
