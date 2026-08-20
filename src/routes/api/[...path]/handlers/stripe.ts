/**
 * @file src/routes/api/[...path]/handlers/stripe.ts
 * @description Public Stripe webhook + publishable config. Tenant from
 * intent metadata or locals — never from a client body field.
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";
import { AppError, isAppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { pluginRegistry } from "@src/plugins/registry";
import { requireCommerceTenantId } from "@src/plugins/commerce/tenant";
import { successResponse } from "./base";

export async function handleStripeRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  try {
    const action = (segments[1] || "").toLowerCase();
    const scoped = requireCommerceTenantId(tenantId);

    if (action === "config" && event.request.method === "GET") {
      const state = await pluginRegistry.getPluginState("stripe", String(scoped));
      const publishableKey =
        (state?.settings as { publishableKey?: string } | undefined)?.publishableKey || "";
      return successResponse(event, { publishableKey });
    }

    if (action === "webhook" && event.request.method === "POST") {
      const signature = event.request.headers.get("stripe-signature") || "";
      const payload = await event.request.text();
      const { handleStripeWebhook } = await import("@src/plugins/stripe/server/webhooks");
      const adapter = cms.db;
      const result = await handleStripeWebhook(payload, signature, String(scoped), adapter);
      if (!result.received) {
        raise(400, result.error || "Webhook rejected.", "WEBHOOK_REJECTED");
      }
      return successResponse(event, { received: true });
    }

    raise(404, `Unknown stripe action '${action}'.`, "NOT_FOUND");
  } catch (err: unknown) {
    rethrow(err);
    if (!isAppError(err)) logger.error("[Stripe] route failed", err);
    if (isAppError(err)) throw err;
    throw new AppError((err as Error).message || "Stripe operation failed", 500);
  }
}
