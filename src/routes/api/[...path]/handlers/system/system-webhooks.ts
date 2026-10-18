/**
 * @file src/routes/api/[...path]/handlers/system/system-webhooks.ts
 * @description Webhook CRUD, testing, and audit routes for the system dispatcher.
 */

import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, validateRequestBody } from "../base";
import { webhookService, type Webhook } from "@src/services/background/webhook-service";
import { array, boolean, object, optional, record, string } from "valibot";

const SaveWebhookSchema = object({
  id: optional(string()),
  name: optional(string()),
  url: optional(string()),
  events: optional(array(string())),
  event: optional(string()),
  active: optional(boolean()),
  secret: optional(string()),
  headers: optional(record(string(), string())),
});

async function auditWebhookChange(
  event: RequestEvent,
  tenantId: DatabaseId,
  action: "create" | "update" | "delete",
  saved?: unknown,
  webhookId?: string,
): Promise<void> {
  try {
    const user = event.locals.user;
    // Record even without a session: a programmatic/system webhook change must
    // still leave a trail, attributed to `system`.
    const actorId = (user?._id ?? "system") as DatabaseId;
    let ip: string | undefined;
    try {
      ip = event.getClientAddress();
    } catch {
      ip = undefined;
    }
    const savedId =
      saved && typeof saved === "object" && "id" in saved
        ? String((saved as { id?: unknown }).id ?? "")
        : "";
    const id = savedId || webhookId || null;
    const eventType =
      action === "create"
        ? AuditEventType.WEBHOOK_CREATED
        : action === "update"
          ? AuditEventType.WEBHOOK_UPDATED
          : AuditEventType.WEBHOOK_DELETED;
    await auditLogService.log(
      `webhook:${action}`,
      {
        id: actorId,
        email: user?.email || "",
        role: typeof user?.role === "string" ? user.role : undefined,
        ip,
      },
      { type: "webhook", id: id as DatabaseId },
      eventType,
      "low",
      { webhookId: id },
      tenantId,
    );
  } catch (err) {
    logger.warn(`[Webhook] Audit log failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * --- WEBHOOKS ---
 */
export async function handleWebhookRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin-only for all webhook operations
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (!user.isAdmin && user.role !== "admin" && user.role !== "super-admin") {
    throw new AppError("Admin access required for webhook management", 403, "FORBIDDEN");
  }

  const isDirect = segments[0] === "webhooks" || segments[0] === "system-webhooks";
  const webhookId = isDirect ? segments[1] : segments[2];
  const subAction = isDirect ? segments[2] : segments[3];

  if (!webhookId) {
    if (request.method === "GET")
      return successResponse(event, await webhookService.getWebhooks(tenantId as string));
    if (request.method === "POST") {
      const body = await validateRequestBody(event, SaveWebhookSchema);
      const saved = await webhookService.saveWebhook(
        body as unknown as Partial<Webhook>,
        tenantId as string,
      );
      await auditWebhookChange(event, tenantId, "create", saved);
      return successResponse(event, saved, 201);
    }
  } else {
    const webhooks = await webhookService.getWebhooks(tenantId as string);
    const exists = webhooks.some((w: any) => w.id === webhookId);
    if (!exists) throw new AppError(`Webhook ${webhookId} not found`, 404);

    if (subAction === "test" && request.method === "POST")
      return successResponse(event, {
        success: await webhookService.testWebhook(
          webhookId,
          user?.email || "system@sveltycms.com",
          tenantId as string,
        ),
      });

    if (request.method === "PATCH" || request.method === "PUT") {
      const body = await validateRequestBody(event, SaveWebhookSchema);
      const saved = await webhookService.saveWebhook(
        { ...body, id: webhookId } as unknown as Partial<Webhook>,
        tenantId as string,
      );
      await auditWebhookChange(event, tenantId, "update", saved, webhookId);
      return successResponse(event, saved);
    }
    if (request.method === "DELETE") {
      await webhookService.deleteWebhook(webhookId, tenantId as string);
      await auditWebhookChange(event, tenantId, "delete", undefined, webhookId);
      return successResponse(event, { success: true });
    }

    if (request.method === "GET") {
      const webhooks = await webhookService.getWebhooks(tenantId as string);
      return successResponse(
        event,
        webhooks.find((w) => w.id === webhookId),
      );
    }

    throw new AppError(`Method ${request.method} not allowed for Webhooks`, 405);
  }
}
