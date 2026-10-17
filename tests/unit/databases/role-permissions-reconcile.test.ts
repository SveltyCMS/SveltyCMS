/**
 * @file tests/unit/databases/role-permissions-reconcile.test.ts
 * @description Regression guard for the built-in role permission upgrade.
 *
 * `seedRoles()` is idempotent, so permission fixes in `default-roles.ts` never
 * reach existing installs. The reconciler upgrades only roles whose stored
 * permission set is still the exact pre-fix default — a customised role must
 * never be overwritten. Tenant-scoped roles (UUID ids) match by display name.
 */

import { describe, it, expect, vi } from "vitest";
import { reconcileBuiltinRolePermissions } from "@src/databases/auth/role-permissions-reconcile";
import { defaultRoles } from "@src/databases/auth/default-roles";
import type { Role } from "@src/databases/auth/types";

const LEGACY_EDITOR = [
  "collections:read",
  "collections:read_drafts",
  "collections:update",
  "collections:create",
  "content:editor",
  "content:read_drafts",
  "content:images",
  "system:dashboard",
  "api:systemInfo",
  "api:collections",
  "api:user",
  "api:userActivity",
  "api:media",
  "user:manage",
];

const LEGACY_DEVELOPER = [
  "system:dashboard",
  "api:graphql",
  "api:collections",
  "api:export",
  "api:systemInfo",
  "api:user",
  "api:userActivity",
  "api:media",
  "api:widgets",
  "api:send-mail",
  "collections:read",
  "collections:update",
  "collections:create",
  "content:builder",
  "config:collectionbuilder",
  "config:widgetManagement",
  "config:adminArea",
  "config:settings",
  "user:manage",
  "user.create",
];

function role(id: string, name: string, permissions: string[]): Role {
  return { _id: id, name, permissions, isAdmin: false } as unknown as Role;
}

function createAuth(roles: Role[]) {
  return {
    getAllRoles: vi.fn(async () => roles),
    updateRole: vi.fn(async () => ({ success: true, data: {} })),
  } as unknown as {
    getAllRoles: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
  };
}

function mediaPermissionsOf(id: string): string[] {
  const defaults = defaultRoles.find((r) => String(r._id) === id)?.permissions ?? [];
  return defaults.filter((p) => p.startsWith("media:"));
}

describe("reconcileBuiltinRolePermissions", () => {
  it("upgrades pristine developer and editor roles with the media capabilities", async () => {
    const auth = createAuth([
      role("developer", "Developer", [...LEGACY_DEVELOPER]),
      role("editor", "Editor", [...LEGACY_EDITOR]),
      role("admin", "Administrator", []),
      role("guest", "Guest", ["media:read"]),
    ]);

    const result = await reconcileBuiltinRolePermissions(auth as never);

    expect(result.updated.sort()).toEqual(["developer", "editor"]);
    expect(auth.updateRole).toHaveBeenCalledTimes(2);

    for (const id of ["developer", "editor"]) {
      const call = auth.updateRole.mock.calls.find(([roleId]) => String(roleId) === id);
      expect(call, `${id} should be upgraded`).toBeTruthy();
      const permissions = ((call?.[1] ?? {}) as { permissions?: string[] }).permissions ?? [];
      expect(permissions).toEqual(
        expect.arrayContaining(["media:read", "media:write", "media:delete"]),
      );
      expect(permissions).toEqual(expect.arrayContaining(mediaPermissionsOf(id)));
    }
  });

  it("never overwrites a customised role", async () => {
    const customisedEditor = [...LEGACY_EDITOR, "config:settings"]; // admin added a grant
    const trimmedDeveloper = LEGACY_DEVELOPER.filter((p) => p !== "user.create"); // admin revoked one
    const auth = createAuth([
      role("editor", "Editor", customisedEditor),
      role("developer", "Developer", trimmedDeveloper),
    ]);

    const result = await reconcileBuiltinRolePermissions(auth as never);

    expect(result.updated).toEqual([]);
    expect(auth.updateRole).not.toHaveBeenCalled();
  });

  it("is idempotent — the newly upgraded set no longer matches the legacy set", async () => {
    const upgradedEditor = [...LEGACY_EDITOR, "media:read", "media:write", "media:delete"];
    const auth = createAuth([role("editor", "Editor", upgradedEditor)]);

    const result = await reconcileBuiltinRolePermissions(auth as never);

    expect(result.updated).toEqual([]);
    expect(auth.updateRole).not.toHaveBeenCalled();
  });

  it("is a no-op when the adapter has no role API", async () => {
    await expect(reconcileBuiltinRolePermissions(null)).resolves.toEqual({ updated: [] });
    await expect(reconcileBuiltinRolePermissions({} as never)).resolves.toEqual({ updated: [] });
  });

  it("swallows an update failure and continues with the next role", async () => {
    const auth = createAuth([
      role("editor", "Editor", [...LEGACY_EDITOR]),
      role("developer", "Developer", [...LEGACY_DEVELOPER]),
    ]);
    auth.updateRole
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ success: true, data: {} });

    const result = await reconcileBuiltinRolePermissions(auth as never);

    // Editor threw (skipped), developer still upgraded.
    expect(result.updated).toEqual(["developer"]);
  });

  it("upgrades a tenant-scoped role matched by its display name", async () => {
    // Tenant seeds use a UUID instead of the stable built-in id.
    const auth = createAuth([
      role("01a14973-c22b-7348-a065-5cd446bf229f", "Editor", [...LEGACY_EDITOR]),
    ]);

    const result = await reconcileBuiltinRolePermissions(auth as never);

    expect(result.updated).toEqual(["editor"]);
  });
});
