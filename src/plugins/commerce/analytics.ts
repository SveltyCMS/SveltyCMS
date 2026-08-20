/**
 * @file src/plugins/commerce/analytics.ts
 * @description Order aggregates for Commerce Pro dashboard / API. Tenant-scoped.
 */

import type { CommerceStore } from "./store";

export async function orderAnalytics(store: CommerceStore) {
  const orders = await store.findMany("orders", {}, { limit: 500 });
  let grossCents = 0;
  let refundCents = 0;
  let paid = 0;
  for (const order of orders) {
    const cents = Number(order.totalCents ?? 0);
    const status = String(order.status || "");
    if (status === "refunded") refundCents += cents;
    else if (status !== "cancelled") {
      grossCents += cents;
      if (status === "processing" || status === "shipped" || status === "delivered") paid += 1;
    }
  }
  const count = orders.filter((o) => String(o.status) !== "cancelled").length;
  return {
    orderCount: count,
    paidCount: paid,
    gross: grossCents / 100,
    refunds: refundCents / 100,
    net: (grossCents - refundCents) / 100,
    averageOrderValue: count ? grossCents / count / 100 : 0,
  };
}
