/**
 * @file src/routes/(app)/config/+page.server.ts
 * @description Server-side logic for Config page authentication and authorization.
 *
 * SECURITY ARCHITECTURE (Layer 2 of 3):
 * This provides fine-grained permission checking for UI elements.
 * Works with:
 * - Layer 1: hooks.server.ts (API/route protection)
 * - Layer 2: This file (page-level authorization)
 * - Layer 3: PermissionGuard.svelte (UI visibility control)
 */

// Auth
import {
  permissions as allPermissions,
  hasPermissionByAction,
  permissionConfigs,
} from "@src/databases/auth/permissions";
import { error, redirect } from "@sveltejs/kit";
import { cacheService } from "@src/databases/cache/cache-service";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const { user } = locals;

    if (!user) {
      logger.warn("User not authenticated, redirecting to login");
      throw redirect(302, "/login");
    }

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

    // Fine-grained permission checking for each config item
    // This allows control where each setting group,
    // menu item, or feature can have individual permissions assigned
    const permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }> = {};

    // Admin bypass — skip cache, return all true immediately
    if (isAdmin) {
      for (const key in permissionConfigs) {
        if (!Object.hasOwn(permissionConfigs, key)) continue;
        permissions[permissionConfigs[key].contextId] = {
          hasPermission: true,
          isRateLimited: false,
        };
      }
    } else {
      // Non-admin: cache permission set per user for 5 minutes
      const permCacheKey = `config:permissions:${user._id}`;
      const cached = await cacheService.get<typeof permissions>(permCacheKey);
      if (cached) {
        return {
          user: serializableUser,
          permissions: cached,
          permissionConfigs,
          allPermissions,
          isAdmin,
        };
      }

      for (const key in permissionConfigs) {
        if (!Object.hasOwn(permissionConfigs, key)) continue;
        const config = permissionConfigs[key];
        const permissionCheck = await hasPermissionByAction(
          user,
          config.action,
          config.type,
          config.contextId,
          locals.roles || [],
        );
        permissions[config.contextId] = {
          hasPermission: permissionCheck,
          isRateLimited: false,
        };
      }

      await cacheService.set(permCacheKey, permissions, 300_000); // 5 min TTL
    }

    return {
      user: serializableUser,
      permissions,
      permissionConfigs,
      allPermissions,
      isAdmin,
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
