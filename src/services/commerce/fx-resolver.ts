/**
 * @file src/services/commerce/fx-resolver.ts
 * @description Real-time currency exchange (FX) resolver with caching and cross-rate calculation.
 * Converts integer-cent Price models across world currencies with deterministic fractional rounding.
 *
 * ### Features:
 * - In-memory rate caching with configurable TTL (default 1 hour)
 * - Deterministic fallback rates for major global currencies (EUR, USD, GBP, JPY, CHF, CAD, AUD)
 * - Base-currency normalized cross-rate conversions with zero rounding drift
 * - Pluggable rate provider support for external APIs or DB-backed rate sources
 */

import { fractionDigits, roundForCurrency } from "./price";
import type { Price } from "./types";

export interface FxRateProvider {
  /** Fetches exchange rates relative to a given base currency. */
  fetchRates(baseCurrency: string): Promise<Record<string, number>> | Record<string, number>;
}

export interface FxResolverOptions {
  /** Base currency for cached rates. Default "EUR". */
  baseCurrency?: string;
  /** Cache time-to-live in milliseconds. Default 3,600,000 ms (1 hour). */
  cacheTtlMs?: number;
  /** Optional custom rate provider. */
  provider?: FxRateProvider;
}

/** Fallback exchange rates benchmarked against EUR (Base: EUR = 1.0). */
export const DEFAULT_EUR_RATES: Readonly<Record<string, number>> = Object.freeze({
  EUR: 1.0,
  USD: 1.085,
  GBP: 0.855,
  JPY: 165.2,
  CHF: 0.965,
  CAD: 1.485,
  AUD: 1.662,
  CNY: 7.85,
  INR: 90.45,
  BRL: 5.62,
  KRW: 1475.0,
});

interface CacheEntry {
  rates: Record<string, number>;
  expiresAt: number;
}

export class FxResolver {
  private readonly baseCurrency: string;
  private readonly cacheTtlMs: number;
  private readonly provider?: FxRateProvider;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(options: FxResolverOptions = {}) {
    this.baseCurrency = (options.baseCurrency ?? "EUR").toUpperCase();
    this.cacheTtlMs = options.cacheTtlMs ?? 3_600_000;
    this.provider = options.provider;
  }

  /**
   * Retrieves exchange rates relative to the requested base currency.
   * Uses in-memory cache if valid; otherwise queries provider or falls back to built-in rates.
   */
  async getExchangeRates(
    baseCurrency: string = this.baseCurrency,
  ): Promise<Record<string, number>> {
    const base = baseCurrency.toUpperCase();
    const now = Date.now();
    const cached = this.cache.get(base);

    if (cached && cached.expiresAt > now) {
      return { ...cached.rates };
    }

    let rates: Record<string, number> = {};

    if (this.provider) {
      try {
        const fetched = await this.provider.fetchRates(base);
        if (fetched && typeof fetched === "object" && Object.keys(fetched).length > 0) {
          rates = { ...fetched };
        }
      } catch {
        // Fall back gracefully if external provider fails
      }
    }

    if (Object.keys(rates).length === 0) {
      rates = this.computeFallbackRates(base);
    }

    // Ensure base currency itself is always 1.0
    rates[base] = 1.0;

    this.cache.set(base, {
      rates,
      expiresAt: now + this.cacheTtlMs,
    });

    return { ...rates };
  }

  /** Synchronous rate resolution using cached or fallback rates for instant hot-path execution. */
  getExchangeRatesSync(baseCurrency: string = this.baseCurrency): Record<string, number> {
    const base = baseCurrency.toUpperCase();
    const now = Date.now();
    const cached = this.cache.get(base);

    if (cached && cached.expiresAt > now) {
      return { ...cached.rates };
    }

    const rates = this.computeFallbackRates(base);
    rates[base] = 1.0;

    this.cache.set(base, {
      rates,
      expiresAt: now + this.cacheTtlMs,
    });

    return { ...rates };
  }

  /**
   * Converts a Price to a target currency using provided or cached rates.
   */
  convertPrice(price: Price, targetCurrency: string, rates?: Record<string, number>): Price {
    const from = price.currency.toUpperCase();
    const to = targetCurrency.toUpperCase();

    if (from === to) {
      return { ...price, currency: to };
    }

    const activeRates = rates ?? this.getExchangeRatesSync(this.baseCurrency);
    const rateFrom = activeRates[from];
    const rateTo = activeRates[to];

    if (!rateFrom || rateFrom <= 0) {
      throw new Error(`FX rate missing or invalid for source currency: ${from}`);
    }
    if (!rateTo || rateTo <= 0) {
      throw new Error(`FX rate missing or invalid for target currency: ${to}`);
    }

    // Convert from source minor units to major units
    const fromDigits = fractionDigits(from);
    const sourceMajor = price.amount / 10 ** fromDigits;

    // Cross-currency conversion via base:
    // (sourceMajor / rateFrom) yields amount in base currency
    // amount in base * rateTo yields amount in target currency
    const targetMajor = (sourceMajor / rateFrom) * rateTo;

    return roundForCurrency(targetMajor, to);
  }

  /** Invalidates cache for a specific or all currencies. */
  clearCache(baseCurrency?: string): void {
    if (baseCurrency) {
      this.cache.delete(baseCurrency.toUpperCase());
    } else {
      this.cache.clear();
    }
  }

  /** Derives cross-rates from the EUR default benchmark table. */
  private computeFallbackRates(targetBase: string): Record<string, number> {
    const baseRateInEur = DEFAULT_EUR_RATES[targetBase] ?? 1.0;
    const computed: Record<string, number> = {};

    for (const [curr, rateInEur] of Object.entries(DEFAULT_EUR_RATES)) {
      computed[curr] = Number((rateInEur / baseRateInEur).toFixed(6));
    }

    return computed;
  }
}

/** Global default singleton resolver with EUR base. */
export const defaultFxResolver = new FxResolver();
