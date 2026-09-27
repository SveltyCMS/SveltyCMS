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
import { isAdmin } from "./constants";
import {
  getPermissionBit,
  getRolePermMask,
  computeUserPermMask,
  registerBitmaskPermission,
  invalidateRoleBitsetsGlobally,
} from "./permission-bitmask";
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
  registerBitmaskPermission(permission._id);
  permissionCache.invalidateAll();
  invalidateRoleBitsetsGlobally();
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
  const requiredSize = Math.max(1, Math.ceil(nextBitIndex / 32));
  let bitset = (role as any).__bitset as Uint32Array | undefined;

  if (bitset && bitset.length >= requiredSize) {
    return bitset;
  }

  bitset = new Uint32Array(requiredSize);

  for (const permId of role.permissions || []) {
    let index = permissionToBitIndex.get(permId);
    if (index === undefined) {
      index = nextBitIndex;
      permissionToBitIndex.set(permId, index);
      bitIndexToPermission[index] = permId;
      nextBitIndex++;
    }
    const wordIndex = index >> 5;
    if (wordIndex < bitset.length) {
      bitset[wordIndex] |= 1 << (index & 31);
    }
  }

  (role as any).__bitset = bitset;
  return bitset;
}

export function invalidateRoleBitset(role: Role): void {
  delete (role as any).__bitset;
  invalidateRoleBitsetsGlobally();
}

export function setRolePermissions(role: Role, permissions: string[]): Role {
  role.permissions = permissions;
  delete (role as any).__bitset;
  invalidateRoleBitsetsGlobally();
  return role;
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
    cached = roles.map((r) => (typeof r._id === "string" ? r._id : String(r._id)));
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
  if (isAdmin(user)) {
    return true;
  }

  const safeRoles = roles || [];
  const userId = user._id ? (typeof user._id === "string" ? user._id : String(user._id)) : null;
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
 * Fast 64-bit bitmask permission evaluation — the decision engine behind hasPermissionWithRoles.
 * Evaluates ((userMask & reqBit) !== 0n) with zero memory allocations.
 */
function evaluatePermissionWithRoles(user: User, permissionId: string, safeRoles: Role[]): boolean {
  // Direct user-level permission override fast path
  if (Array.isArray(user.permissions) && user.permissions.includes(permissionId)) {
    return true;
  }

  // Future FLAC / Field-Level Access Control forward-compatibility
  if (permissionId.startsWith("field:")) {
    return evaluateFieldPermission(user, permissionId, safeRoles);
  }

  const reqBit = getPermissionBit(permissionId);
  if (reqBit !== 0n) {
    const userMask = computeUserPermMask(user, safeRoles);
    return (userMask & reqBit) !== 0n;
  }

  // Fallback for unmapped dynamic permissions
  return evaluateUnmappedPermission(user, permissionId, safeRoles);
}

/**
 * Forward-compatible handler for future Field-Level Access Control (FLAC).
 * Supports field:collection:fieldName:read/write conventions.
 */
function evaluateFieldPermission(user: User, permissionId: string, safeRoles: Role[]): boolean {
  if (Array.isArray(user.permissions) && user.permissions.includes(permissionId)) {
    return true;
  }
  const userRoleLower = (user.role || "").toLowerCase();
  const defaultRoleName = DEFAULT_ROLE_NAMES[userRoleLower];
  for (let i = 0; i < safeRoles.length; i++) {
    const role = safeRoles[i];
    const matches =
      role._id === user.role || (defaultRoleName ? role.name === defaultRoleName : false);
    if (!matches) continue;
    if (role.isAdmin) return true;
    if (role.permissions?.includes(permissionId)) return true;
  }
  return false;
}

/**
 * Fallback evaluator for unmapped dynamic permissions outside the 64-bit window.
 */
function evaluateUnmappedPermission(user: User, permissionId: string, safeRoles: Role[]): boolean {
  const userRoleLower = (user.role || "").toLowerCase();
  const defaultRoleName = DEFAULT_ROLE_NAMES[userRoleLower];
  for (let i = 0; i < safeRoles.length; i++) {
    const role = safeRoles[i];
    const matches =
      role._id === user.role || (defaultRoleName ? role.name === defaultRoleName : false);
    if (!matches) continue;
    if (role.isAdmin) return true;
    if (role.permissions?.includes(permissionId)) return true;
  }
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
  invalidateRoleBitsetsGlobally();
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

  const reqBit = getPermissionBit(permission._id);
  if (reqBit !== 0n) {
    const roleMask = getRolePermMask(userRole);
    return (roleMask & reqBit) !== 0n;
  }

  return userRole.permissions?.includes(permission._id) ?? false;
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

/**
 * Checks whether any assigned role of the user mandates Multi-Factor Authentication.
 * Returns true if ANY active role for the user has mfaRequired === true.
 */
export function isMfaRequiredForUser(user: User | null | undefined, roles: Role[] = []): boolean {
  if (!user) return false;
  const userRoleLower = (user.role || "").toLowerCase();
  const defaultRoleName = DEFAULT_ROLE_NAMES[userRoleLower];
  for (const role of roles) {
    const matches =
      role._id === user.role ||
      (typeof role._id === "string" && role._id.toLowerCase() === userRoleLower) ||
      (defaultRoleName ? role.name === defaultRoleName : false) ||
      (role.name && role.name.toLowerCase() === userRoleLower);
    if (matches && role.mfaRequired) {
      return true;
    }
  }
  return false;
}

/**
 * Validates whether the user's current session satisfies role-based MFA requirements.
 * Returns true if the user's role does not require MFA OR if the session AMR contains "mfa" or "webauthn".
 */
export function validateSessionMfaRequirement(
  user: User | null | undefined,
  roles: Role[] = [],
  sessionAmr?: string[],
): boolean {
  if (!isMfaRequiredForUser(user, roles)) {
    return true;
  }
  return Boolean(sessionAmr && (sessionAmr.includes("mfa") || sessionAmr.includes("webauthn")));
}
