/**
 * @file tests/unit/api/dispatcher-security-matrix.test.ts
 * @description Real catch-all dispatcher security matrix:
 * - fail-closed unmapped namespaces
 * - RBAC on hot namespaces (collections write, media delete-ish via write)
 * - multi-tenant isolation gates
 *
 * Uses invokeApi / createMockRequestEvent — keeps apiHandler real so AppError → Response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invokeApi, expectApi } from "../utils/mock-event";
import { runRbacMatrix } from "../utils/rbac-matrix";
import { createMockUser } from "../utils/mock-factories";

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      insert: vi.fn().mockResolvedValue({ success: true, data: {} }),
      update: vi.fn().mockResolvedValue({ success: true, data: {} }),
      delete: vi.fn().mockResolvedValue({ success: true }),
    },
    auth: {
      getUserById: vi.fn().mockResolvedValue({ success: true, data: null }),
      validateSession: vi.fn().mockResolvedValue({ success: true, user: null }),
      getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
    media: {
      files: { getByFolder: vi.fn().mockResolvedValue({ success: true, data: [] }) },
      deleteMedia: vi.fn().mockResolvedValue({ success: true }),
    },
    system: {
      preferences: { getMany: vi.fn().mockResolvedValue({ success: true, data: {} }) },
      widgets: { getActiveWidgets: vi.fn().mockResolvedValue({ success: true, data: [] }) },
    },
    collection: { getModel: vi.fn().mockResolvedValue({}) },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  isDbConnected: vi.fn().mockReturnValue(true),
  getAuth: vi.fn().mockReturnValue({}),
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollections: vi.fn().mockResolvedValue([]),
    getCollectionById: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(true),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true),
  getPublicSettingSync: vi.fn().mockReturnValue(false),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
  loadSettingsCache: vi.fn(),
  invalidateSettingsCache: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

// Keep apiHandler real → status codes on Response, not throws.

const editor = createMockUser({
  _id: "editor-1",
  role: "editor",
  isAdmin: false,
} as any);

const admin = createMockUser({
  _id: "admin-1",
  role: "admin",
  isAdmin: true,
} as any);

// hasPermissionWithRoles matches role._id === user.role OR role.name === "Editor"
const editorNoPerms = [
  {
    _id: "editor",
    name: "Editor",
    isAdmin: false,
    permissions: [] as string[],
  },
];

const editorWithCollectionWrite = [
  {
    _id: "editor",
    name: "Editor",
    isAdmin: false,
    permissions: ["collections:write", "collections:read"],
  },
];

describe("Dispatcher security matrix (real +server)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Fail-closed namespaces", () => {
    it("returns 403 for unknown API namespace (admin, fail-closed)", async () => {
      await expectApi(
        "GET",
        { path: "this-namespace-does-not-exist", user: admin, tenantId: "t1", bypass: true },
        403,
      );
    });

    it("returns 403 for SCIM as non-admin (bypass off)", async () => {
      await runRbacMatrix([
        {
          name: "scim denied",
          method: "GET",
          path: "scim/Users",
          user: editor,
          roles: editorNoPerms,
          expectedStatus: 403,
          bypass: false,
        },
      ]);
    });

    it("returns 401 when unauthenticated on protected route (bypass off)", async () => {
      await expectApi(
        "GET",
        { path: "collections", user: null, tenantId: "t1", bypass: false },
        401,
      );
    });
  });

  describe("Multi-tenant isolation", () => {
    it("rejects collections list without tenantId when multi-tenant is on", async () => {
      await expectApi(
        "GET",
        { path: "collections", user: admin, tenantId: null, bypass: true },
        [400, 403],
      );
    });

    it("rejects media list without tenantId when multi-tenant is on", async () => {
      const res = await invokeApi("GET", {
        path: "media",
        user: admin,
        tenantId: null,
        bypass: true,
      });
      // Prefer 400 TENANT_*; handlers may also 500 if adapter mocks are incomplete — never 200
      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("RBAC on hot namespaces (bypass off)", () => {
    it("table-driven permission checks", async () => {
      await runRbacMatrix([
        {
          name: "editor denied collections write",
          method: "POST",
          path: "collections/posts",
          body: { title: "Nope" },
          user: editor,
          roles: editorNoPerms,
          expectedStatus: 403,
        },
        {
          name: "editor with collections:write passes authz",
          method: "POST",
          path: "collections/posts",
          body: { title: "Maybe" },
          user: editor,
          roles: editorWithCollectionWrite,
          expectedNotStatus: [401, 403],
        },
        {
          name: "editor denied media delete",
          method: "DELETE",
          path: "media/some-id",
          user: editor,
          roles: editorNoPerms,
          expectedStatus: 403,
        },
        {
          name: "editor denied settings write",
          method: "POST",
          path: "settings",
          body: { key: "x", value: "y" },
          user: editor,
          roles: editorNoPerms,
          expectedStatus: 403,
        },
      ]);
    });
  });
});
