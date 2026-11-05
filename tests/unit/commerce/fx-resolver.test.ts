/**
 * @file tests/unit/commerce/fx-resolver.test.ts
 * @description Unit tests for the real-time currency exchange (FX) resolver with caching.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EUR_RATES,
  defaultFxResolver,
  FxResolver,
  type FxRateProvider,
} from "@src/services/commerce/fx-resolver";
import { money } from "@src/services/commerce/price";

describe("FxResolver", () => {
  it("provides deterministic fallback rates benchmarked against EUR", async () => {
    const resolver = new FxResolver({ baseCurrency: "EUR" });
    const rates = await resolver.getExchangeRates("EUR");

    expect(rates.EUR).toBe(1.0);
    expect(rates.USD).toBe(DEFAULT_EUR_RATES.USD);
    expect(rates.GBP).toBe(DEFAULT_EUR_RATES.GBP);
    expect(rates.JPY).toBe(DEFAULT_EUR_RATES.JPY);
  });

  it("calculates cross-rates when base is USD", async () => {
    const resolver = new FxResolver({ baseCurrency: "USD" });
    const rates = await resolver.getExchangeRates("USD");

    expect(rates.USD).toBe(1.0);
    // EUR rate should be 1 / 1.085
    expect(rates.EUR).toBeCloseTo(1 / DEFAULT_EUR_RATES.USD, 4);
  });

  it("caches rates and avoids calling provider on cache hit", async () => {
    const fetchRates = vi.fn().mockResolvedValue({
      EUR: 1.0,
      USD: 1.1,
      GBP: 0.85,
    });
    const provider: FxRateProvider = { fetchRates };

    const resolver = new FxResolver({
      baseCurrency: "EUR",
      cacheTtlMs: 5000,
      provider,
    });

    const rates1 = await resolver.getExchangeRates("EUR");
    const rates2 = await resolver.getExchangeRates("EUR");

    expect(rates1.USD).toBe(1.1);
    expect(rates2.USD).toBe(1.1);
    expect(fetchRates).toHaveBeenCalledTimes(1);
  });

  it("falls back to default rates if provider rejects", async () => {
    const fetchRates = vi.fn().mockRejectedValue(new Error("Network timeout"));
    const provider: FxRateProvider = { fetchRates };

    const resolver = new FxResolver({ provider });
    const rates = await resolver.getExchangeRates("EUR");

    expect(rates.USD).toBe(DEFAULT_EUR_RATES.USD);
    expect(fetchRates).toHaveBeenCalledTimes(1);
  });

  it("converts Price with correct fraction digits and rounding", () => {
    const resolver = new FxResolver();
    const rates = {
      EUR: 1.0,
      USD: 1.1,
      JPY: 160.0,
    };

    // 10.00 EUR (1000 cents) -> USD (10.00 * 1.1 = 11.00 USD = 1100 cents)
    const priceEur = money(1000, "EUR");
    const priceUsd = resolver.convertPrice(priceEur, "USD", rates);
    expect(priceUsd).toEqual({ amount: 1100, currency: "USD" });

    // 10.00 EUR -> JPY (10.00 * 160 = 1600 JPY, 0 fraction digits)
    const priceJpy = resolver.convertPrice(priceEur, "JPY", rates);
    expect(priceJpy).toEqual({ amount: 1600, currency: "JPY" });

    // Same currency conversion is a no-op
    expect(resolver.convertPrice(priceEur, "EUR", rates)).toEqual(priceEur);
  });

  it("converts cross-currency between non-base currencies (USD to JPY)", () => {
    const resolver = new FxResolver();
    const rates = {
      EUR: 1.0,
      USD: 1.1,
      JPY: 165.0,
    };

    // 11.00 USD (1100 cents)
    // In EUR: 11.00 / 1.1 = 10.00 EUR
    // In JPY: 10.00 * 165 = 1650 JPY
    const priceUsd = money(1100, "USD");
    const priceJpy = resolver.convertPrice(priceUsd, "JPY", rates);
    expect(priceJpy).toEqual({ amount: 1650, currency: "JPY" });
  });

  it("throws descriptive error when target or source currency rate is missing", () => {
    const resolver = new FxResolver();
    const rates = { EUR: 1.0, USD: 1.1 };

    const priceXyz = money(1000, "XYZ");
    expect(() => resolver.convertPrice(priceXyz, "USD", rates)).toThrow(
      "FX rate missing or invalid for source currency: XYZ",
    );

    const priceEur = money(1000, "EUR");
    expect(() => resolver.convertPrice(priceEur, "ABC", rates)).toThrow(
      "FX rate missing or invalid for target currency: ABC",
    );
  });

  it("allows clearing cache manually", async () => {
    const fetchRates = vi.fn().mockResolvedValue({ EUR: 1.0, USD: 1.2 });
    const provider: FxRateProvider = { fetchRates };
    const resolver = new FxResolver({ provider });

    await resolver.getExchangeRates("EUR");
    expect(fetchRates).toHaveBeenCalledTimes(1);

    resolver.clearCache("EUR");
    await resolver.getExchangeRates("EUR");
    expect(fetchRates).toHaveBeenCalledTimes(2);
  });

  it("works with default singleton defaultFxResolver", () => {
    const price = money(2000, "EUR");
    const converted = defaultFxResolver.convertPrice(price, "USD");
    expect(converted.currency).toBe("USD");
    expect(converted.amount).toBeGreaterThan(0);
  });
});
