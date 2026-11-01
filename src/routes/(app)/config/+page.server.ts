/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Config page authentication and authorization.
 *
 * SECURITY ARCHITECTURE (Layer 2 of 3):
 * This provides fine-grained permission checking for UI elements using the
 * high-performance 64-bit permission bitset RBAC engine.
 */

// Auth
import {
  permissions as allPermissions,
  hasPermissionWithRoles,
} from "@src/databases/auth/permissions";
import { error } from "@sveltejs/kit";
import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";
import { CONFIG_TILE_PERMISSIONS } from "./config-tile-permissions";

// Pre-computed admin permission map (all true, zero runtime allocation)
const ADMIN_CONFIG_PERMISSIONS: Record<
  string,
  { hasPermission: boolean; isRateLimited?: boolean }
> = {};
for (const contextId in CONFIG_TILE_PERMISSIONS) {
  ADMIN_CONFIG_PERMISSIONS[contextId] = {
    hasPermission: true,
    isRateLimited: false,
  };
}

export const load: PageServerLoad = async ({ locals, parent }) => {
  try {
    const user = getAuthenticatedUser(locals);

    logger.trace(`User session validated successfully for user: ${user._id}`);

    if (!user.role) {
      const message = `User role is missing for user ${user.email}`;
      logger.warn(message);
      throw error(403, message);
    }

    // Use isAdmin from authorization hook (handles multi-tenant fallback correctly)
    const isAdmin = locals.isAdmin === true;

    const serializableUser = {
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };

    // Layout already loaded plugin enablement (one findMany + 15s L1).
    let pluginStates: Record<string, boolean> = {};
    try {
      const parentData = await parent();
      pluginStates = (parentData?.pluginStates ?? {}) as Record<string, boolean>;
    } catch {
      // Plugin check is non-critical — if it fails, hide plugin tiles
    }

    // Admin bypass — return pre-computed static permissions immediately
    if (isAdmin) {
      return {
        user: serializableUser,
        permissions: ADMIN_CONFIG_PERMISSIONS,
        allPermissions,
        isAdmin,
        pluginStates,
      };
    }

    // Non-admin: cache permission set per user for 5 minutes
    const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};
    const permCacheKey = `config:permissions:${user._id}`;
    const cached = await cacheService.get<typeof permissions>(permCacheKey);
    if (cached) {
      return {
        user: serializableUser,
        permissions: cached,
        allPermissions,
        isAdmin,
        pluginStates,
      };
    }

    // Fast bitset checking for non-admin users
    const roles = locals.roles || [];
    for (const contextId in CONFIG_TILE_PERMISSIONS) {
      const permId = CONFIG_TILE_PERMISSIONS[contextId];
      const hasPermission = hasPermissionWithRoles(user, permId, roles);
      permissions[contextId] = {
        hasPermission,
        isRateLimited: false,
      };
    }

    await cacheService.set(permCacheKey, permissions, 300_000); // 5 min TTL

    return {
      user: serializableUser,
      permissions,
      allPermissions,
      isAdmin,
      pluginStates,
    };
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      // This is likely a redirect or an error we've already handled
      throw err;
    }
    const message = `Error in load function: ${err.message}`;
    logger.error(message);
    throw error(500, message);
  }
};
