/**
 * @file tests/unit/plugins/commerce-fulfillment.test.ts
 * @description Paid UPS/FedEx/DHL + TaxJar plugins: live quote when licensed,
 * table-rate fallback when the add-on is off.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@src/services/commerce/price";
import type { CartView } from "@src/plugins/commerce/cart-service";
import { quoteCart } from "@src/plugins/commerce/quotes";
import type { CommerceStore } from "@src/plugins/commerce/store";
import {
  registerShippingRateProvider,
  registerTaxProvider,
  resetFulfillmentProviders,
  type FulfillmentQuoteContext,
} from "@src/plugins/commerce/fulfillment";
import { createShippingLiveProvider } from "@src/plugins/shipping-live/providers";
import { createTaxjarProvider } from "@src/plugins/taxjar/provider";

function memoryStore(tenantId: string): CommerceStore {
  const rows = new Map<string, any[]>([
    ["coupons", []],
    [
      "tax_rates",
      [{ country: "DE", state: "", rate: 19, label: "VAT", shippingTaxable: true, tenantId }],
    ],
    [
      "shipping_zones",
      [{ name: "DE table", countries: "DE", rate: 5, freeThreshold: 0, tenantId }],
    ],
  ]);
  const scoped = (collection: string, filter: Record<string, unknown>) =>
    (rows.get(collection) || []).filter((row) =>
      Object.entries(filter).every(([k, v]) => String(row[k]) === String(v)),
    );
  return {
    tenantId: tenantId as any,
    async hasCollection() {
      return true;
    },
    async findOne(collection, filter) {
      return scoped(collection, { ...filter, tenantId })[0] ?? null;
    },
    async findMany(collection, filter) {
      return scoped(collection, { ...filter, tenantId });
    },
    async create() {
      return {};
    },
    async update() {},
    async delete() {},
  };
}

const cart: CartView = {
  id: "c1",
  sessionId: "s",
  customer: null,
  items: [
    {
      productId: "p",
      title: "Tee",
      sku: "SKU",
      qty: 1,
      unitAmount: 1000,
      currency: "EUR",
    },
  ],
  subtotal: 10,
  currency: "EUR",
  appliedCoupon: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const ctx: FulfillmentQuoteContext = {
  tenantId: "t1",
  country: "DE",
  currency: "EUR",
  subtotal: money(1000, "EUR"),
};

describe("paid fulfillment plugins", () => {
  beforeEach(() => {
    resetFulfillmentProviders();
  });

  it("falls back to shipping_zones / tax_rates when no live plugin is ready", async () => {
    const breakdown = await quoteCart(memoryStore("t1"), cart, { country: "DE" });
    const types = breakdown.adjustments.map((a) => a.type);
    expect(types).toContain("shipping");
    expect(types).toContain("tax");
    expect(breakdown.adjustments.find((a) => a.type === "shipping")?.label).toBe("DE table");
  });

  it("uses a registered live shipping provider instead of table rates", async () => {
    registerShippingRateProvider({
      id: "mock-ship",
      pluginId: "shipping-live",
      async quote() {
        return {
          type: "shipping",
          label: "UPS",
          weight: 20,
          amount: money(799, "EUR"),
        };
      },
    });
    const breakdown = await quoteCart(memoryStore("t1"), cart, { country: "DE" });
    const ship = breakdown.adjustments.find((a) => a.type === "shipping");
    expect(ship?.label).toBe("UPS");
    expect(ship?.amount.amount).toBe(799);
  });

  it("shipping-live returns null when unlicensed so table rates still apply", async () => {
    const isReady = vi.fn(async () => ({ ready: false, settings: {} }));
    const provider = createShippingLiveProvider(isReady);
    expect(await provider.quote(ctx)).toBeNull();
    registerShippingRateProvider(provider);
    const breakdown = await quoteCart(memoryStore("t1"), cart, { country: "DE" });
    expect(breakdown.adjustments.find((a) => a.type === "shipping")?.label).toBe("DE table");
  });

  it("shipping-live sandbox rate applies when the paid plugin is ready", async () => {
    const isReady = vi.fn(async () => ({
      ready: true,
      settings: { testRateCents: 1234, carrier: "dhl" },
    }));
    const adj = await createShippingLiveProvider(isReady).quote(ctx);
    expect(adj?.label).toBe("DHL");
    expect(adj?.amount.amount).toBe(1234);
  });

  it("taxjar sandbox rate applies when licensed; otherwise tax_rates", async () => {
    const off = createTaxjarProvider(async () => ({ ready: false, settings: {} }));
    expect(await off.quote(ctx, null)).toBeNull();

    const on = createTaxjarProvider(async () => ({
      ready: true,
      settings: { testRatePercent: 10, shippingTaxable: false },
    }));
    const adj = await on.quote(ctx, {
      type: "shipping",
      label: "UPS",
      weight: 20,
      amount: money(500, "EUR"),
    });
    expect(adj?.label).toBe("TaxJar");
    expect(adj?.amount.amount).toBe(100);

    registerTaxProvider(on);
    const breakdown = await quoteCart(memoryStore("t1"), cart, { country: "DE" });
    expect(breakdown.adjustments.find((a) => a.type === "tax")?.label).toBe("TaxJar");
  });
});
