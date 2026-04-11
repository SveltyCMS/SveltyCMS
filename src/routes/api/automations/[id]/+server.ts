/**
 * @file src/routes/api/automations/[id]/+server.ts
 * @description REST API for single automation flow operations.
 *
 * Features:
 * - GET: Get a single automation flow
 * - PATCH: Update an automation flow
 * - DELETE: Delete an automation flow
 */

import { automationService } from "@src/services/automation/automation-service";
import type { AutomationFlow } from "@src/services/automation/types";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

/** GET /api/automations/:id — Get a single flow for the current tenant */
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
    const flow = await automationService.getFlow(params.id, tenantId);
    if (!flow) {
      throw new AppError("Automation not found", 404, "NOT_FOUND");
    }
    return json({ success: true, data: flow });
  } catch (error) {
    logger.error(`Failed to load automation ${params.id} for tenant ${tenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_LOAD_FAILED");
  }
});

/** PATCH /api/automations/:id — Update a flow (tenant-scoped) */
export const PATCH = apiHandler(async ({ params, request, locals }) => {
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
    const existing = await automationService.getFlow(params.id, tenantId);
    if (!existing) {
      throw new AppError("Automation not found", 404, "NOT_FOUND");
    }

    const body = (await request.json()) as Partial<AutomationFlow>;
    const flow = await automationService.saveFlow({ ...body, id: params.id }, tenantId);
    logger.info(
      `Automation updated: ${flow.name} (${flow.id}) for tenant ${tenantId} by ${locals.user.email}`,
    );

    return json({ success: true, data: flow });
  } catch (error) {
    logger.error(`Failed to update automation ${params.id} for tenant ${tenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_UPDATE_FAILED");
  }
});

/** DELETE /api/automations/:id — Delete a flow (tenant-scoped) */
export const DELETE = apiHandler(async ({ params, locals }) => {
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
    const existing = await automationService.getFlow(params.id, tenantId);
    if (!existing) {
      throw new AppError("Automation not found", 404, "NOT_FOUND");
    }

    await automationService.deleteFlow(params.id, tenantId);
    logger.info(`Automation deleted: ${params.id} for tenant ${tenantId} by ${locals.user.email}`);

    return json({ success: true, message: "Automation deleted" });
  } catch (error) {
    logger.error(`Failed to delete automation ${params.id} for tenant ${tenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_DELETE_FAILED");
  }
});
