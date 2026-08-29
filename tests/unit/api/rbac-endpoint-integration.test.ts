/**
 * @file tests/unit/api/rbac-endpoint-integration.test.ts
 * @description White-box unit tests for the RBAC endpoint dispatch gate:
 * Endpoint Gate -> _checkEndpointPermission (internal) -> ENDPOINT_PERMISSIONS -> hasPermissionWithRoles (Bitsets).
 *
 * NOTE: Intentionally imports internal `_checkEndpointPermission` with mocked User/Role fixtures
 * to isolate and verify the authorization mapping and bitset evaluation without transport overhead.
 * Transport-level session extraction and E2E HTTP dispatching are verified in the security test suite.
 */

import { describe, it, expect } from "vitest";
import { _checkEndpointPermission } from "@src/routes/api/[...path]/+server";
import type { Role, User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/content/types";

describe("RBAC Endpoint Pipeline Integration", () => {
  const editorRole: Role = {
    _id: "role_editor" as DatabaseId,
    name: "Editor",
    permissions: ["collections:read", "collections:write", "media:read"],
    isAdmin: false,
  };

  const viewerRole: Role = {
    _id: "role_viewer" as DatabaseId,
    name: "Viewer",
    permissions: ["collections:read"],
    isAdmin: false,
  };

  const roles = [editorRole, viewerRole];

  it("denies unprivileged viewer from mutating content endpoints (403 path)", () => {
    const viewerUser: User = {
      _id: "user_viewer_1" as DatabaseId,
      email: "viewer@example.com",
      role: "role_viewer",
      permissions: [],
    };

    // GET /api/collections -> content:read -> Granted
    const canRead = _checkEndpointPermission(viewerUser, roles, "GET", "collections", [
      "collections",
      "posts",
    ]);
    expect(canRead).toBe(true);

    // POST /api/collections -> content:write -> Denied (Viewer lacks write)
    const canWrite = _checkEndpointPermission(viewerUser, roles, "POST", "collections", [
      "collections",
      "posts",
    ]);
    expect(canWrite).toBe(false);
  });

  it("grants editor access to content mutations via bitset evaluation (200 path)", () => {
    const editorUser: User = {
      _id: "user_editor_1" as DatabaseId,
      email: "editor@example.com",
      role: "role_editor",
      permissions: [],
    };

    const canWrite = _checkEndpointPermission(editorUser, roles, "POST", "collections", [
      "collections",
      "posts",
    ]);
    expect(canWrite).toBe(true);
  });

  it("grants admin full access across all endpoints via admin fast-path", () => {
    const adminUser: User = {
      _id: "user_admin_1" as DatabaseId,
      email: "admin@example.com",
      role: "admin",
      isAdmin: true,
      permissions: [],
    };

    const canDoAnything = _checkEndpointPermission(adminUser, [], "DELETE", "collections", [
      "collections",
      "posts",
    ]);
    expect(canDoAnything).toBe(true);
  });

  it("honors direct user-level permission overrides on endpoints", () => {
    const restrictedUserWithOverride: User = {
      _id: "user_override_endpoint_1" as DatabaseId,
      email: "override@example.com",
      role: "role_viewer", // Role only has content:read
      permissions: ["media:write"], // Direct override granting media upload
    };

    const canUploadMedia = _checkEndpointPermission(
      restrictedUserWithOverride,
      roles,
      "POST",
      "media",
      ["media", "upload"],
    );
    expect(canUploadMedia).toBe(true);
  });
});
