/**
 * @file src/routes/api/automations/[id]/logs/+server.ts
 * @description Execution log endpoint for automation flows.
 *
 * Features:
 * - GET: Get execution history for a specific flow
 */

import { automationService } from "@src/services/automation/automation-service";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

/** GET /api/automations/:id/logs — Get execution logs (tenant-scoped) */
export const GET = apiHandler(async ({ params, locals }) => {
  const userRole = locals.user?.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!locals.user || (!isAdmin && !isSuperAdmin)) {
    throw new AppError("Unauthorized", 403, "FORBIDDEN");
  }

  const tenantId = locals.tenantId || "";
  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    throw new AppError("Tenant ID required", 403, "TENANT_REQUIRED");
  }

  try {
    // First verify ownership of the automation
    const flow = await automationService.getFlow(params.id, tenantId);
    if (!flow) {
      throw new AppError("Automation not found or access denied", 404, "NOT_FOUND");
    }

    const logs = automationService.getLogs(params.id, tenantId);
    return json({ success: true, data: logs });
  } catch (error) {
    logger.error(`Failed to load logs for automation ${params.id} (tenant: ${tenantId}):`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_LOG_LOAD_FAILED");
  }
});
