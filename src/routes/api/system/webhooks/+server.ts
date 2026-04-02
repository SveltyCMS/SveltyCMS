/**
 * @file src/routes/api/system/webhooks/+server.ts
 * @description Handles GET (list) and POST (create) requests for webhooks with strict tenant isolation.
 */

import { webhookService } from "@src/services/webhook-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";

// GET: List all webhooks for a tenant
export const GET = apiHandler(async ({ locals, url }) => {
  const { user, tenantId } = locals;
  const userRole = user?.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!user || (!isAdmin && !isSuperAdmin)) {
    throw new AppError("Unauthorized", 403, "FORBIDDEN");
  }

  const targetTenantId = url.searchParams.get("tenantId") || tenantId || "";

  if (targetTenantId !== tenantId && !isSuperAdmin) {
    throw new AppError("Unauthorized: Tenant mismatch", 403, "TENANT_MISMATCH");
  }

  try {
    const webhooks = await webhookService.getWebhooks(targetTenantId);
    return json({ success: true, data: webhooks });
  } catch (error) {
    logger.error(`Failed to list webhooks:`, error);
    throw new AppError("Internal Server Error", 500, "WEBHOOK_LIST_FAILED");
  }
});

// POST: Create a new webhook
export const POST = apiHandler(async ({ request, locals }) => {
  const { user, tenantId } = locals;
  const userRole = user?.role;
  const isSuperAdmin = userRole === "super-admin";
  const isAdmin = userRole === "admin" || isSuperAdmin;

  if (!user || (!isAdmin && !isSuperAdmin)) {
    throw new AppError("Unauthorized", 403, "FORBIDDEN");
  }

  try {
    const data = await request.json();
    if (!(data.url && data.events && Array.isArray(data.events))) {
      throw new AppError("Invalid webhook data", 400, "INVALID_DATA");
    }

    const webhook = await webhookService.saveWebhook(data, tenantId || "");
    return json({ success: true, data: webhook });
  } catch (error) {
    logger.error(`Failed to create webhook:`, error);
    throw new AppError("Internal Server Error", 500, "WEBHOOK_CREATE_FAILED");
  }
});
