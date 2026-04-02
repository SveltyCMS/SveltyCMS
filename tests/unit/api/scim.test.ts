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
vi.mock("@src/databases/db", () => ({
  auth: {
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
  },
  dbAdapter: {
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
  },
  dbInitPromise: Promise.resolve(),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
}));

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

// Import handlers after mocking
const usersHandlers = await import("@src/routes/api/scim/v2/Users/+server.ts");
const userDetailHandlers = await import("@src/routes/api/scim/v2/Users/[id]/+server.ts");
const groupsHandlers = await import("@src/routes/api/scim/v2/Groups/+server.ts");
const groupDetailHandlers = await import("@src/routes/api/scim/v2/Groups/[id]/+server.ts");

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
        url: new URL("http://localhost/api/scim/v2/Users"),
        request: { headers: new Map([["authorization", "Bearer token"]]) },
      } as unknown as RequestEvent;

      const response = await usersHandlers.GET(event);
      const data = await response.json();

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
        request: {
          headers: new Map([["authorization", "Bearer token"]]),
          json: vi.fn().mockResolvedValue({
            userName: "new@t1.com",
            emails: [{ value: "new@t1.com", primary: true }],
          }),
        },
        url: new URL("http://localhost/api/scim/v2/Users"),
      } as unknown as RequestEvent;

      await usersHandlers.POST(event);
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
        params: { id: "u1" },
        request: { headers: new Map() },
        url: new URL("http://localhost/api/scim/v2/Users/u1"),
      } as unknown as RequestEvent;

      const response = await userDetailHandlers.GET(event);
      const data = await response.json();

      expect(data.id).toBe("u1");
      expect(mockAuth.getUserById).toHaveBeenCalledWith("u1", { tenantId: "tenant-1" });
    });

    it("DELETE /Users/[id] should deactivate user", async () => {
      mockAuth.getUserById.mockResolvedValue({ _id: "u1" });
      mockAuth.updateUser.mockResolvedValue({ success: true });

      const event = {
        params: { id: "u1" },
        request: { headers: new Map() },
        url: new URL("http://localhost/api/scim/v2/Users/u1"),
      } as unknown as RequestEvent;

      const response = await userDetailHandlers.DELETE(event);
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
        url: new URL("http://localhost/api/scim/v2/Groups"),
        request: { headers: new Map() },
      } as unknown as RequestEvent;

      const response = await groupsHandlers.GET(event);
      const data = await response.json();

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
        params: { id: "r1" },
        request: {
          json: vi.fn().mockResolvedValue({
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [{ op: "add", path: "members", value: [{ value: "u1" }] }],
          }),
          headers: new Map(),
        },
        url: new URL("http://localhost/api/scim/v2/Groups/r1"),
      } as unknown as RequestEvent;

      const response = await groupDetailHandlers.PATCH(event);
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
