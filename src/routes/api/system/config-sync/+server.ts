/**
 * @file src/routes/api/config_sync/+server.ts
 * @description Unified API for configuration synchronization.
 * Handles the diffing, exporting, and importing of configuration entities.
 *
 * Security: Protected by hooks, admin-only.
 */

import { configService } from "@src/services/config-service";
import { invalidateSettingsCache } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

import { getPrivateSettingSync } from "@src/services/settings-service";

// GET → Returns filesystem vs. database synchronization status (tenant-scoped)
export const GET = apiHandler(async ({ locals }) => {
  const { user, tenantId, isAdmin } = locals;

  if (!(user && isAdmin)) {
    throw new AppError("Forbidden: Administrator access required.", 403, "FORBIDDEN");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const status = await configService.getStatus(tenantId!);
    return json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to get configuration status for tenant ${tenantId}:`, err);
    throw new AppError(`Configuration status check failed: ${message}`, 500, "CONFIG_STATUS_ERROR");
  }
});

// POST → Triggers an 'import' or 'export' synchronization action (tenant-scoped)
export const POST = apiHandler(async ({ locals, request }) => {
  const { user, tenantId, isAdmin } = locals;

  if (!(user && isAdmin)) {
    throw new AppError("Forbidden: Administrator access required.", 403, "FORBIDDEN");
  }

  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  try {
    const { action, uuids, payload } = await request.json();

    switch (action) {
      case "import": {
        const status = await configService.getStatus(tenantId!);

        if (status.unmetRequirements.length > 0) {
          return json(
            {
              success: false,
              message: "Import blocked due to unmet requirements.",
              unmetRequirements: status.unmetRequirements,
            },
            { status: 409 },
          );
        }

        await configService.performImport({
          changes: payload,
          tenantId: tenantId!,
        });
        invalidateSettingsCache();

        return json({
          success: true,
          message: "Configuration imported successfully.",
        });
      }

      case "export": {
        const result = await configService.performExport({
          uuids,
          tenantId: tenantId!,
        });
        return json({
          success: true,
          message: "Configuration exported successfully.",
          output: result,
        });
      }

      default:
        throw new AppError("Invalid action specified.", 400, "INVALID_ACTION");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Configuration sync POST failed for tenant ${tenantId}:`, err);
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(`Configuration sync failed: ${message}`, 500, "CONFIG_SYNC_ERROR");
  }
});
