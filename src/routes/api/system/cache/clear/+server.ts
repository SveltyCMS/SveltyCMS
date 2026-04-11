/**
 * @file src/routes/api/cache/clear/+server.ts
 * @description API endpoint for clearing all cache entries
 *
 * Features:
 * - Clear all cache entries
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { json } from "@sveltejs/kit";
/**
 * POST - Clear all cache entries
 */
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

import { getPrivateSettingSync } from "@src/services/settings-service";

/**
 * POST - Clear cache entries (tenant-scoped or global)
 */
export const POST = apiHandler(async ({ locals, url }) => {
  const { user, tenantId } = locals;

  // 1. Authentication & Role Check
  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const userRole = user.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!isAdmin && !isSuperAdmin) {
    throw new AppError("Unauthorized: Admin access required", 403, "FORBIDDEN");
  }

  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

  // 2. Determine target
  // Regular admins can only clear their own tenant
  // Super-admins can clear everything or a specific tenant via ?tenantId=...
  const targetTenantId = url.searchParams.get("tenantId") || tenantId;

  if (isMultiTenant && targetTenantId !== tenantId && !isSuperAdmin) {
    logger.warn(
      `Unauthorized cache clear attempt for tenant ${targetTenantId} by user ${user._id}`,
    );
    throw new AppError(
      "Unauthorized: You can only clear cache for your own tenant.",
      403,
      "TENANT_MISMATCH",
    );
  }

  // 3. Execute invalidation
  // If no targetTenantId and super-admin, clear ALL
  if (!targetTenantId && isSuperAdmin) {
    await cacheService.invalidateAll();
    logger.info("Global cache cleared by super-admin", { userId: user._id });
  } else {
    await cacheService.invalidateAll(targetTenantId);
    logger.info(`Cache cleared for tenant ${targetTenantId} by ${userRole} ${user._id}`);
  }

  return json({
    success: true,
    message: targetTenantId ? `Cache cleared for tenant ${targetTenantId}` : "Global cache cleared",
  });
});
