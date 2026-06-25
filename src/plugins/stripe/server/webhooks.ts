/**
 * @file src/plugins/stripe/server/webhooks.ts
 * @description Stripe webhook handler for async payment events — uses upsert for idempotency.
 *
 * Handles: payment_intent.succeeded, payment_intent.payment_failed
 * Uses dbAdapter.crud.upsert to safely handle duplicate webhook deliveries.
 */

import type { IDBAdapter } from "@databases/db-interface";
import { getStripe } from "./stripe";

interface WebhookEvent {
  type: string;
  data: {
    object: {
      id: string;
      status: string;
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
    };
  };
}

/**
 * Verify and process an incoming Stripe webhook event.
 * Uses upsert for idempotent delivery — safe against duplicate webhooks.
 * Returns true if the event was processed successfully.
 */
export async function handleStripeWebhook(
  payload: string,
  signature: string,
  tenantId = "default",
  dbAdapter: IDBAdapter,
): Promise<{ received: boolean; error?: string }> {
  try {
    const stripe = await getStripe(tenantId);

    // Get webhook secret from plugin config
    const { pluginRegistry } = await import("@src/plugins/registry");
    const pluginState = await pluginRegistry.getPluginState("stripe", tenantId);
    const webhookSecret =
      (pluginState?.settings as any)?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || "";

    if (!webhookSecret) {
      return { received: false, error: "Webhook secret not configured" };
    }

    // Verify signature
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret) as WebhookEvent;

    const intent = event.data.object;
    const status = event.type === "payment_intent.succeeded" ? "succeeded" : "failed";
    const now = new Date().toISOString();

    // Use upsert for idempotent webhook handling
    await dbAdapter.crud.upsert("plugin_stripe_payments", {
      where: { stripeIntentId: intent.id },
      create: {
        _id: `stripe_${intent.id}`,
        stripeIntentId: intent.id,
        status,
        amount: intent.amount,
        currency: intent.currency,
        metadata: intent.metadata || {},
        createdAt: now,
        updatedAt: now,
        tenantId,
      },
      update: {
        status,
        amount: intent.amount,
        currency: intent.currency,
        metadata: intent.metadata || {},
        updatedAt: now,
      },
    });

    return { received: true };
  } catch (err: any) {
    return {
      received: false,
      error: err.message,
    };
  }
}
