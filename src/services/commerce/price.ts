/**
 * @file src/services/commerce/price.ts
 * @description Integer-cent Price calculator. Pure functions — no DB I/O.
 * Lookups belong in callers so `computeTotals` can stay < 5 ms.
 *
 * ### Features:
 * - add / subtract / multiply / divide / compare
 * - per-currency rounding (JPY 0 dp, CHF/EUR/USD 2 dp)
 * - CurrencyMismatchError on mixed currencies
 */

import { CurrencyMismatchError, type Price } from "./types";

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP"]);

export function money(amount: number, currency: string): Price {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new TypeError("Price.amount must be a finite integer of minor units");
  }
  return { amount, currency: currency.toUpperCase() };
}

export function assertSameCurrency(a: Price, b: Price): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Price, b: Price): Price {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Price, b: Price): Price {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function multiply(price: Price, factor: number): Price {
  if (!Number.isFinite(factor)) {
    throw new TypeError("multiply factor must be finite");
  }
  return money(Math.round(price.amount * factor), price.currency);
}

export function divide(price: Price, divisor: number): Price {
  if (!Number.isFinite(divisor) || divisor === 0) {
    throw new TypeError("divide divisor must be a non-zero finite number");
  }
  return money(Math.round(price.amount / divisor), price.currency);
}

export function compare(a: Price, b: Price): number {
  assertSameCurrency(a, b);
  return a.amount - b.amount;
}

export function fractionDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** Round a major-unit number into integer minor units for `currency`. */
export function roundForCurrency(majorUnits: number, currency: string): Price {
  const digits = fractionDigits(currency);
  const scale = 10 ** digits;
  return money(Math.round(majorUnits * scale), currency);
}

export function sum(prices: Price[], currency: string): Price {
  return prices.reduce((acc, next) => add(acc, next), money(0, currency));
}
