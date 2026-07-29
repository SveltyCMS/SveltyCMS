/**
 * @file src/services/security/capability-registry.ts
 * @description Merged capability catalog for core + plugin capabilities.
 *
 * aphexcms-inspired unified capability model:
 * - Core built-in capabilities + plugin-declared capabilities are merged into
 *   a single catalog on boot.
 * - `owner` is treated as an invariant that always holds ALL capabilities
 *   from the merged catalog (never fewer).
 * - Built-in roles are reconciled on boot so existing orgs pick up newly
 *   added capabilities automatically.
 * - `hasCapability` accepts both core `Capability` union members and
 *   arbitrary plugin-declared string IDs.
 *
 * ### Features:
 * - merged core + plugin capability catalog
 * - owner auto-inheritance of all capabilities
 * - boot-time role reconciliation (owner only)
 * - type-safe hasCapability (Capability | string & {})
 * - plugin capability registration/deregistration
 * - enforced plugin-id prefix isolation (plugin:[id]:[cap])
 */

import type { Role, User } from "@src/databases/auth/types";
import type { PluginCapability } from "@src/plugins/types";
import { logger } from "@utils/logger";

// ============================================================================
// Core Capability Definitions
// ============================================================================

/** All built-in CMS capabilities — the closed set that every owner gets. */
export const CORE_CAPABILITIES: readonly string[] = [
  // Content
  "collection:read",
  "collection:write",
  "collection:delete",
  "collections:read",
  "collections:write",
  "content:export",
  "content:import",
  "content:sync",

  // Media
  "media:read",
  "media:write",
  "media:delete",

  // Users & Roles
  "user:read",
  "user:write",
  "user:delete",
  "user:manage",

  // System
  "system:read",
  "system:settings",
  "system:admin",
  "systemPreferences:read",
  "systemPreferences:write",

  // Config
  "config:read",
  "config:write",
  "config:settings",
  "config:collectionManagement",
  "config:collectionbuilder",
  "config:graphql",
  "config:imageeditor",
  "config:dashboard",
  "config:widgetManagement",
  "config:themeManagement",
  "config:accessManagement",
  "config:emailPreviews",
  "config:adminArea",
  "config:importexport",
  "config:automations",
  "config:webhooks",

  // API
  "api:user",
  "api:exportData",

  // Admin
  "admin:access",

  // Dashboard
  "dashboard:read",

  // Backups
  "backup:read",
  "backup:create",

  // Tokens
  "token:create",

  // Migration
  "migration:read",
  "migration:apply",

  // Plugin system
  "plugin:settings:manage",
  "plugins:execute",
] as const;

/** Core capability union type for autocomplete. */
export type CoreCapability = (typeof CORE_CAPABILITIES)[number];

// ============================================================================
// Capability Registry
// ============================================================================

/**
 * Singleton registry that merges core built-in capabilities with
 * plugin-declared capabilities into a unified catalog.
 */
class CapabilityRegistry {
  private pluginCapabilities = new Map<string, Set<string>>();
  private mergedCache: string[] | null = null;

  /**
   * Register capabilities declared by a plugin.
   * Called during plugin initialization.
   *
   * Enforces a `plugin:[pluginId]:*` prefix on all plugin capabilities
   * to isolate them from core system paths and prevent naming collisions.
   * Local capabilities (db:read, media:read) are auto-prefixed.
   */
  registerPlugin(pluginId: string, capabilities: PluginCapability[]): void {
    if (capabilities.length === 0) return;

    const prefixed = new Set<string>();
    for (const cap of capabilities) {
      const capStr = String(cap);
      // Auto-prefix plugin-local capabilities to isolate from core namespace
      const isolated = capStr.startsWith("plugin:") ? capStr : `plugin:${pluginId}:${capStr}`;
      prefixed.add(isolated);
    }

    this.pluginCapabilities.set(pluginId, prefixed);
    this.invalidateCache();
    logger.debug(
      `[CapabilityRegistry] Registered ${prefixed.size} capabilities for plugin "${pluginId}"`,
    );
  }

  /**
   * Deregister a plugin's capabilities.
   * Called when a plugin is disabled or uninstalled.
   */
  deregisterPlugin(pluginId: string): void {
    const removed = this.pluginCapabilities.delete(pluginId);
    if (removed) {
      this.invalidateCache();
      logger.debug(`[CapabilityRegistry] Deregistered capabilities for plugin "${pluginId}"`);
    }
  }

  /**
   * Get the merged catalog: all core capabilities + all plugin capabilities.
   */
  getAllCapabilities(): string[] {
    if (this.mergedCache) return this.mergedCache;

    const merged = new Set<string>(CORE_CAPABILITIES);
    for (const caps of this.pluginCapabilities.values()) {
      for (const cap of caps) {
        merged.add(cap);
      }
    }

    this.mergedCache = [...merged].sort();
    return this.mergedCache;
  }

