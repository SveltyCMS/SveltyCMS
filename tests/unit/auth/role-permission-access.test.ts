/**
 * @file tests/unit/role-permission-access.test.ts
 * @description Tests for role and permission management in the Auth system
 *
 * This test file validates:
 * - Role-based permission checking
 * - Admin privilege handling
 * - Action-based permissions
 * - Permission utility functions
 *
 * Uses mocked roles and permission functions for isolated testing.
 * Tests the permission checking logic that works with database-stored roles.
 *
 * **DOES NOT require a running application** - all dependencies are mocked via:
 * - tests/unit/bun-preload.ts (preloaded via bunfig.toml)
 * - Mock roles defined in this file
 *
 * This allows the tests to run in CI/CD environments (like GitHub Actions)
 * without needing a database connection or running server.
 */

import {
  COLLECTION_BUILDER_PERMISSION_ID,
  getAllPermissions,
  hasCollectionBuilderPermission,
  hasPermissionByAction,
  hasPermissionWithRoles,
  isAdminRoleWithRoles,
  registerPermission,
} from "@src/databases/auth/permissions";
import type { Role, User } from "@src/databases/auth/types";
import { PermissionAction, PermissionType } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

// Mock roles that would be in database
const mockRoles: Role[] = [
  {
    _id: "admin" as DatabaseId,
    name: "Admin",
    description: "Administrator with full access",
    permissions: [], // Admins get all permissions via isAdmin flag
    isAdmin: true,
  },
  {
    _id: "editor" as DatabaseId,
    name: "Editor",
    description: "Can create and edit content",
    permissions: ["collection:read", "collection:write", "collection:create"],
    isAdmin: false,
  },
  {
    _id: "viewer" as DatabaseId,
    name: "Viewer",
    description: "Can only view content",
    permissions: ["collection:read"],
    isAdmin: false,
  },
  {
    _id: "developer" as DatabaseId,
    name: "Developer",
    description: "Can manage collections via Collection Builder",
    permissions: [COLLECTION_BUILDER_PERMISSION_ID],
    isAdmin: false,
  },
];

describe("Role and Permission Access Management", () => {
  beforeEach(() => {
    // Register test permissions
    registerPermission({
      _id: "collection:create" as DatabaseId,
      name: "Create Content",
      action: PermissionAction.CREATE,
      type: PermissionType.COLLECTION,
    });
    registerPermission({
      _id: "collection:read" as DatabaseId,
      name: "Read Content",
      action: PermissionAction.READ,
      type: PermissionType.COLLECTION,
    });
    registerPermission({
      _id: "collection:delete" as DatabaseId,
      name: "Delete Content",
      action: PermissionAction.DELETE,
      type: PermissionType.COLLECTION,
    });
  });

  test("Check user permissions with roles", () => {
    const editorUser: User = {
      _id: "user1" as DatabaseId,
      email: "editor@example.com",
      role: "editor",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    // Editor can create and read content
    const canCreate = hasPermissionWithRoles(editorUser, "collection:create", mockRoles);
    expect(canCreate).toBe(true);

    const canRead = hasPermissionWithRoles(editorUser, "collection:read", mockRoles);
    expect(canRead).toBe(true);

    // Editor cannot delete content
    const canDelete = hasPermissionWithRoles(editorUser, "collection:delete", mockRoles);
    expect(canDelete).toBe(false);
  });

  test("Admin role has all permissions", () => {
    const adminUser: User = {
      _id: "admin1" as DatabaseId,
      email: "admin@example.com",
      role: "admin",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    // Admin should have all permissions regardless of what's in permissions array
    const canCreate = hasPermissionByAction(
      adminUser,
      PermissionAction.CREATE,
      PermissionType.COLLECTION,
      undefined,
      mockRoles,
    );
    expect(canCreate).toBe(true);

    const canDelete = hasPermissionByAction(
      adminUser,
      PermissionAction.DELETE,
      PermissionType.COLLECTION,
      undefined,
      mockRoles,
    );
    expect(canDelete).toBe(true);

    const canDoAnything = hasPermissionWithRoles(adminUser, "any:action", mockRoles);
    expect(canDoAnything).toBe(true);
  });

  test("Permission checking by action and type", () => {
    const editorUser: User = {
      _id: "user1" as DatabaseId,
      email: "editor@example.com",
      role: "editor",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const canCreate = hasPermissionByAction(
      editorUser,
      PermissionAction.CREATE,
      PermissionType.COLLECTION,
      undefined,
      mockRoles,
    );
    expect(canCreate).toBe(true);

    const canDelete = hasPermissionByAction(
      editorUser,
      PermissionAction.DELETE,
      PermissionType.COLLECTION,
      undefined,
      mockRoles,
    );
    expect(canDelete).toBe(false);
  });

  test("Admin role detection", () => {
    const adminUser: User = {
      _id: "admin1" as DatabaseId,
      email: "admin@example.com",
      role: "admin",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const editorUser: User = {
      _id: "user1" as DatabaseId,
      email: "editor@example.com",
      role: "editor",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    expect(isAdminRoleWithRoles(adminUser.role, mockRoles)).toBe(true);
    expect(isAdminRoleWithRoles(editorUser.role, mockRoles)).toBe(false);
  });

  test("Viewer has limited permissions", () => {
    const viewerUser: User = {
      _id: "user2" as DatabaseId,
      email: "viewer@example.com",
      role: "viewer",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    // Viewer can read
    const canRead = hasPermissionWithRoles(viewerUser, "collection:read", mockRoles);
    expect(canRead).toBe(true);

    // Viewer cannot write or create
    const canWrite = hasPermissionWithRoles(viewerUser, "collection:write", mockRoles);
    expect(canWrite).toBe(false);

    const canCreate = hasPermissionWithRoles(viewerUser, "collection:create", mockRoles);
    expect(canCreate).toBe(false);
  });

  test("Permission registry functions", () => {
    const allPermissions = getAllPermissions();
    expect(allPermissions.length).toBeGreaterThan(0);

    // Check that our registered permissions are in the registry
    const hasContentCreate = allPermissions.some(
      (p: { _id: string }) => p._id === "collection:create",
    );
    expect(hasContentCreate).toBe(true);
  });

  test("hasCollectionBuilderPermission grants admin and config:collectionbuilder", () => {
    const adminUser: User = {
      _id: "admin1" as DatabaseId,
      email: "admin@example.com",
      role: "admin",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };
    const developerUser: User = {
      _id: "dev1" as DatabaseId,
      email: "dev@example.com",
      role: "developer",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };
    const editorUser: User = {
      _id: "editor1" as DatabaseId,
      email: "editor@example.com",
      role: "editor",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    expect(hasCollectionBuilderPermission(adminUser, mockRoles, true)).toBe(true);
    expect(hasCollectionBuilderPermission(developerUser, mockRoles)).toBe(true);
    expect(hasCollectionBuilderPermission(editorUser, mockRoles)).toBe(false);
    expect(hasCollectionBuilderPermission(null, mockRoles)).toBe(false);
  });
});
