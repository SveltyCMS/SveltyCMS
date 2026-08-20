/**
 * @file src/services/commerce/adjustment-engine.ts
 * @description Pure `computeTotals` — no DB I/O. Lookups happen in callers.
 *
 * Pipeline: subtotal → adjustments sorted by weight → grandTotal.
 * Idempotent: same inputs always produce the same breakdown.
 *
 * ### Features:
 * - order-level adjustments (coupon, shipping, tax)
 * - integer-cent math via Price helpers
 */

import { add, money } from "./price";
import type { Adjustment, Price, PriceBreakdown } from "./types";

export function computeTotals(subtotal: Price, adjustments: Adjustment[]): PriceBreakdown {
  const sorted = [...adjustments].sort((a, b) => a.weight - b.weight);
  let grand = subtotal;
  for (const adj of sorted) {
    grand = add(grand, adj.amount);
  }
  if (grand.amount < 0) {
    grand = money(0, grand.currency);
  }
  return { subtotal, adjustments: sorted, grandTotal: grand };
}
