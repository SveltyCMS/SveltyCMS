/**
 * @file src/databases/auth/permissions.ts
 * @description Permission utilities and checking functions
 *
 * This file contains utility functions for permission checking and management
 * that work with the simplified authentication system.
 */

// System Logger
import { logger } from "@utils/logger";
import { corePermissions } from "./core-permissions";
import { permissionCache } from "@utils/security/permission-cache";
// Auth
import type { Permission, Role, User } from "./types";

export interface PermissionConfig {
  action: string;
  contextId: string;
  contextType: string;
  description: string;
  name: string;
}

// Bitset mapping maps permission ID to a unique bit index
const permissionToBitIndex = new Map<string, number>();
const bitIndexToPermission: string[] = [];
let nextBitIndex = 0;

// Action index maps action:type:contextId string to the Permission object
const permissionActionIndex = new Map<string, Permission>();

function indexPermission(permission: Permission) {
  if (!permissionToBitIndex.has(permission._id)) {
    permissionToBitIndex.set(permission._id, nextBitIndex);
    bitIndexToPermission[nextBitIndex] = permission._id;
    nextBitIndex++;
  }
  const key = `${permission.action}:${permission.type}:${permission.contextId || ""}`;
  permissionActionIndex.set(key, permission);
}

// Permission registry for dynamic permissions
const permissionRegistry = new Map<string, Permission>();

// Initialize with core permissions
corePermissions.forEach((permission) => {
  permissionRegistry.set(permission._id, permission);
  indexPermission(permission);
});

// Register a new permission
export function registerPermission(permission: Permission): void {
  permissionRegistry.set(permission._id, permission);
  indexPermission(permission);
  logger.trace(`Permission registered: ${permission._id}`);
}

// Get all registered permissions
export function getAllPermissions(): Permission[] {
  return Array.from(permissionRegistry.values());
}

// Get a permission by ID
export function getPermissionById(permissionId: string): Permission | undefined {
  return permissionRegistry.get(permissionId);
}

// Compile a role's permissions into a Uint32Array bitset, cached directly on the role
export function getRoleBitset(role: Role): Uint32Array {
  if ((role as any).__bitset) {
    return (role as any).__bitset;
  }

  const size = Math.max(1, Math.ceil(nextBitIndex / 32));
  const bitset = new Uint32Array(size);

  for (const permId of role.permissions || []) {
    let index = permissionToBitIndex.get(permId);
    if (index === undefined) {
      index = nextBitIndex;
      permissionToBitIndex.set(permId, index);
      bitIndexToPermission[index] = permId;
      nextBitIndex++;
    }
    const wordIndex = index >> 5;
    if (wordIndex >= bitset.length) {
      continue;
    }
    bitset[wordIndex] |= 1 << (index & 31);
  }

  (role as any).__bitset = bitset;
  return bitset;
}

const DEFAULT_ROLE_NAMES: Record<string, string> = {
  admin: "Administrator",
  developer: "Developer",
  editor: "Editor",
  author: "Author",
};

const _roleIdsArrayCache = new WeakMap<Role[], string[]>();

function getRoleIdsArray(roles: Role[]): string[] {
  if (roles.length === 0) return [];
  let cached = _roleIdsArrayCache.get(roles);
  if (!cached) {
    cached = roles.map((r) => String(r._id));
    _roleIdsArrayCache.set(roles, cached);
  }
  return cached;
}

// Check if a user has a specific permission (with roles parameter to avoid circular dependency)
// Supports multiple roles — grants access if ANY role has the permission.
export function hasPermissionWithRoles(
  user: User,
  permissionId: string,
  roles: Role[] = [],
): boolean {
  // ADMIN FAST-PATH: If the user object is already marked as admin, grant immediately.
  if (user.isAdmin) {
    return true;
  }

  const safeRoles = roles || [];
  const userId = user._id ? String(user._id) : null;
  let roleIds: string[] | undefined;

  if (userId) {
    roleIds = getRoleIdsArray(safeRoles);
    const cached = permissionCache.get(userId, permissionId, roleIds);
    if (cached !== null) return cached;
  }

  const granted = evaluatePermissionWithRoles(user, permissionId, safeRoles);

  if (userId && roleIds) {
    permissionCache.set(userId, permissionId, roleIds, granted);
  }
  return granted;
}

/**
 * Un-cached permission evaluation — the decision engine behind hasPermissionWithRoles.
 * Split out so the result can be cached (and invalidated) as a unit.
 */
