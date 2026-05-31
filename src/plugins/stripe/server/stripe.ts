/**
 * @file src/plugins/stripe/server/stripe.ts
 * @description Stripe SDK client singleton with tenant-aware API key resolution.
 * Uses dynamic import so the `stripe` package is optional (only needed when plugin is enabled).
 */

import { pluginRegistry } from "@src/plugins/registry";

const stripeInstances = new Map<string, any>();

export async function getStripe(tenantId = "default"): Promise<any> {
  const cacheKey = `stripe-${tenantId}`;
  if (stripeInstances.has(cacheKey)) return stripeInstances.get(cacheKey)!;

  const pluginState = await pluginRegistry.getPluginState("stripe", tenantId);
  const secretKey =
    (pluginState?.settings as any)?.secretKey ||
    process.env.STRIPE_SECRET_KEY ||
    "";

  if (!secretKey) {
    throw new Error(
      `Stripe secret key not configured for tenant "${tenantId}".`,
    );
  }

  // @ts-ignore — stripe package is optional, only needed when plugin is enabled
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-03-31.basil" as any,
    typescript: true,
  });

  stripeInstances.set(cacheKey, stripe);
  return stripe;
}

export function clearStripeCache(tenantId = "default"): void {
  stripeInstances.delete(`stripe-${tenantId}`);
}
