/**
 * @file tests/unit/api/user.test.ts
 * @description Unit tests for user management endpoints.
 */

import { describe, it, expect, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies

// Mock dependencies
// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    auth: {
      getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getUserCount: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      updateUserAttributes: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
      batchAction: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 1 } }),
    },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn(),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Import raw dispatcher handler
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

describe("User API Unit Tests", () => {
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
        json: async () => body,
        formData: vi.fn(),
        headers: new Map(),
      },
      locals: {
        user: { ...user, role: "admin", isAdmin: true },
        tenantId: tenantId ?? "t1",
        roles: [
          {
            _id: "admin",
            name: "Administrator",
            isAdmin: true,
            permissions: ["user:read", "user:update", "api:user"],
          },
        ],
        dbAdapter: {
          auth: {
            getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
            getUserCount: vi.fn().mockResolvedValue({ success: true, data: 0 }),
            updateUserAttributes: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
            batchAction: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 1 } }),
          },
          collections: {},
          media: {},
          widgets: {},
          system: {},
          crud: {},
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  it("should list users", async () => {
    const event = createMockEvent("GET", "user");
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data.data)).toBe(true);
  });

  it("should update user attributes", async () => {
    const event = createMockEvent("PATCH", "user/update-user-attributes", {
      user_id: "u1",
      newUserData: { name: "New" },
    });
    const response = await dispatcher(event);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
