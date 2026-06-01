/**
 * @file src/plugins/stripe/server/webhooks.ts
 * @description Stripe webhook handler for async payment events.
 *
 * Handles: payment_intent.succeeded, payment_intent.payment_failed
 * Updates the plugin_stripe_payments collection with event data.
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

    // Handle payment events
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        await (dbAdapter.crud as any).insert("plugin_stripe_payments", {
          _id: `stripe_${intent.id}`,
          stripeIntentId: intent.id,
          status: "succeeded",
          amount: intent.amount,
          currency: intent.currency,
          metadata: intent.metadata || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        await (dbAdapter.crud as any).insert("plugin_stripe_payments", {
          _id: `stripe_${intent.id}`,
          stripeIntentId: intent.id,
          status: "failed",
          amount: intent.amount,
          currency: intent.currency,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;
      }
    }

    return { received: true };
  } catch (err: any) {
    return { received: false, error: err.message };
  }
}
