/**
 * @file tests/unit/api/settings-security.test.ts
 * @description Unit tests for settings security and isolation.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock SvelteKit environment
vi.mock("$app/environment", () => ({
  browser: true,
}));

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    system: { preferences: { getMany: vi.fn(), set: vi.fn() } },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
  getAllSettings: vi.fn().mockResolvedValue({ public: {}, private: {} }),
  updateSettingsFromSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

describe("Settings API Security Unit Tests", () => {
  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = { _id: "u1", role: "admin" },
    tenantId?: string,
  ) => {
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        json: vi.fn().mockResolvedValue(body),
        headers: new Map(),
      },
      locals: {
        user: { ...user, role: "admin-role" },
        tenantId: tenantId ?? "t1",
        roles: [{ _id: "admin-role", name: "Administrator", isAdmin: true, permissions: [] }],
        dbAdapter: {
          system: { preferences: { getMany: vi.fn() } },
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should return all settings for admin", async () => {
    const event = createMockEvent(
      "GET",
      "settings/all",
      {},
      { _id: "admin1", role: "admin" },
      "t1",
    );
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
