/**
 * @file src/plugins/commerce/fulfillment.ts
 * @description Live shipping / tax ports. Table rates stay in Commerce;
 * UPS/FedEx/DHL and TaxJar register here as paid plugins (like Stripe).
 *
 * ### Features:
 * - ShippingRateProvider / TaxProvider registries
 * - first non-null quote wins, then quotes.ts falls back to preset tables
 * - guest checkout never 403s when a paid plugin is off or unlicensed
 */

import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import type { Adjustment, Price } from "@src/services/commerce/types";

export interface FulfillmentQuoteContext {
  tenantId: string;
  country?: string;
  state?: string;
  postal?: string;
  currency: string;
  subtotal: Price;
}

export interface ShippingRateProvider {
  readonly id: string;
  readonly pluginId: string;
  quote(ctx: FulfillmentQuoteContext): Promise<Adjustment | null>;
}

export interface TaxProvider {
  readonly id: string;
  readonly pluginId: string;
  quote(ctx: FulfillmentQuoteContext, shipping: Adjustment | null): Promise<Adjustment | null>;
}

const shippingProviders: ShippingRateProvider[] = [];
const taxProviders: TaxProvider[] = [];

export function registerShippingRateProvider(provider: ShippingRateProvider): void {
  const idx = shippingProviders.findIndex((row) => row.id === provider.id);
  if (idx >= 0) shippingProviders[idx] = provider;
  else shippingProviders.push(provider);
}

export function registerTaxProvider(provider: TaxProvider): void {
  const idx = taxProviders.findIndex((row) => row.id === provider.id);
  if (idx >= 0) taxProviders[idx] = provider;
  else taxProviders.push(provider);
}

export function resetFulfillmentProviders(): void {
  shippingProviders.length = 0;
  taxProviders.length = 0;
}

async function firstQuote<T>(
  providers: T[],
  run: (provider: T) => Promise<Adjustment | null>,
): Promise<Adjustment | null> {
  for (const provider of providers) {
    try {
      const adj = await run(provider);
      if (adj) return adj;
    } catch (err) {
      rethrow(err);
      logger.debug("[commerce] live fulfillment provider skipped", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

export async function quoteLiveShipping(ctx: FulfillmentQuoteContext): Promise<Adjustment | null> {
  return firstQuote(shippingProviders, (p) => p.quote(ctx));
}

export async function quoteLiveTax(
  ctx: FulfillmentQuoteContext,
  shipping: Adjustment | null,
): Promise<Adjustment | null> {
  return firstQuote(taxProviders, (p) => p.quote(ctx, shipping));
}

/**
 * Paid add-on is ready only when the plugin is enabled for the tenant AND
 * the marketplace license (or 14-day trial) is active. Unready → null quote
 * so guest checkout keeps using free table rates.
 */
export async function isFulfillmentPluginReady(
  pluginId: string,
  tenantId: string,
): Promise<{ ready: boolean; settings: Record<string, unknown> }> {
  const { pluginRegistry } = await import("@src/plugins/registry");
  const { checkExtensionLicense } = await import("@src/utils/license-manager");
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) return { ready: false, settings: {} };
  const state = await pluginRegistry.getPluginState(pluginId, String(tenantId));
  const enabled = state ? state.enabled : plugin.metadata.enabled;
  if (!enabled) return { ready: false, settings: {} };
  const license = await checkExtensionLicense("plugin", pluginId);
  if (!license.active && !license.hasLicense) return { ready: false, settings: {} };
  const settings = ((state as { settings?: Record<string, unknown> } | null)?.settings ??
    {}) as Record<string, unknown>;
  return { ready: true, settings };
}
