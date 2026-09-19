/**
 * @file src/plugins/commerce/analytics.ts
 * @description Order aggregates for Commerce Pro dashboard / API. Tenant-scoped.
 *
 * Aggregation reads the order history through the SDK streaming path
 * (`findStreaming` → `crud.streamMany`), which is deliberately NOT clamped by the
 * public `MAX_PAGE_SIZE` ceiling — routing the aggregate through the paged `find`
 * funnel silently truncated it to the first 200 orders.
 *
 * ### Features:
 * - gross / refunds / net / AOV from cents (integer math)
 * - paginated stream above the public page-size cap
 */

import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";
import type { CommerceRow } from "./store";

/** Internal aggregation budget — independent of, and above, the public page cap. */
const ANALYTICS_ORDER_LIMIT = 500;

export async function orderAnalytics(cms: LocalCMS, tenantId: DatabaseId) {
  const stream = await cms.collections.findStreaming("orders", {
    tenantId,
    system: true,
    publicationFilter: "all",
    limit: ANALYTICS_ORDER_LIMIT,
  });

  let grossCents = 0;
  let refundCents = 0;
  let paid = 0;
  let count = 0;
  for await (const order of stream as AsyncIterable<CommerceRow>) {
    const cents = Number(order.totalCents ?? 0);
    const status = String(order.status || "");
    if (status !== "cancelled") count += 1;
    if (status === "refunded") refundCents += cents;
    else if (status !== "cancelled") {
      grossCents += cents;
      if (status === "processing" || status === "shipped" || status === "delivered") paid += 1;
    }
  }
  return {
    orderCount: count,
    paidCount: paid,
    gross: grossCents / 100,
    refunds: refundCents / 100,
    net: (grossCents - refundCents) / 100,
    averageOrderValue: count ? grossCents / count / 100 : 0,
  };
}
