/**
 * @file src/routes/api/automations/[id]/test/+server.ts
 * @description Test endpoint for automation flows.
 * Executes a flow with sample data for verification.
 *
 * Features:
 * - POST: Test-execute a flow with sample payload
 * - Returns per-operation execution results
 */

import { automationService } from "@src/services/automation/automation-service";
import type { AutomationEventPayload } from "@src/services/automation/types";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

/** POST /api/automations/:id/test — Test a flow (tenant-scoped) */
export const POST = apiHandler(async ({ params, locals }) => {
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
      throw new AppError("Automation not found or access denied", 404, "NOT_FOUND");
    }

    // Build a sample payload with tenant context
    const samplePayload: AutomationEventPayload = {
      event: flow.trigger.events?.[0] || "entry:create",
      collection: flow.trigger.collections?.[0] || "TestCollection",
      entryId: "test-entry-id",
      data: {
        title: "Sample Entry Title",
        status: "publish",
        author: "Test User",
        createdAt: new Date().toISOString(),
      },
      user: {
        email: "test@sveltycms.com",
        username: "testuser",
      },
      timestamp: new Date().toISOString(),
      tenantId: tenantId, // Added for multi-tenancy
    };

    const result = await automationService.executeFlow(flow, samplePayload);

    return json({
      success: true,
      data: {
        status: result.status,
        duration: result.duration,
        operationResults: result.operationResults,
      },
    });
  } catch (error) {
    logger.error(`Failed to test automation ${params.id} for tenant ${tenantId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Internal Server Error", 500, "AUTOMATION_TEST_FAILED");
  }
});
