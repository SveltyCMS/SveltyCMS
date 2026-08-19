/**
 * @file src/services/commerce/types.ts
 * @description Shared commerce value types. OrderStatus matches the ecommerce
 * preset options in `src/routes/setup/presets.ts` exactly.
 *
 * ### Features:
 * - integer-cent Price
 * - Adjustment / PriceBreakdown for the totals pipeline
 * - OrderStatus union (`pending|processing|shipped|delivered|cancelled|refunded`)
 */

export interface Price {
  /** Integer minor units (cents for EUR/USD; yen for JPY). */
  amount: number;
  currency: string;
}

export type AdjustmentType = "promotion" | "fee" | "shipping" | "tax";

export interface Adjustment {
  type: AdjustmentType;
  label: string;
  /** Lower weight applies first. */
  weight: number;
  amount: Price;
  itemId?: string;
}

export interface PriceBreakdown {
  subtotal: Price;
  adjustments: Adjustment[];
  grandTotal: Price;
}

/** Preset `orders.status` options. Map paid → processing, fulfilled → shipped. */
export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export class CurrencyMismatchError extends Error {
  readonly code = "CURRENCY_MISMATCH";
  constructor(left: string, right: string) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = "CurrencyMismatchError";
  }
}
