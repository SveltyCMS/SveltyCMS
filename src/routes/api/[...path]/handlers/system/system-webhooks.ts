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
import { requireAdminUser } from "./system-shared";
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
  const { request } = event;
  // 🛡️ SECURITY: Admin-only for all webhook operations (401 before 403).
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  const user = requireAdminUser(event, "Admin access required for webhook management");

  const isDirect = segments[0] === "webhooks" || segments[0] === "system-webhooks";
  const baseIndex = isDirect ? 1 : 2;
  const webhookId = segments[baseIndex];
  const subAction = segments[baseIndex + 1];

  // 📋 DELIVERY LOGS: `logs` is a sub-collection of the webhook namespace, not a
  // webhook id. It must be handled BEFORE the id lookup below — that lookup used
  // to throw `Webhook logs not found` (404) for a normal, often empty list.
  if (webhookId === "logs") {
    const logId = segments[baseIndex + 1];
    const logAction = segments[baseIndex + 2];

    if (request.method === "GET" && !logId) {
      const limitParam = Number.parseInt(event.url.searchParams.get("limit") ?? "", 10);
      return successResponse(
        event,
        await webhookService.getTenantLogs(tenantId as string, {
          limit: Number.isFinite(limitParam) ? limitParam : undefined,
          status: event.url.searchParams.get("status") ?? undefined,
        }),
      );
    }

    if (request.method === "POST" && logId && logAction === "retry") {
      try {
        await webhookService.retryDelivery(logId, tenantId as string);
      } catch (err) {
        throw new AppError(err instanceof Error ? err.message : "Retry failed", 404);
      }
      return successResponse(event, { success: true });
    }

    throw new AppError(`Method ${request.method} not allowed for webhook logs`, 405);
  }

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
