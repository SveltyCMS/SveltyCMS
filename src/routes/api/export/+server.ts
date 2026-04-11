/**
 * @file src/routes/api/export/+server.ts
 * @description General export endpoint supporting multiple export types with tenant isolation and security.
 */

import { dbAdapter } from "@src/databases/db";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { getPrivateSettingSync } from "@src/services/settings-service";
import {
  exportSettings,
  encryptSensitiveData,
  createExportMetadata,
} from "@src/utils/server/export-utils";

export const POST = apiHandler(async ({ request, locals, url }) => {
  const { user, tenantId } = locals;

  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const userRole = user.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!isAdmin && !isSuperAdmin) {
    throw new AppError("Unauthorized: Admin access required", 403, "FORBIDDEN");
  }

  if (!dbAdapter) {
    throw new AppError("Database adapter not initialized", 500, "DB_ADAPTER_MISSING");
  }

  // SECURITY: Only super-admins can override tenantId via query param
  const tenantIdFromLocals = tenantId || "";
  const targetTenantId = url.searchParams.get("tenantId") || tenantIdFromLocals;

  if (getPrivateSettingSync("MULTI_TENANT")) {
    if (!targetTenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
    }
    if (targetTenantId !== tenantIdFromLocals && !isSuperAdmin) {
      logger.warn(`Unauthorized export tenant override attempt by user ${user._id}`, {
        userId: user._id,
        tenantId: locals.tenantId,
        targetTenantId,
      });
      throw new AppError(
        "Unauthorized: You can only export data for your own tenant.",
        403,
        "TENANT_MISMATCH",
      );
    }
  }

  const body = await request.json();
  const { type, download = false, sensitivePassword } = body;

  if (!type) {
    throw new AppError("Export type is required", 400, "MISSING_EXPORT_TYPE");
  }

  let exportData: any = {
    metadata: createExportMetadata(user._id),
    tenantId: targetTenantId,
  };

  switch (type) {
    case "users":
      try {
        // SCALABILITY: For very large datasets, streaming would be preferred.
        // For now, we use the tenant-scoped filter.
        const users = await dbAdapter.auth.getAllUsers({
          filter: { tenantId: targetTenantId },
        });
        exportData.type = "users";
        exportData.data = users;
      } catch (error) {
        logger.error(`Failed to export users for tenant ${targetTenantId}`, error);
        throw new AppError("Failed to export users", 500, "USER_EXPORT_FAILED");
      }
      break;

    case "settings": {
      // Use shared utility to handle sensitive data separation and tenant scoping
      const { settings, sensitive } = await exportSettings(
        {
          includeSensitive: !!sensitivePassword,
          includeSettings: true,
          includeCollections: false,
          format: "json",
        },
        targetTenantId,
      );
      exportData.type = "settings";
      exportData.data = settings;

      if (Object.keys(sensitive).length > 0 && sensitivePassword) {
        exportData.encryptedSensitive = await encryptSensitiveData(sensitive, sensitivePassword);
        exportData.hasSensitiveData = true;
      }
      break;
    }

    default:
      throw new AppError(
        "Invalid export type or not yet supported in this endpoint",
        400,
        "INVALID_EXPORT_TYPE",
      );
  }

  logger.info(`Exported data of type: ${type} for tenant ${targetTenantId}`);

  if (download) {
    const filename = `sveltycms-export-${type}-${targetTenantId || "global"}-${Date.now()}.json`;
    return json(exportData, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return json(exportData);
});