  /**
   * Get the set of capabilities that the owner role should hold.
   * Owner always gets ALL capabilities from the merged catalog.
   */
  getOwnerCapabilities(): string[] {
    return this.getAllCapabilities();
  }

  /**
   * Check if a user holds a specific capability.
   * Accepts both core union members and plugin-declared string IDs.
   *
   * @param user - The user to check
   * @param capability - The capability ID (core union or plugin string)
   * @param roles - Available roles for permission lookup
   */
  hasCapability(
    user: User | null | undefined,
    capability: CoreCapability | PluginCapability | (string & {}),
    roles: Role[] = [],
  ): boolean {
    if (!user) return false;

    // Admin fast-path
    if (user.isAdmin) return true;

    const safeRoles = roles || [];

    // Find user's roles
    const userRoles = safeRoles.filter(
      (role) =>
        role._id === user.role || role.name?.toLowerCase() === String(user.role).toLowerCase(),
    );

    if (userRoles.length === 0) return false;

    // Admin role override
    for (const role of userRoles) {
      if (role.isAdmin) return true;
    }

    // Check if any of the user's roles have this capability in their permissions
    const capabilityId = String(capability);
    for (const role of userRoles) {
      if (role.permissions && role.permissions.includes(capabilityId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a user holds the `plugin.settings.manage` capability,
   * optionally gated to a specific plugin.
   */
  canManagePluginSettings(
    user: User | null | undefined,
    roles: Role[] = [],
    _pluginId?: string,
  ): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    return this.hasCapability(user, "plugin:settings:manage", roles);
  }

  /**
   * Check if a user holds the `plugins:execute` capability.
   */
  canExecutePlugins(user: User | null | undefined, roles: Role[] = []): boolean {
    if (!user) return false;
    if (user.isAdmin) return true;
    return this.hasCapability(user, "plugins:execute", roles);
  }

  private invalidateCache(): void {
    this.mergedCache = null;
  }

  /** Clear all registered plugin capabilities (for testing). */
  clear(): void {
    this.pluginCapabilities.clear();
    this.invalidateCache();
  }
}

/** Singleton instance */
export const capabilityRegistry = new CapabilityRegistry();

// ============================================================================
// Role Reconciliation
// ============================================================================

/**
 * Reconcile the owner built-in role with the merged capability catalog.
 *
 * Owner is treated as an invariant — it always holds ALL capabilities from the
 * merged catalog (core + plugin). This function ensures the owner role's
 * permissions array matches the current merged catalog, adding any new
 * capabilities and removing none.
 *
 * Call this during CMS boot (`CMSEngine.initialize()`) to ensure all existing
 * orgs pick up newly added capabilities automatically.
 *
 * @param ownerRole - The current owner role object (mutated in place).
 * @returns The reconciled owner role with updated permissions.
 */
export function reconcileOwnerRole(ownerRole: Role): Role {
  const allCaps = capabilityRegistry.getOwnerCapabilities();
  const currentPerms = new Set(ownerRole.permissions || []);

  let added = 0;
  for (const cap of allCaps) {
    if (!currentPerms.has(cap)) {
      currentPerms.add(cap);
      added++;
    }
  }

  if (added > 0) {
    logger.info(
      `[CapabilityRegistry] Reconciled owner role — added ${added} new capabilities (total: ${currentPerms.size})`,
    );
  }

  return {
    ...ownerRole,
    permissions: [...currentPerms],
  };
}

/**
 * Reconcile all built-in roles for a list of roles.
 * Only the owner role receives new capabilities automatically.
 * Admin, editor, and viewer roles are deliberately left untouched —
 * operators may have narrowed them on purpose.
 *
 * @param roles - All roles for the current tenant
 * @param ownerRoleId - The ID of the built-in owner role
 * @returns The reconciled roles array
 */
export function reconcileBuiltinRoles(roles: Role[], ownerRoleId: string): Role[] {
  return roles.map((role) => {
    if (String(role._id) === ownerRoleId || role.name?.toLowerCase() === "owner") {
      return reconcileOwnerRole(role);
    }
    return role;
  });
}

/**
 * Check if a role is the built-in owner role.
 * Returns true for roles with `isNative` set and name "Owner".
 */
export function isOwnerRole(role: Role): boolean {
  return role.isNative === true && role.name?.toLowerCase() === "owner";
}

/**
 * Find the built-in owner role from a list of roles.
 */
export function findOwnerRole(roles: Role[]): Role | undefined {
  return roles.find((r) => isOwnerRole(r));
}
