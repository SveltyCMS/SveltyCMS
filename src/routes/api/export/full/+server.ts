/**
 * @file src/routes/api/export/full/+server.ts
 * @description Full export endpoint - exports all content and settings with tenant scoping.
 */

import type { ExportData, ExportOptions } from "@src/content/types";
import { collections } from "@src/stores/collection-store.svelte.ts";
import { json } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import {
  createExportMetadata,
  encryptSensitiveData,
  exportCollections,
  exportSettings,
} from "@src/utils/server/export-utils";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { getPrivateSettingSync } from "@src/services/settings-service";

/**
 * Create complete export data (tenant-aware)
 */
async function createExport(
  userId: string,
  options: ExportOptions,
  tenantId?: string,
): Promise<ExportData> {
  logger.info(`Creating full export for tenant: ${tenantId || "global"}`, {
    userId,
    options,
  });

  const exportData: ExportData = {
    metadata: createExportMetadata(userId),
    hasSensitiveData: false,
  };

  if (options.includeSettings) {
    const { settings, sensitive } = await exportSettings(options, tenantId);
    exportData.settings = settings;

    if (Object.keys(sensitive).length > 0) {
      if (options.includeSensitive && options.sensitivePassword) {
        exportData.encryptedSensitive = await encryptSensitiveData(
          sensitive,
          options.sensitivePassword,
        );
        exportData.hasSensitiveData = true;
        logger.info(`Encrypted ${Object.keys(sensitive).length} sensitive settings`);
      } else if (options.includeSensitive) {
        logger.warn(
          "Sensitive settings requested but no password provided for encryption. Skipping sensitive fields.",
        );
      }
    }
  }

  if (options.includeCollections) {
    const availableCollections = (collections as any).all;
    exportData.collections = await exportCollections(options, availableCollections, tenantId);
  }

  return exportData;
}

/**
 * Export full system configuration
 * POST /api/export/full
 */
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

  // SECURITY: Only super-admins can override tenantId via query param
  const tenantIdFromLocals = tenantId || "";
  const targetTenantId = url.searchParams.get("tenantId") || tenantIdFromLocals;

  if (getPrivateSettingSync("MULTI_TENANT")) {
    if (!targetTenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
    }
    if (targetTenantId !== tenantIdFromLocals && !isSuperAdmin) {
      logger.warn(`Unauthorized full export tenant override attempt by user ${user._id}`, {
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

  try {
    const options: ExportOptions = await request.json();

    // Default options if not provided
    const exportOptions: ExportOptions = {
      includeSettings: options.includeSettings ?? true,
      includeCollections: options.includeCollections ?? false,
      includeSensitive: options.includeSensitive ?? false,
      sensitivePassword: options.sensitivePassword,
      format: options.format ?? "json",
      groups: options.groups,
      collections: options.collections,
    };

    const exportData = await createExport(user._id, exportOptions, targetTenantId);

    // Determine filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `sveltycms-full-export-${targetTenantId || "global"}-${timestamp}.json`;

    return json(exportData, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error(`Full export failed for tenant ${targetTenantId}:`, error);
    if (error instanceof AppError) throw error;
    throw new AppError("Internal Server Error", 500, "EXPORT_FAILED");
  }
});
