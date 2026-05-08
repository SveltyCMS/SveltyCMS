/**
 * @file tests/unit/api/scim.test.ts
 * @description Unit tests for SCIM v2.0 API routes
 *
 * Tests:
 * - GET/POST /api/scim/v2/Users
 * - GET/PUT/PATCH/DELETE /api/scim/v2/Users/[id]
 * - GET/POST /api/scim/v2/Groups
 * - GET/PATCH/DELETE /api/scim/v2/Groups/[id]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock dependencies
vi.mock("@src/databases/db", () => {
  const auth = {
    getAllUsers: vi.fn(),
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    updateUserAttributes: vi.fn(),
    getAllRoles: vi.fn(),
    createUser: vi.fn(),
    checkUser: vi.fn(),
    authInterface: {
      createRole: vi.fn(),
      getRoleById: vi.fn(),
      deleteRole: vi.fn(),
      getAllUsers: vi.fn(),
    },
  };
  const dbAdapter = {
    auth: {
      getUserCount: vi.fn(),
      getAllUsers: vi.fn(),
      getRoleById: vi.fn(),
      getAllRoles: vi.fn(),
    },
    crud: {
      updateMany: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 1 } }),
      findMany: vi.fn(),
      findOne: vi.fn(),
    },
    collection: {
      getModel: vi.fn(),
    },
  };
  return {
    auth,
    dbAdapter,
    getDb: vi.fn().mockReturnValue(dbAdapter),
    dbInitPromise: Promise.resolve(),
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    isDbConnected: vi.fn().mockReturnValue(true),
  };
});

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

vi.mock("@utils/scim-utils", () => ({
  validateScimAuth: vi.fn().mockResolvedValue({ authenticated: true, tenantId: "tenant-1" }),
  scimError: vi.fn(
    (status: number, detail: string) =>
      new Response(JSON.stringify({ detail, status }), { status }),
  ),
  buildScimUser: vi.fn((user: any) => ({
    id: user?._id || "unknown",
    userName: user?.email || "unknown",
  })),
  buildScimGroup: vi.fn((role: any) => ({
    id: role?._id || "unknown",
    displayName: role?.name || "unknown",
  })),
  buildScimListResponse: vi.fn((resources: any[], totalResults?: number) => ({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: totalResults ?? resources.length,
    Resources: resources,
  })),
  applyScimPatchOps: vi.fn().mockReturnValue({}),
  parseScimFilter: vi.fn().mockReturnValue([]),
  matchesScimFilter: vi.fn().mockReturnValue(true),
}));

// Import dispatcher after mocking
import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PATCH as dispatcherPATCH,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";

describe("SCIM API Unit Tests", () => {
  let mockAuth: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const dbModule = await import("@src/databases/db");
    mockAuth = dbModule.auth;
    // Initialize the authInterface mock link
    mockAuth.authInterface = dbModule.dbAdapter!.auth;
  });

  describe("SCIM Users", () => {
    it("GET /Users should return tenant-scoped users", async () => {
      mockAuth.getAllUsers.mockResolvedValue([
        { _id: "u1", email: "u1@t1.com" },
        { _id: "u2", email: "u2@t1.com" },
      ]);

      const event = {
        params: { path: "scim/v2/Users" },
        url: new URL("http://localhost/api/scim/v2/Users"),
        request: { method: "GET", headers: new Headers([["authorization", "Bearer token"]]) },
        locals: { user: { isAdmin: true } }, // Bypass dispatcher auth check for SCIM specific units
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      const response = await dispatcherGET(event);
      const data = await response!.json();

      expect(data.totalResults).toBe(2);
      expect(mockAuth.getAllUsers).toHaveBeenCalledWith(
        { filter: { tenantId: "tenant-1" } },
        { tenantId: "tenant-1" },
      );
    });

    it("POST /Users should create user in tenant", async () => {
      mockAuth.checkUser.mockResolvedValue(null);
      mockAuth.createUser.mockResolvedValue({
        _id: "new-id",
        email: "new@t1.com",
      });
      // Mocking user creation is complex due to internal flows,
      // but we test that checkUser is called with tenantId.
      const event = {
        params: { path: "scim/v2/Users" },
        request: {
          method: "POST",
          headers: new Headers([["authorization", "Bearer token"]]),
          json: vi.fn().mockResolvedValue({
            userName: "new@t1.com",
            emails: [{ value: "new@t1.com", primary: true }],
          }),
        },
        url: new URL("http://localhost/api/scim/v2/Users"),
        locals: { user: { isAdmin: true } },
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      await dispatcherPOST(event);
      expect(mockAuth.checkUser).toHaveBeenCalledWith({
        email: "new@t1.com",
        tenantId: "tenant-1",
      });
      expect(mockAuth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new@t1.com", tenantId: "tenant-1" }),
      );
    });
  });

  describe("SCIM Groups", () => {
    it("GET /Users/[id] should return user details", async () => {
      mockAuth.getUserById.mockResolvedValue({ _id: "u1", email: "u1@t1.com" });
      const event = {
        params: { path: "scim/v2/Users/u1" }, // path matches userDetailHandlers.GET expectation
        request: { method: "GET", headers: new Headers([["authorization", "Bearer token"]]) },
        url: new URL("http://localhost/api/scim/v2/Users/u1"),
        locals: { user: { isAdmin: true } },
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      const response = await dispatcherGET(event);
      const data = await response!.json();

      expect(data.id).toBe("u1");
      expect(mockAuth.getUserById).toHaveBeenCalledWith("u1", { tenantId: "tenant-1" });
    });

    it("DELETE /Users/[id] should deactivate user", async () => {
      mockAuth.getUserById.mockResolvedValue({ _id: "u1" });
      mockAuth.updateUser.mockResolvedValue({ success: true });

      const event = {
        params: { path: "scim/v2/Users/u1" },
        request: { method: "DELETE", headers: new Headers([["authorization", "Bearer token"]]) },
        url: new URL("http://localhost/api/scim/v2/Users/u1"),
        locals: { user: { isAdmin: true } },
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      const response = await dispatcherDELETE(event);
      expect(response.status).toBe(204);
      expect(mockAuth.updateUser).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ blocked: true }),
        { tenantId: "tenant-1" },
      );
    });

    it("GET /Groups should return tenant-scoped roles", async () => {
      mockAuth.getAllRoles.mockResolvedValue([{ _id: "r1", name: "Role 1" }]);

      const event = {
        params: { path: "scim/v2/Groups" },
        url: new URL("http://localhost/api/scim/v2/Groups"),
        request: { method: "GET", headers: new Headers([["authorization", "Bearer token"]]) },
        locals: { user: { isAdmin: true } },
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      const response = await dispatcherGET(event);
      const data = await response!.json();

      expect(data.Resources).toHaveLength(1);
      expect(mockAuth.getAllRoles).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    });

    it("PATCH /Groups/[id] should update membership in tenant via bulk update", async () => {
      const { dbAdapter } = await import("@src/databases/db");
      mockAuth.authInterface.getRoleById.mockResolvedValue({
        success: true,
        data: { _id: "r1", name: "Role 1" },
      });
      mockAuth.authInterface.getAllUsers.mockResolvedValue({
        success: true,
        data: [],
      });
      mockAuth.getUserById.mockResolvedValue({ _id: "u1", roles: [] });

      const event = {
        params: { path: "scim/v2/Groups/r1" },
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [{ op: "add", path: "members", value: [{ value: "u1" }] }],
          }),
          headers: new Headers(),
        },
        url: new URL("http://localhost/api/scim/v2/Groups/r1"),
        locals: { user: { isAdmin: true } },
        cookies: { get: vi.fn() },
      } as unknown as RequestEvent;

      const response = await dispatcherPATCH(event);
      expect(response.status).toBe(200);

      expect(mockAuth.authInterface.getRoleById).toHaveBeenCalledWith("r1", {
        tenantId: "tenant-1",
      });
      expect(dbAdapter!.crud.updateMany).toHaveBeenCalledWith(
        "users",
        expect.objectContaining({ _id: { $in: ["u1"] } }),
        expect.objectContaining({ role: "Role 1" }),
        { tenantId: "tenant-1" },
      );
    });
  });
});
