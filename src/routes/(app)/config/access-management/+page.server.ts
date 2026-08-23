/**
 * @file src/routes/(app)/config/access-management/+page.server.ts
 * @description Server-side logic for Access Management page using simplified auth system.
 *
 * Features:
 * - Admin-only fail-closed gate (hook flag or isAdmin(user))
 * - Permissions catalog from in-memory registry (no DB)
 * - Roles reused from handleAuthorization locals (already loaded)
 * - Client payload stripped to RBAC fields (no bitset / adapter internals)
 */

import { getAllPermissions } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import type { Permission, Role } from "@src/databases/auth/types";
import { error } from "@sveltejs/kit";
import { rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

function slimRole(
  role: Role,
): Pick<
  Role,
  | "_id"
  | "name"
  | "description"
  | "permissions"
  | "isAdmin"
  | "groupName"
  | "color"
  | "icon"
  | "isNative"
  | "tenantId"
> {
  return {
    _id: role._id,
    name: role.name,
    description: role.description,
    permissions: Array.isArray(role.permissions) ? role.permissions : [],
    isAdmin: role.isAdmin === true,
    groupName: role.groupName,
    color: role.color,
    icon: role.icon,
    isNative: role.isNative,
    tenantId: role.tenantId,
  };
}

function slimPermission(
  permission: Permission,
): Pick<Permission, "_id" | "name" | "action" | "type" | "contextId" | "description"> {
  return {
    _id: permission._id,
    name: permission.name,
    action: permission.action,
    type: permission.type,
    contextId: permission.contextId,
    description: permission.description,
  };
}

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const { roles: tenantRoles = [], tenantId } = locals;
    const localsIsAdmin = !!(locals.isAdmin || isAdmin(user));

    if (!localsIsAdmin) {
      logger.warn(`User ${user._id} does not have permission to access access management`, {
        tenantId,
      });
      throw error(403, "Insufficient permissions to access access management");
    }

    const permissions = getAllPermissions().map(slimPermission);

    return {
      user: {
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      roles: tenantRoles.map(slimRole),
      permissions,
    };
  } catch (err: unknown) {
    rethrow(err);
    const message = `Error in load function for Access Management: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message, { tenantId: locals.tenantId });
    throw error(500, message);
  }
};
