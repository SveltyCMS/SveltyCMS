/**
 * @file tests/unit/api/user.test.ts
 * @description Unit tests for user management endpoints.
 *
 * Uses shared createMockRequestEvent + callApiDispatcher (tests/unit/utils/mock-event.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { createMockUser, createDbAdapterStub } from "../utils/mock-factories";
import { invokeApi } from "../utils/mock-event";

// Mock dependencies
vi.mock("@src/databases/db", () => {
  const dbAdapter = createDbAdapterStub();
  return {
    dbAdapter,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getDb: vi.fn().mockReturnValue(dbAdapter),
    isDbConnected: vi.fn().mockReturnValue(true),
    getAuth: vi.fn().mockReturnValue(dbAdapter.auth),
  };
});

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

const adminUser = createMockUser({ _id: "u1", role: "admin", isAdmin: true } as any);
const dbAdapter = createDbAdapterStub();
const adminRoles = [
  {
    _id: "admin",
    name: "Administrator",
    isAdmin: true,
    permissions: ["user:read", "user:update", "api:user"],
  },
];

describe("User API Unit Tests", () => {
  it("should list users", async () => {
    const response = await invokeApi("GET", {
      path: "user",
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
    });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should update user attributes", async () => {
    const response = await invokeApi("PATCH", {
      path: "user/update-user-attributes",
      body: {
        user_id: "u1",
        newUserData: { name: "New" },
      },
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
    });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
  });
});
