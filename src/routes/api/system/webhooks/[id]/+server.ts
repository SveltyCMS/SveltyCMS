/**
 * @file src/routes/api/system/webhooks/[id]/+server.ts
 * @description Handles GET (by ID), PATCH (update), and DELETE requests for individual webhooks.
 */

import { webhookService } from "@src/services/webhook-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ params, locals }) => {
  const { id } = params;
  const { tenantId } = locals;
  if (!id) throw new AppError("Webhook ID is required", 400);

  const webhooks = await webhookService.getWebhooks(tenantId || "");
  const webhook = webhooks.find((w) => w.id === id);
  if (!webhook) throw new AppError("Webhook not found", 404);

  return json({ success: true, data: webhook });
});

export const PATCH = apiHandler(async ({ params, request, locals }) => {
  const { id } = params;
  const { tenantId } = locals;
  if (!id) throw new AppError("Webhook ID is required", 400);

  // Check existence and tenant ownership
  const webhooks = await webhookService.getWebhooks(tenantId || "");
  const exists = webhooks.some((w) => w.id === id);
  if (!exists) throw new AppError("Webhook not found", 404);

  const updates = await request.json();
  const updated = await webhookService.saveWebhook({ ...updates, id }, tenantId || "");

  return json({ success: true, data: updated });
});

export const DELETE = apiHandler(async ({ params, locals }) => {
  const { id } = params;
  const { tenantId } = locals;
  if (!id) throw new AppError("Webhook ID is required", 400);

  // Check existence
  const webhooks = await webhookService.getWebhooks(tenantId || "");
  const exists = webhooks.some((w) => w.id === id);
  if (!exists) throw new AppError("Webhook not found", 404);

  await webhookService.deleteWebhook(id, tenantId || "");
  return new Response(null, { status: 200 }); // Test expects 200 for success
});
