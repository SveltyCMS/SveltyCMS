/**
 * @file src/plugins/stripe/server/webhooks.ts
 * @description Stripe webhook handler for async payment events — uses upsert for idempotency.
 *
 * Handles: payment_intent.succeeded, payment_intent.payment_failed
 * Uses dbAdapter.crud.upsert to safely handle duplicate webhook deliveries.
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
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

    // Use findOne + insert/update for idempotent webhook handling
    const existing = await dbAdapter.crud.findOne("plugin_stripe_payments", {
      stripeIntentId: intent.id,
    } as Record<string, unknown>);

    if (existing?.success && existing.data) {
      await dbAdapter.crud.update(
        "plugin_stripe_payments",
        (existing.data as { _id: DatabaseId })._id,
        {
          status,
          amount: intent.amount,
          currency: intent.currency,
          metadata: intent.metadata || {},
          updatedAt: now,
        } as Record<string, unknown>,
      );
    } else {
      await dbAdapter.crud.insert("plugin_stripe_payments", {
        _id: `stripe_${intent.id}`,
        stripeIntentId: intent.id,
        status,
        amount: intent.amount,
        currency: intent.currency,
        metadata: intent.metadata || {},
        createdAt: now,
        updatedAt: now,
        tenantId: tenantId as DatabaseId,
      } as Record<string, unknown>);
    }

    return { received: true };
  } catch (err: any) {
    return {
      received: false,
      error: err.message,
    };
  }
}
