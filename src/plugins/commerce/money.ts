/**
 * @file src/plugins/commerce/money.ts
 * @description Convert preset number fields (major units) ↔ integer cents.
 */

import { fractionDigits, money, roundForCurrency } from "@src/services/commerce/price";
import type { Price } from "@src/services/commerce/types";

export function majorToPrice(major: unknown, currency: string): Price {
  const n = typeof major === "number" ? major : Number(major);
  if (!Number.isFinite(n)) return money(0, currency);
  return roundForCurrency(n, currency);
}

export function priceToMajor(price: Price): number {
  const digits = fractionDigits(price.currency);
  return price.amount / 10 ** digits;
}

export function displayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of ["en", "de", "default", "title", "name"]) {
      if (typeof rec[key] === "string" && rec[key].trim()) return rec[key] as string;
    }
  }
  return "";
}