function evaluatePermissionWithRoles(user: User, permissionId: string, safeRoles: Role[]): boolean {
  const userRoleLower = (user.role || "").toLowerCase();
  const defaultRoleName = DEFAULT_ROLE_NAMES[userRoleLower];
  let matchedAnyRole = false;

  const index = permissionToBitIndex.get(permissionId);
  const bitMask = index !== undefined ? 1 << (index & 31) : 0;
  const wordIndex = index !== undefined ? index >> 5 : -1;

  // Single linear walk — zero array allocations, instant admin & bitset matching
  for (let ri = 0, rlen = safeRoles.length; ri < rlen; ri++) {
    const role = safeRoles[ri];
    const matches =
      role._id === user.role || (defaultRoleName ? role.name === defaultRoleName : false);
    if (!matches) continue;
    matchedAnyRole = true;

    // ADMIN OVERRIDE: If ANY matching role is admin, grant all permissions
    if (role.isAdmin) {
      logger.trace("Admin role granted permission", {
        email: user.email,
        permissionId,
      });
      return true;
    }

    if (index !== undefined) {
      const bitset = getRoleBitset(role);
      if (wordIndex < bitset.length && (bitset[wordIndex] & bitMask) !== 0) {
        return true;
      }
    }
  }

  if (!matchedAnyRole) {
    logger.warn("Role not found for user", {
      email: user.email,
      userRoleId: user.role,
      rolesAvailable: safeRoles.map((r) => r._id),
    });
    return false;
  }

  logger.warn("Permission denied for user across all roles", {
    email: user.email,
    userId: user._id,
    userRoleId: user.role,
    permissionId,
    rolesAvailable: safeRoles.map((r) => ({ id: r._id, isAdmin: r.isAdmin })),
  });
  return false;
}

// Add cache invalidation function.
// Pass a userId to clear one user's cache; omit to clear all entries
// (use after role/permission mutations that affect multiple users).
export function invalidatePermissionCache(userId?: string): void {
  if (userId) {
    permissionCache.invalidateUser(userId);
  } else {
    permissionCache.invalidateAll();
  }
}

// Check if a user has permission by action and type
export function hasPermissionByAction(
  user: User,
  action: string,
  type: string,
  contextId?: string,
  userRoles?: Role[],
): boolean {
  // If user is null, they don't have any permissions
  if (!user) {
    return false;
  }

  // ADMIN FAST-PATH: If user is admin, grant immediately without role lookup
  if (user.isAdmin) {
    return true;
  }

  const roles: Role[] = userRoles || [];
  if (!userRoles) {
    logger.warn("No roles available for permission check - defaulting to deny");
    return false;
  }

  const safeRoles = roles || [];
  const userRole = safeRoles.find((role) => role._id === user.role);
  if (!userRole) {
    return false;
  }

  // ADMIN OVERRIDE: Admins automatically have ALL permissions
  if (userRole.isAdmin) {
    logger.trace("Admin user granted permission for action", {
      email: user.email,
      action,
      type,
    });
    return true;
  }

  // Find matching permission via Action Index
  const key = `${action}:${type}:${contextId || ""}`;
  const permission = permissionActionIndex.get(key);

  if (!permission) {
    return false;
  }

  const index = permissionToBitIndex.get(permission._id);
  if (index === undefined) {
    return false;
  }

  const bitset = getRoleBitset(userRole);
  const wordIndex = index >> 5;
  if (wordIndex >= bitset.length) {
    return false;
  }

  return (bitset[wordIndex] & (1 << (index & 31))) !== 0;
}

// Get permissions for a specific role (with roles parameter)
export function getRolePermissionsWithRoles(roleId: string, roles: Role[] = []): string[] {
  const safeRoles = roles || [];
  const role = safeRoles.find((r) => r._id === roleId);
  return role?.permissions || [];
}

// Check if a role is admin (with roles parameter)
export function isAdminRoleWithRoles(roleId: string, roles: Role[] = []): boolean {
  const safeRoles = roles || [];
  const role = safeRoles.find((r) => r._id === roleId);
  return role?.isAdmin === true;
}

// Validate user permission from locals.permissions array
export function validateUserPermission(
  userPermissions: string[] | undefined,
  requiredPermission: string,
): boolean {
  if (!userPermissions) {
    logger.warn("No user permissions provided for validation", {
      requiredPermission,
    });
    return false;
  }

  const hasPermission = userPermissions.includes(requiredPermission);
  logger.trace("User permission validation", {
    requiredPermission,
    granted: hasPermission,
  });
  return hasPermission;
}

// Export permissions array for compatibility
export const permissions = getAllPermissions();

// Convenience functions for common operations
export function checkPermissions(user: User, permissionIds: string[], roles: Role[] = []): boolean {
  const safeRoles = roles || [];
  return permissionIds.every((permissionId) =>
    hasPermissionWithRoles(user, permissionId, safeRoles),
  );
}

/** Registered permission for Collection Builder create/edit operations */
export const COLLECTION_BUILDER_PERMISSION_ID = "config:collectionbuilder";

/**
 * Check whether a user may create or edit collections (Collection Builder pipeline).
 * Admins and users with `config:collectionbuilder` are allowed.
 */
export function hasCollectionBuilderPermission(
  user: User | null | undefined,
  roles: Role[] = [],
  isAdmin = false,
): boolean {
  if (!user) return false;
  if (isAdmin || user.isAdmin) return true;
  return hasPermissionWithRoles(user, COLLECTION_BUILDER_PERMISSION_ID, roles);
}
