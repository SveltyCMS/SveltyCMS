/**
 * @file src/routes/(site)/shop/+page.server.ts
 * @description Public product list. Published entries only. Tenant from locals — never a query param.
 */

import { getDb } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { pluginRegistry } from "@src/plugins/registry";
import { requireCommerceTenantId } from "@src/plugins/commerce/tenant";
import { createCommerceStore } from "@src/plugins/commerce/store";
import { displayText } from "@src/plugins/commerce/money";
import { commerceLegalFor } from "@src/plugins/commerce/storefront.server";
import { consumerCopy } from "@src/plugins/commerce/consumer-copy";
import { lowestPriorPrice30Days } from "@src/plugins/commerce/vat";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const tenantId = requireCommerceTenantId(locals.tenantId as string | null);
  const state = await pluginRegistry.getPluginState("commerce", String(tenantId));
  const enabled = state ? state.enabled : pluginRegistry.get("commerce")?.metadata?.enabled;
  if (!enabled) return { enabled: false, products: [] };

  const adapter = locals.dbAdapter || getDb();
  if (!adapter) return { enabled: true, products: [] };
  const cms = new LocalCMS(adapter);
  const store = createCommerceStore(cms, tenantId);
  if (!(await store.hasCollection("products"))) return { enabled: true, products: [] };

  const legalState = await commerceLegalFor(String(tenantId));
  const copy = consumerCopy(legalState.legal);
  const rows = await store.findMany("products", {}, { limit: 48, publicationFilter: "published" });
  return {
    enabled: true,
    currency: legalState.legal.currency,
    vatLabel: copy.vatIncluded,
    labels: {
      impressum: copy.impressum,
      privacy: copy.privacy,
      terms: copy.terms,
      withdraw: copy.withdraw,
    },
    products: rows.map((row) => {
      const price = Number(row.price ?? 0);
      const qty = Number(row.inventory ?? row.inventoryQty ?? 0);
      const threshold = Number(row.lowStockThreshold ?? 5);
      const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
      const history = Array.isArray(row.priceHistory)
        ? row.priceHistory.flatMap((point) => {
            if (!point || typeof point !== "object") return [];
            const rec = point as Record<string, unknown>;
            const amount = Number(rec.amount);
            const at = String(rec.recordedAt || "");
            return Number.isFinite(amount) && at ? [{ amount, at }] : [];
          })
        : [];
      const prior = lowestPriorPrice30Days(price, history);
      const badges: string[] = [];
      if (prior != null) badges.push("Sale");
      if (tags.some((t) => t.toLowerCase() === "featured")) badges.push("Featured");
      if (qty <= 0) badges.push("Out of stock");
      else if (qty <= threshold) badges.push("Low stock");
      return {
        id: String(row._id ?? ""),
        title: displayText(row.title) || displayText(row.name) || "Untitled",
        slug: String(row.slug || row._id || ""),
        price,
        sku: String(row.sku ?? ""),
        badges,
        priorPriceLabel:
          prior != null ? copy.priorPrice(prior.toFixed(2), legalState.legal.currency) : "",
      };
    }),
  };
};
