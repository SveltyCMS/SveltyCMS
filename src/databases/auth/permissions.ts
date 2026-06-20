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

// Check if a user has a specific permission (with roles parameter to avoid circular dependency)
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
  let userRole = safeRoles.find((role) => role._id === user.role);

  // Fallback: user.role may reference a default role name ('admin', 'developer', 'editor')
  // but tenant-scoped roles have UUID IDs. Match by name instead.
  if (!userRole) {
    const DEFAULT_ROLE_NAMES: Record<string, string> = {
      admin: "Administrator",
      developer: "Developer",
      editor: "Editor",
      author: "Author",
    };
    const roleName = DEFAULT_ROLE_NAMES[(user.role || "").toLowerCase()];
    if (roleName) {
      userRole = safeRoles.find((role) => role.name === roleName);
    }
  }

  if (!userRole) {
    logger.warn("Role not found for user", {
      email: user.email,
      userRoleId: user.role,
      rolesAvailable: safeRoles.map((r) => r._id),
    });
    return false;
  }

  // ADMIN OVERRIDE: Admins automatically have ALL permissions
  if (userRole.isAdmin) {
    logger.trace("Admin user granted permission", {
      email: user.email,
      permissionId,
      userRole,
    });
    return true;
  }

  // Bitset Fast Path Check
  const index = permissionToBitIndex.get(permissionId);
  if (index === undefined) {
    logger.warn("Permission denied (unregistered ID) for user", {
      email: user.email,
      userId: user._id,
      permissionId,
    });
    return false;
  }

  const bitset = getRoleBitset(userRole);
  const wordIndex = index >> 5;
  if (wordIndex >= bitset.length) {
    return false;
  }

  const hasPermission = (bitset[wordIndex] & (1 << (index & 31))) !== 0;

  if (!hasPermission) {
    logger.warn("Permission denied for user", {
      email: user.email,
      userId: user._id,
      userRoleId: user.role,
      userRole,
      permissionId,
      userPermissions: userRole.permissions,
      rolesAvailable: roles.map((r) => ({ id: r._id, isAdmin: r.isAdmin })),
    });
  }
  logger.trace("Permission check for user", {
    permissionId,
    granted: hasPermission,
    email: user.email,
  });

  return hasPermission;
}

// Add cache invalidation function
export function invalidatePermissionCache(userId: string): void {
  permissionCache.invalidateUser(userId);
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

  let roles: Role[] = userRoles || []; // If no roles provided, try to get them from a global location
  if (!userRoles) {
    try {
      // Try to access roles from a different location
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as unknown as { __ROLES_CACHE__?: Role[] }).__ROLES_CACHE__
      ) {
        roles = (globalThis as unknown as { __ROLES_CACHE__: Role[] }).__ROLES_CACHE__;
      } else {
        // Last resort - empty array
        logger.warn("No roles available for permission check - defaulting to deny");
        return false;
      }
    } catch (error: unknown) {
      logger.error("Failed to load roles for hasPermissionByAction:", error);
      return false;
    }
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

