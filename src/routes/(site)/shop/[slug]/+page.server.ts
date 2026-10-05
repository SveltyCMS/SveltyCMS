/**
 * @file src/routes/(site)/shop/[slug]/+page.server.ts
 * @description Published product detail. Drafts stay off this route.
 */

import { getDb } from "@src/databases/db";
import { raise } from "@utils/error-handling";
import { LocalCMS } from "@src/services/sdk";
import { pluginRegistry } from "@src/plugins/registry";
import { requireCommerceTenantId } from "@src/plugins/commerce/tenant";
import { createCommerceStore } from "@src/plugins/commerce/store";
import { displayText } from "@src/plugins/commerce/money";
import { commerceLegalFor } from "@src/plugins/commerce/storefront.server";
import { consumerCopy } from "@src/plugins/commerce/consumer-copy";
import { lowestPriorPrice30Days } from "@src/plugins/commerce/vat";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
  const tenantId = requireCommerceTenantId(locals.tenantId as string | null);
  const state = await pluginRegistry.getPluginState("commerce", String(tenantId));
  const enabled = state ? state.enabled : pluginRegistry.get("commerce")?.metadata?.enabled;
  if (!enabled) raise(404, "Store is not enabled");

  const adapter = locals.dbAdapter || getDb();
  if (!adapter) raise(503, "Store is unavailable");
  const cms = new LocalCMS(adapter);
  const store = createCommerceStore(cms, tenantId);
  const rows = await store.findMany(
    "products",
    { slug: params.slug },
    { limit: 1, publicationFilter: "published" },
  );
  const row = rows[0];
  if (!row) raise(404, "Product not found");

  const legalState = await commerceLegalFor(String(tenantId));
  const copy = consumerCopy(legalState.legal);
  const price = Number(row.price ?? 0);
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
  const description =
    typeof row.description === "string" ? row.description : displayText(row.description);

  return {
    currency: legalState.legal.currency,
    vatLabel: copy.vatIncluded,
    labels: {
      impressum: copy.impressum,
      privacy: copy.privacy,
      terms: copy.terms,
      withdraw: copy.withdraw,
    },
    product: {
      id: String(row._id ?? ""),
      title: displayText(row.title) || "Untitled",
      sku: String(row.sku ?? ""),
      price,
      summary: displayText(row.shortDescription),
      description,
      priorPriceLabel:
        prior != null ? copy.priorPrice(prior.toFixed(2), legalState.legal.currency) : "",
    },
  };
};
