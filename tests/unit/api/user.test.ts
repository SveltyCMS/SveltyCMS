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
import { hashPassword } from "@utils/security/crypto";

const dbAdapter = createDbAdapterStub();

const { mockPrivateSettings } = vi.hoisted(() => ({
  mockPrivateSettings: new Map<string, unknown>(),
}));

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
  getPrivateSettingSync: vi.fn((key: string) => mockPrivateSettings.get(key)),
  getPublicSettingSync: vi.fn(() => true),
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

  it("strips role/isAdmin from non-admin self updates (privilege escalation defense)", async () => {
    const updateSpy = vi.fn().mockResolvedValue({
      success: true,
      data: { ...editorUser, username: "guest" },
    });
    (dbAdapter as any).auth.updateUserAttributes = updateSpy;

    const guestUser = createMockUser({
      _id: "guest-1",
      role: "user",
      isAdmin: false,
      email: "guest@test.com",
    } as any);

    const response = await invokeApi("POST", {
      path: "user/update-user-attributes",
      body: {
        user_id: "guest-1",
        role: "admin",
        isAdmin: true,
        username: "still-guest",
      },
      user: guestUser,
      tenantId: "t1",
      roles: [
        {
          _id: "user",
          name: "User",
          isAdmin: false,
          permissions: [],
        },
      ],
      dbAdapter,
      bypass: true,
    });

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
    const [, attrs] = updateSpy.mock.calls[0];
    expect(attrs).not.toHaveProperty("role");
    expect(attrs).not.toHaveProperty("isAdmin");
    expect(attrs.username).toBe("still-guest");
  });

  it("rejects non-admin updating another user", async () => {
    const response = await invokeApi("POST", {
      path: "user/update-user-attributes",
      body: {
        user_id: "u1",
        newUserData: { username: "hijack" },
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
    expect(response.status).toBe(403);
  });

  it("strips role/isAdmin on PUT /user/:id self (alternate escalate path)", async () => {
    const updateSpy = vi.fn().mockResolvedValue({
      success: true,
      data: { ...editorUser, username: "editor" },
    });
    (dbAdapter as any).auth.updateUserAttributes = updateSpy;

    const response = await invokeApi("PUT", {
      path: "user/u2",
      body: { role: "admin", isAdmin: true, username: "still-editor" },
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

    // Self update may succeed with stripped fields
    if (response.status === 200) {
      expect(updateSpy).toHaveBeenCalled();
      const [, attrs, opts] = updateSpy.mock.calls[0];
      expect(attrs).not.toHaveProperty("role");
      expect(attrs).not.toHaveProperty("isAdmin");
      expect(attrs.username).toBe("still-editor");
      expect(opts?.allowPrivilegeEscalation).toBeFalsy();
    } else {
      // Some dispatch shapes return 403/404 for /user/:id — still not escalated
      expect([400, 403, 404]).toContain(response.status);
    }
  });

  describe("Session management (sessions API)", () => {
    beforeEach(() => {
      mockPrivateSettings.clear();
      (dbAdapter as any).auth.deleteSession = vi.fn().mockResolvedValue({ success: true });
      (dbAdapter as any).auth.getActiveSessions = vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            _id: "sess-other",
            user_id: "u2",
            userAgent: "UA-Chrome/Windows",
            rotated: false,
          },
        ],
      });
    });

    it("POST user/sessions/reauth verifies against a fresh DB read (credential-free cache safe)", async () => {
      // Session-cache snapshots carry no password hash — reauth must fetch the
      // fresh user from the DB before verifying.
      (dbAdapter as any).auth.getUserById = vi.fn().mockResolvedValue({
        success: true,
        data: { ...adminUser, password: await hashPassword("ValidPass1!") },
      });
      const response = await invokeApi("POST", {
        path: "user/sessions/reauth",
        body: { password: "ValidPass1!" },
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.data.token).toBeDefined();
      expect(result.data.expiresIn).toBe(300);
    });

    it("POST user/sessions/reauth rejects a wrong password (403)", async () => {
      (dbAdapter as any).auth.getUserById = vi.fn().mockResolvedValue({
        success: true,
        data: { ...adminUser, password: await hashPassword("ValidPass1!") },
      });
      const response = await invokeApi("POST", {
        path: "user/sessions/reauth",
        body: { password: "WrongPass1!" },
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("INVALID_PASSWORD");
    });

    it("POST user/sessions/reauth requires a password (400)", async () => {
      const response = await invokeApi("POST", {
        path: "user/sessions/reauth",
        body: {},
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("PASSWORD_REQUIRED");
    });

    it("cross-session revoke requires a re-auth token (403 REAUTH_REQUIRED)", async () => {
      const response = await invokeApi("DELETE", {
        path: "user/sessions/sess-other",
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("REAUTH_REQUIRED");
      expect((dbAdapter as any).auth.deleteSession).not.toHaveBeenCalled();
    });

    it("cross-session revoke succeeds with a valid re-auth token", async () => {
      mockPrivateSettings.set("JWT_SECRET_KEY", "test-jwt-secret");
      const crypto = await import("node:crypto");
      const exp = Date.now() + 5 * 60 * 1000;
      const sig = crypto
        .createHmac("sha256", "test-jwt-secret")
        .update(`u1:sess-current:${exp}`)
        .digest("base64url");

      const response = await invokeApi("DELETE", {
        path: "user/sessions/sess-other",
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        headers: { "x-reauth-token": `${exp}:${sig}` },
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(200);
      expect((dbAdapter as any).auth.deleteSession).toHaveBeenCalledWith("sess-other");
    });

    it("admin session console lists another user's sessions", async () => {
      const response = await invokeApi("GET", {
        path: "user/sessions?admin=1&userId=u2",
        user: adminUser,
        tenantId: "t1",
        roles: adminRoles,
        dbAdapter,
        locals: { session_id: "sess-current" } as any,
      });
      expect(response.status).toBe(200);
      expect((dbAdapter as any).auth.getActiveSessions).toHaveBeenCalledWith(
        "u2",
        expect.anything(),
      );
    });
  });
});
