/**
 * @file src/routes/api/system/webhooks/[id]/test/+server.ts
 * @description API endpoint for testing a specific webhook.
 */

import { webhookService } from "@src/services/webhook-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const POST = apiHandler(async ({ params, locals }) => {
  const { id } = params;
  const { user, tenantId } = locals;

  if (!id) throw new AppError("Webhook ID is required", 400);
  if (!user) throw new AppError("Authentication required", 401);

  const webhooks = await webhookService.getWebhooks(tenantId || "");
  const webhook = webhooks.find((w) => w.id === id);

  if (!webhook) {
    throw new AppError("Webhook not found", 404);
  }

  await webhookService.testWebhook(id, user.email, tenantId || "");

  return json({ success: true, message: "Test event dispatched" });
});
