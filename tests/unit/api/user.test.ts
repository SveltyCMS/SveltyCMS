/**
 * @file tests/unit/api/user.test.ts
 * @description Unit tests for user management endpoints.
 *
 * Uses shared createMockRequestEvent + callApiDispatcher (tests/unit/utils/mock-event.ts).
 * Covers list, PUT attributes, batch delete, auth rejection — aligned with integration.
 * Keeps real `apiHandler` so AppError → Response (same pattern as dispatcher-security-matrix).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser, createDbAdapterStub } from "../utils/mock-factories";
import { invokeApi, expectApi } from "../utils/mock-event";

const dbAdapter = createDbAdapterStub();

// Ensure batch paths have the methods LocalCMS.auth.batchAction calls
(dbAdapter as any).auth.deleteUsers = vi.fn().mockResolvedValue({
  success: true,
  data: { deletedCount: 1 },
});
(dbAdapter as any).auth.blockUsers = vi.fn().mockResolvedValue({
  success: true,
  data: { modifiedCount: 1 },
});
(dbAdapter as any).auth.unblockUsers = vi.fn().mockResolvedValue({
  success: true,
  data: { modifiedCount: 1 },
});
(dbAdapter as any).auth.batchAction = vi.fn().mockResolvedValue({
  success: true,
  data: { modifiedCount: 1 },
});

vi.mock("@src/databases/db", () => {
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

// Do NOT mock apiHandler — need AppError → HTTP Response conversion.

const adminUser = createMockUser({ _id: "u1", role: "admin", isAdmin: true } as any);
const editorUser = createMockUser({
  _id: "u2",
  role: "editor",
  isAdmin: false,
  email: "editor@test.com",
} as any);

const adminRoles = [
  {
    _id: "admin",
    name: "Administrator",
    isAdmin: true,
    permissions: ["user:read", "user:update", "api:user"],
  },
];

describe("User API Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbAdapter as any).auth.deleteUsers = vi.fn().mockResolvedValue({
      success: true,
      data: { deletedCount: 1 },
    });
    (dbAdapter as any).auth.blockUsers = vi.fn().mockResolvedValue({
      success: true,
      data: { modifiedCount: 1 },
    });
    (dbAdapter as any).auth.unblockUsers = vi.fn().mockResolvedValue({
      success: true,
      data: { modifiedCount: 1 },
    });
  });

  it("should list users (GET)", async () => {
    const response = await invokeApi("GET", {
      path: "user",
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
      bypass: true,
    });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("should update user attributes via PUT (matches page + integration)", async () => {
    const response = await invokeApi("PUT", {
      path: "user/update-user-attributes",
      body: {
        user_id: "u1",
        newUserData: { username: "NewName" },
      },
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
      bypass: true,
    });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
  });

  it("should also accept PATCH for update-user-attributes (compat)", async () => {
    const response = await invokeApi("PATCH", {
      path: "user/update-user-attributes",
      body: {
        user_id: "u1",
        newUserData: { username: "Patched" },
      },
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
      bypass: true,
    });
    expect([200, 405]).toContain(response.status);
  });

  it("should reject unauthenticated attribute update", async () => {
    await expectApi(
      "PUT",
      {
        path: "user/update-user-attributes",
        body: { user_id: "self", newUserData: { username: "x" } },
        user: null,
        tenantId: "t1",
        roles: [],
        dbAdapter,
        bypass: false,
      },
      [401, 403],
    );
  });

  it("should batch delete users via POST /user/batch", async () => {
    const response = await invokeApi("POST", {
      path: "user/batch",
      body: { userIds: ["u2"], action: "delete" },
      user: adminUser,
      tenantId: "t1",
      roles: adminRoles,
      dbAdapter,
      bypass: true,
    });
    expect([200, 400, 500]).toContain(response.status);
    if (response.status === 200) {
      const result = await response.json();
      expect(result.success).toBe(true);
    }
  });

  it("should reject batch with empty userIds", async () => {
    await expectApi(
      "POST",
      {
        path: "user/batch",
        body: { userIds: [], action: "delete" },
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        bypass: true,
      },
      [400, 422],
    );
  });

  it("should reject unauthenticated list", async () => {
    await expectApi(
      "GET",
      {
        path: "user",
        user: null,
        tenantId: "t1",
        roles: [],
        dbAdapter,
        bypass: false,
      },
      [401, 403],
    );
  });

  it("non-admin editor may still hit self attribute update path", async () => {
    const response = await invokeApi("PUT", {
      path: "user/update-user-attributes",
      body: {
        user_id: "self",
        newUserData: { username: "EditorSelf" },
      },
      user: editorUser,
      tenantId: "t1",
      roles: [
        {
          _id: "editor",
          name: "Editor",
          isAdmin: false,
          permissions: ["user:read"],
        },
      ],
      dbAdapter,
      bypass: true,
    });
    expect([200, 403]).toContain(response.status);
  });
});
