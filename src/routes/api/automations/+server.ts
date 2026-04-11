/**
 * @file src/routes/api/automations/+server.ts
 * @description REST API for automation flow CRUD operations.
 *
 * Features:
 * - GET: List all automation flows
 * - POST: Create a new automation flow
 */

import { automationService } from "@src/services/automation/automation-service";
import type { AutomationFlow } from "@src/services/automation/types";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

/** GET /api/automations — List all automation flows for the current tenant */
export const GET = apiHandler(async ({ locals, url }) => {
  const userRole = locals.user?.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!locals.user || (!isAdmin && !isSuperAdmin)) {
    throw new AppError("Unauthorized", 403, "FORBIDDEN");
  }

  const tenantIdFromLocals = locals.tenantId || "";
  const targetTenantId = url.searchParams.get("tenantId") || tenantIdFromLocals;

  // SECURITY: Only super-admins can override tenantId
  if (getPrivateSettingSync("MULTI_TENANT")) {
    if (targetTenantId !== tenantIdFromLocals && !isSuperAdmin) {
      logger.warn(`Unauthorized automation tenant override attempt by user ${locals.user?._id}`, {
        userId: locals.user?._id,
        tenantId: locals.tenantId,
        targetTenantId,
      });
      throw new AppError(
        "Unauthorized: You can only access automations for your own tenant.",
        403,
        "TENANT_MISMATCH",
      );
    }

    if (!targetTenantId) {
      throw new AppError("Tenant ID required", 403, "TENANT_REQUIRED");
    }
  }

  try {
    const flows = await automationService.getFlows(targetTenantId);
    return json({ success: true, data: flows });
  } catch (error) {
    logger.error(`Failed to list automations for tenant ${targetTenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_LIST_FAILED");
  }
});

/** POST /api/automations — Create a new automation flow */
export const POST = apiHandler(async ({ request, locals }) => {
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
    const body = (await request.json()) as Partial<AutomationFlow>;

    if (!body.name) {
      throw new AppError("Name is required", 400, "INVALID_DATA");
    }

    const flow = await automationService.saveFlow(body, tenantId);
    logger.info(
      `Automation created: ${flow.name} (${flow.id}) for tenant ${tenantId} by ${locals.user.email}`,
    );

    return json({ success: true, data: flow }, { status: 201 });
  } catch (error) {
    logger.error(`Failed to create automation for tenant ${tenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_CREATE_FAILED");
  }
});
