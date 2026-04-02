/**
 * @file src/routes/api/system/webhooks/logs/+server.ts
 * @description API endpoint for fetching webhook execution logs.
 */

import { webhookService } from "@src/services/webhook-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";

export const GET = apiHandler(async ({ url, locals }) => {
  const { tenantId } = locals;
  const webhookId = url.searchParams.get("webhookId");
  const limit = Number(url.searchParams.get("limit") || 50);

  // If webhookId is provided, get logs for that webhook, otherwise get all logs for tenant
  const logs = await (webhookId
    ? webhookService.getWebhookLogs(webhookId, tenantId || "")
    : webhookService.getTenantLogs(tenantId || "", limit));

  return json({ success: true, data: logs });
});