// Legacy permission config compatibility - maps old config keys to new permission IDs
export function getPermissionConfig(configKey: string): PermissionConfig | null {
  const configMap: Record<string, string> = {
    collectionManagement: "config:collectionManagement",
    collectionbuilder: "config:collectionbuilder",
    graphql: "config:graphql",
    imageeditor: "config:imageeditor",
    dashboard: "config:dashboard",
    widgetManagement: "config:widgetManagement",
    themeManagement: "config:themeManagement",
    settings: "config:settings",
    accessManagement: "config:accessManagement",
    adminAccess: "admin:access",
    emailPreviews: "config:emailPreviews",
    adminAreaPermissionConfig: "config:adminArea",
    exportData: "api:exportData",
    apiUser: "api:user",
    userCreateToken: "user.create",
  };

  const permissionId = configMap[configKey];
  if (!permissionId) {
    logger.warn("Unknown permission config key", { configKey });
    return null;
  }

  const permission = getPermissionById(permissionId);
  if (!permission) {
    logger.warn("Permission not found for ID", { permissionId });
    return null;
  }

  return {
    contextId: permission.contextId || permissionId,
    name: permission.name,
    action: permission.action,
    contextType: permission.type || "",
    description: permission.description ?? "",
  };
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

// Legacy config map for compatibility
export const permissionConfigs: Record<
  string,
  {
    contextId: string;
    action: string;
    type: string;
    name: string;
    description: string;
  }
> = {
  collectionManagement: {
    contextId: "config:collectionManagement",
    action: "read",
    type: "config",
    name: "Collection Management",
    description: "Access to collection management",
  },
  collectionbuilder: {
    contextId: "config:collectionbuilder",
    action: "read",
    type: "config",
    name: "Collection Builder",
    description: "Access to collection builder",
  },
  graphql: {
    contextId: "config:graphql",
    action: "read",
    type: "config",
    name: "GraphQL",
    description: "Access to GraphQL interface",
  },
  imageeditor: {
    contextId: "config:imageeditor",
    action: "read",
    type: "config",
    name: "Image Editor",
    description: "Access to image editor",
  },
  dashboard: {
    contextId: "config:dashboard",
    action: "read",
    type: "config",
    name: "Dashboard",
    description: "Access to dashboard",
  },
  widgetManagement: {
    contextId: "config:widgetManagement",
    action: "read",
    type: "config",
    name: "Widget Management",
    description: "Access to widget management",
  },
  themeManagement: {
    contextId: "config:themeManagement",
    action: "read",
    type: "config",
    name: "Theme Management",
    description: "Access to theme management",
  },
  settings: {
    contextId: "config:settings",
    action: "read",
    type: "config",
    name: "Settings",
    description: "Access to settings",
  },

  // Fine-grained System Settings permissions (13 groups)
  settingsCache: {
    contextId: "config:settings:cache",
    action: "manage",
    type: "config",
    name: "Cache & Performance Settings",
    description: "Manage cache TTLs and performance settings",
  },
  settingsDatabase: {
    contextId: "config:settings:database",
    action: "manage",
    type: "config",
    name: "Database Settings",
    description: "Manage database and MongoDB settings",
  },
  settingsRedis: {
    contextId: "config:settings:redis",
    action: "manage",
    type: "config",
    name: "Redis Cache Settings",
    description: "Manage Redis configuration and connection",
  },
  settingsEmail: {
    contextId: "config:settings:email",
    action: "manage",
    type: "config",
    name: "Email/SMTP Settings",
    description: "Manage email server and SMTP configuration",
  },
  settingsSecurity: {
    contextId: "config:settings:security",
    action: "manage",
    type: "config",
    name: "Security Settings",
    description: "Manage 2FA, session, and security settings",
  },
  settingsOAuth: {
    contextId: "config:settings:oauth",
    action: "manage",
    type: "config",
    name: "OAuth & Social Login",
    description: "Manage Google OAuth and social login",
  },
  settingsMedia: {
    contextId: "config:settings:media",
    action: "manage",
    type: "config",
    name: "Media Storage Settings",
    description: "Manage media folder, sizes, and formats",
  },
  settingsLanguages: {
    contextId: "config:settings:languages",
    action: "manage",
    type: "config",
    name: "Languages & Localization",
    description: "Manage content languages and locales",
  },
  settingsIntegrations: {
    contextId: "config:settings:integrations",
    action: "manage",
    type: "config",
    name: "Third-Party Integrations",
    description: "Manage MapBox, TikTok, Twitch integrations",
  },
  settingsSite: {
    contextId: "config:settings:site",
    action: "manage",
    type: "config",
    name: "Site Configuration",
    description: "Manage site name, URLs, and basic config",
  },
  settingsAppearance: {
    contextId: "config:settings:appearance",
    action: "manage",
    type: "config",
    name: "Appearance Settings",
    description: "Manage default theme and appearance",
  },
  settingsLogging: {
    contextId: "config:settings:logging",
    action: "manage",
    type: "config",
    name: "Logging Settings",
    description: "Manage log levels, retention, and rotation",
  },
  settingsAdvanced: {
    contextId: "config:settings:advanced",
    action: "manage",
    type: "config",
    name: "Advanced Settings",
    description: "Manage server port, roles, permissions, and demo mode",
  },

  accessManagement: {
    contextId: "config:accessManagement",
    action: "read",
    type: "config",
    name: "Access Management",
    description: "Access to user management",
  },
  adminAccess: {
    contextId: "admin:access",
    action: "read",
    type: "admin",
    name: "Admin Access",
    description: "Administrative access",
  },
  emailPreviews: {
    contextId: "config:emailPreviews",
    action: "read",
    type: "config",
    name: "Email Previews",
    description: "Access to email previews",
  },
  adminAreaPermissionConfig: {
    contextId: "config:adminArea",
    action: "read",
    type: "config",
    name: "Admin Area",
    description: "Access to admin area",
  },
  exportData: {
    contextId: "api:exportData",
    action: "export",
    type: "api",
    name: "Export Data",
    description: "Export system data",
  },
  apiUser: {
    contextId: "api:user",
    action: "read",
    type: "api",
    name: "User API",
    description: "Access to user API",
  },
  userCreateToken: {
    contextId: "user.create",
    action: "create",
    type: "user",
    name: "Create User Token",
    description: "Create user registration tokens",
  },
  userManage: {
    contextId: "user:manage",
    action: "manage",
    type: "user",
    name: "User Management",
    description: "Manage user accounts and roles",
  },
};

// Export permissions array for compatibility
export const permissions = getAllPermissions();

// Convenience functions for common operations
export function checkPermissions(user: User, permissionIds: string[], roles: Role[] = []): boolean {
  const safeRoles = roles || [];
  return permissionIds.every((permissionId) =>
    hasPermissionWithRoles(user, permissionId, safeRoles),
  );
}

export function getUserRole(user: User, roles: Role[] = []): Role | undefined {
  const safeRoles = roles || [];
  return safeRoles.find((role) => role._id === user.role);
}

export function getUserRoles(user: User, roles: Role[] = []): Role[] {
  const safeRoles = roles || [];
  const userRole = getUserRole(user, safeRoles);
  return userRole ? [userRole] : [];
}
