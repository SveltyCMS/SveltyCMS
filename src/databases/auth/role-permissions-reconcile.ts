/**
 * @file src/databases/auth/role-permissions-reconcile.ts
 * @description
 * One-time upgrade for pristine built-in role permission sets.
 *
 * `seedRoles()` is idempotent: it creates the built-in roles on first setup and
 * then skips them. That means permission fixes in `default-roles.ts` never reach
 * an existing installation. This module upgrades a role only when its stored
 * permissions are *exactly* the previous default set — a role an admin has
 * customised (added or removed anything) is left untouched, because the database
 * is the source of truth for role permissions.
 *
 * ### Features:
 * - Exact-set match against the pre-fix developer/editor defaults
 * - Never overwrites customised roles
 * - Idempotent (after the upgrade the role no longer matches the legacy set)
 * - Invalidates role bitsets so in-flight sessions pick up the new grants
 */

import { defaultRoles } from "./default-roles";
import type { Role } from "./types";
import type { BaseQueryOptions, IAuthAdapter } from "@src/databases/db-interface";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { invalidateRoleBitsetsGlobally } from "./permission-bitmask";
import { invalidatePermissionCache } from "./permissions";
import { logger } from "@utils/logger";

/**
 * Permission sets shipped before the media-capability fix. A stored role that
 * matches one of these byte-for-byte (as a set) was never customised.
 */
const LEGACY_BUILTIN_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  developer: [
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
  ],
  editor: [
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
  ],
};

function samePermissionSet(current: readonly string[], expected: readonly string[]): boolean {
  if (current.length !== expected.length) return false;
  const set = new Set(current);
  return expected.every((permission) => set.has(permission));
}

/** Resolve a stored role to a built-in id, falling back to its display name. */
function builtinRoleId(role: Role): string | null {
  const id = String(role._id ?? "");
  if (LEGACY_BUILTIN_ROLE_PERMISSIONS[id]) return id;

  const name = String(role.name ?? "")
    .trim()
    .toLowerCase();
  if (name === "developer" || name === "editor") return name;
  return null;
}

export interface ReconcileResult {
  /** Built-in role ids whose permissions were upgraded. */
  updated: string[];
}

/**
 * Upgrade built-in roles that still carry a pre-fix default permission set.
 *
 * Safe to call on every boot: it performs no write once a role has been
 * upgraded or customised. Failures are logged and swallowed — a boot must never
 * fail because a role could not be reconciled.
 */
export async function reconcileBuiltinRolePermissions(
  auth: IAuthAdapter | null | undefined,
  options?: BaseQueryOptions,
): Promise<ReconcileResult> {
  if (!auth || typeof auth.getAllRoles !== "function") return { updated: [] };

  const scope = withSystemScope("migration");
  const roles = await auth.getAllRoles(scope);
  if (!Array.isArray(roles) || roles.length === 0) return { updated: [] };

  const nextPermissions = new Map<string, readonly string[]>(
    defaultRoles.map((role) => [String(role._id), role.permissions ?? []]),
  );

  const updated: string[] = [];

  for (const role of roles) {
    const id = builtinRoleId(role);
    if (!id) continue;

    const legacy = LEGACY_BUILTIN_ROLE_PERMISSIONS[id];
    const next = nextPermissions.get(id);
    if (!legacy || !next || next.length === 0) continue;

    const current = role.permissions ?? [];
    if (!samePermissionSet(current, legacy)) continue;

    try {
      const result = await auth.updateRole(
        role._id,
        { permissions: [...next] },
        { ...options, ...scope },
      );
      if (result && "success" in result && !result.success) {
        logger.warn(
          `[RolePermissions] Could not upgrade "${id}": ${result.error?.message ?? "unknown error"}`,
        );
        continue;
      }
      updated.push(id);
    } catch (error) {
      logger.warn(`[RolePermissions] Upgrade failed for "${id}":`, error);
    }
  }

  if (updated.length > 0) {
    invalidatePermissionCache();
    invalidateRoleBitsetsGlobally();
    logger.info(`[RolePermissions] Upgraded built-in role permissions: ${updated.join(", ")}`);
  }

  return { updated };
}
