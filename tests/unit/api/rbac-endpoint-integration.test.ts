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
import { defaultRoles } from "@src/databases/auth/default-roles";
import type { Role, User } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

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
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
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
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
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
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
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
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
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

  // ── Media capability mapping: virtual folders + image editor ──
  // Regression: `/api/system-virtual-folder` required the admin-only
  // `system:settings` capability and the built-in editor/developer roles never
  // received the granular media capabilities. Result in a real (non-test) run:
  // folder tree "Failed to load folders", folder create fails, image editor
  // save fails — while the SSR gallery shell still renders.
  describe("media capability mapping (virtual folders + image editor)", () => {
    const mediaEditorRole: Role = {
      _id: "editor" as DatabaseId,
      name: "Editor",
      permissions: ["collections:read", "media:read", "media:write", "media:delete"],
      isAdmin: false,
    };

    const mediaEditor: User = {
      _id: "user_media_editor" as DatabaseId,
      email: "media-editor@example.com",
      role: "editor",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const readOnlyRole: Role = {
      _id: "read-only" as DatabaseId,
      name: "Read Only",
      permissions: ["media:read"],
      isAdmin: false,
    };

    const readOnlyUser: User = {
      _id: "user_read_only" as DatabaseId,
      email: "read-only@example.com",
      role: "read-only",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const check = (
      user: User,
      roles: Role[],
      method: string,
      namespace = "system-virtual-folder",
    ) => _checkEndpointPermission(user, roles, method, namespace, [namespace]);

    it("lets an editor read and mutate virtual folders", () => {
      for (const method of ["GET", "POST", "PATCH"]) {
        expect(check(mediaEditor, [mediaEditorRole], method), `${method} folder`).toBe(true);
      }
      expect(check(mediaEditor, [mediaEditorRole], "DELETE"), "DELETE folder").toBe(true);
    });

    it("lets an editor use the media endpoints (list + image-editor save)", () => {
      expect(check(mediaEditor, [mediaEditorRole], "GET", "media")).toBe(true);
      expect(check(mediaEditor, [mediaEditorRole], "POST", "media")).toBe(true);
    });

    it("keeps read-only roles read-only on folders", () => {
      expect(check(readOnlyUser, [readOnlyRole], "GET")).toBe(true);
      expect(check(readOnlyUser, [readOnlyRole], "POST")).toBe(false);
      expect(check(readOnlyUser, [readOnlyRole], "PATCH")).toBe(false);
      expect(check(readOnlyUser, [readOnlyRole], "DELETE")).toBe(false);
    });

    it("keeps unknown namespaces fail-closed", () => {
      expect(check(readOnlyUser, [readOnlyRole], "GET", "not-a-namespace")).toBe(false);
    });

    it("ships media capabilities on the built-in editor and developer roles", () => {
      for (const id of ["editor", "developer"]) {
        const permissions = defaultRoles.find((role) => String(role._id) === id)?.permissions ?? [];
        expect(permissions, `${id} must read media`).toContain("media:read");
        expect(permissions, `${id} must write media`).toContain("media:write");
        expect(permissions, `${id} must delete media`).toContain("media:delete");
      }
    });
  });

  // ── Regression: authorization bypass on POST /api/user (account creation) ──
  describe("user/auth root-path gate (privilege-escalation regression)", () => {
    const regularUser: User = {
      _id: "user_regular_root_1" as DatabaseId,
      email: "regular@example.com",
      role: "user",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const regularRoles: Role[] = [
      { _id: "user" as DatabaseId, name: "User", permissions: [], isAdmin: false },
    ];

    const userManager: User = {
      _id: "user_manager_root_1" as DatabaseId,
      email: "manager@example.com",
      role: "role_user_manager",
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    const userManagerRoles: Role[] = [
      {
        _id: "role_user_manager" as DatabaseId,
        name: "User Manager",
        permissions: ["user:read", "user:write"],
        isAdmin: false,
      },
    ];

    const adminUser: User = {
      _id: "user_admin_root_1" as DatabaseId,
      email: "admin-root@example.com",
      role: "admin",
      isAdmin: true,
      permissions: [],
      createdAt: "2024-01-01T00:00:00Z" as ISODateString,
      updatedAt: "2024-01-01T00:00:00Z" as ISODateString,
    };

    it("denies an authenticated non-admin creating an account via POST /api/user", () => {
      expect(_checkEndpointPermission(regularUser, regularRoles, "POST", "user", ["user"])).toBe(
        false,
      );
    });

    it("denies non-managers listing the user directory via GET /api/user", () => {
      expect(_checkEndpointPermission(regularUser, regularRoles, "GET", "user", ["user"])).toBe(
        false,
      );
    });

    it("denies non-managers the strict sibling route POST /api/user/create-user (parity)", () => {
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "POST", "user", [
          "user",
          "create-user",
        ]),
      ).toBe(false);
    });

    it("allows admins via the admin fast-path", () => {
      expect(_checkEndpointPermission(adminUser, [], "POST", "user", ["user"])).toBe(true);
    });

    it("allows a user manager holding user:write", () => {
      expect(
        _checkEndpointPermission(userManager, userManagerRoles, "POST", "user", ["user"]),
      ).toBe(true);
      expect(_checkEndpointPermission(userManager, userManagerRoles, "GET", "user", ["user"])).toBe(
        true,
      );
    });

    it("keeps self-service routes allowed by name", () => {
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "GET", "user", ["user", "me"]),
      ).toBe(true);
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "POST", "user", [
          "user",
          "update-user-attributes",
        ]),
      ).toBe(true);
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "POST", "user", [
          "user",
          "save-avatar",
        ]),
      ).toBe(true);
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "POST", "user", [
          "user",
          "2fa",
          "verify",
        ]),
      ).toBe(true);
      // Own profile by id
      expect(
        _checkEndpointPermission(regularUser, regularRoles, "GET", "user", [
          "user",
          String(regularUser._id),
        ]),
      ).toBe(true);
    });

    it("keeps public login/2FA/OIDC/SAML auth flows allowed by name", () => {
      const exemptActions = [
        "login",
        "logout",
        "oidc-logout",
        "oidc-login",
        "oidc-callback",
        "sso-providers",
        "frontchannel-logout",
        "backchannel-logout",
        "saml",
        "2fa",
      ];
      for (const action of exemptActions) {
        expect(
          _checkEndpointPermission(regularUser, regularRoles, "POST", "auth", ["auth", action]),
          `expected /api/auth/${action} to stay exempt`,
        ).toBe(true);
      }
    });

    it("keeps bare GET /api/auth self-read while bare POST /api/auth stays gated", () => {
      expect(_checkEndpointPermission(regularUser, regularRoles, "GET", "auth", ["auth"])).toBe(
        true,
      );
      expect(_checkEndpointPermission(regularUser, regularRoles, "POST", "auth", ["auth"])).toBe(
        false,
      );
    });
  });
});
