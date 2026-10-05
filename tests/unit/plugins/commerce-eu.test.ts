/**
 * @file tests/unit/plugins/commerce-eu.test.ts
 * @description Gross-price VAT, 30-day reference price, and consumer withdrawal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@src/services/commerce/price";
import { computeTotals } from "@src/services/commerce/adjustment-engine";
import type { CartView } from "@src/plugins/commerce/cart-service";
import { assertTraderIdentity, readCommerceLegal } from "@src/plugins/commerce/legal";
import { consumerCopy } from "@src/plugins/commerce/consumer-copy";
import { declareWithdrawal } from "@src/plugins/commerce/withdrawal";
import { breakdownToMajors, quoteCart } from "@src/plugins/commerce/quotes";
import type { CommerceStore } from "@src/plugins/commerce/store";
import { resetFulfillmentProviders } from "@src/plugins/commerce/fulfillment";
import {
  lowestPriorPrice30Days,
  taxableGroups,
  vatFromGross,
  withdrawalDecision,
  withPriceHistory,
} from "@src/plugins/commerce/vat";
import { verifyEuVatId } from "@src/plugins/commerce/vies";
import { AppError } from "@utils/error-handling";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("@utils/egress-guard", () => ({
  safeFetch,
}));

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function quoteStore(): CommerceStore {
  const rows = new Map<string, Record<string, unknown>[]>([
    ["coupons", []],
    [
      "tax_rates",
      [
        {
          country: "DE",
          state: "",
          rate: 19,
          reducedRate: 7,
          label: "VAT",
          shippingTaxable: true,
          tenantId: "t1",
        },
      ],
    ],
    [
      "shipping_zones",
      [{ name: "DE table", countries: "DE", rate: 5, freeThreshold: 0, tenantId: "t1" }],
    ],
  ]);
  const scoped = (collection: string, filter: Record<string, unknown>) =>
    (rows.get(collection) || []).filter((row) =>
      Object.entries(filter).every(([key, value]) => String(row[key]) === String(value)),
    );
  return {
    tenantId: "t1" as never,
    async hasCollection() {
      return true;
    },
    async findOne(collection, filter) {
      return scoped(collection, { ...filter, tenantId: "t1" })[0] ?? null;
    },
    async findMany(collection, filter) {
      return scoped(collection, { ...filter, tenantId: "t1" });
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
      taxClass: "standard",
    },
  ],
  subtotal: 10,
  currency: "EUR",
  appliedCoupon: null,
  expiresAt: new Date(NOW + DAY).toISOString(),
};

describe("inclusive VAT", () => {
  beforeEach(() => {
    resetFulfillmentProviders();
  });

  it("extracts one VAT amount from goods plus taxable shipping", () => {
    const groups = taxableGroups({
      lines: [
        { gross: 1000, taxClass: "standard" },
        { gross: 500, taxClass: "standard" },
      ],
      discountCents: 0,
      shippingGross: 0,
      shippingTaxable: true,
      standardRate: 19,
      reducedRate: 7,
    });
    expect(groups).toEqual([{ rate: 19, gross: 1500 }]);
    expect(vatFromGross(1500, 19).vat).toBe(239);
  });

  it("keeps the gross total and lists the included VAT", async () => {
    const breakdown = await quoteCart(quoteStore(), cart, { country: "DE" });
    const tax = breakdown.adjustments.find((row) => row.type === "tax");
    expect(tax?.included).toBe(true);
    expect(tax?.amount.amount).toBe(239);
    expect(breakdown.grandTotal.amount).toBe(1500);
    expect(breakdown.taxKnown).toBe(true);
    const majors = breakdownToMajors(breakdown);
    expect(majors.grandTotal).toBe(15);
    expect(majors.net).toBeCloseTo(12.61, 2);
    expect(majors.tax).toBeCloseTo(2.39, 2);
  });

  it("leaves an unknown country untaxed for the caller to reject", async () => {
    const breakdown = await quoteCart(quoteStore(), cart, { country: "FR" });
    expect(breakdown.taxKnown).toBe(false);
    expect(breakdown.adjustments.some((row) => row.type === "tax")).toBe(false);
  });

  it("zeros VAT only when reverse charge is already decided", async () => {
    const breakdown = await quoteCart(
      quoteStore(),
      cart,
      { country: "FR" },
      { reverseCharge: true },
    );
    const tax = breakdown.adjustments.find((row) => row.type === "tax");
    expect(tax?.label).toBe("Reverse charge");
    expect(tax?.amount.amount).toBe(0);
    expect(tax?.included).toBe(true);
    expect(breakdown.grandTotal.amount).toBe(1000);
  });

  it("still adds a non-included tax adjustment", () => {
    const out = computeTotals(money(1999, "EUR"), [
      { type: "promotion", label: "10%", weight: 10, amount: money(-200, "EUR") },
      { type: "shipping", label: "ship", weight: 20, amount: money(450, "EUR") },
      { type: "tax", label: "vat", weight: 30, amount: money(380, "EUR"), included: false },
    ]);
    expect(out.grandTotal.amount).toBe(2629);
  });
});

describe("price history and withdrawal window", () => {
  it("announces a reduction only against a price inside 30 days", () => {
    const history = [
      { amount: 12, at: new Date(NOW - 20 * DAY).toISOString() },
      { amount: 8, at: new Date(NOW - 40 * DAY).toISOString() },
    ];
    expect(lowestPriorPrice30Days(10, history, NOW)).toBe(12);
    expect(lowestPriorPrice30Days(12, history, NOW)).toBeNull();
    expect(lowestPriorPrice30Days(10, [], NOW)).toBeNull();
  });

  it("appends the previous price when the product price changes", () => {
    const existing = {
      price: 12,
      priceChangedAt: "2026-09-01T00:00:00.000Z",
      priceHistory: [{ amount: 15, recordedAt: "2026-08-01T00:00:00.000Z" }],
    };
    const changed = withPriceHistory(existing, { price: 10 }, "2026-10-05T00:00:00.000Z");
    expect(changed.priceHistory).toEqual([
      { amount: 15, recordedAt: "2026-08-01T00:00:00.000Z" },
      { amount: 12, recordedAt: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(changed.priceChangedAt).toBe("2026-10-05T00:00:00.000Z");

    const same = withPriceHistory(existing, { price: 12 }, "2026-10-05T00:00:00.000Z");
    expect(same.priceHistory).toEqual(existing.priceHistory);
    expect(same.priceChangedAt).toBeUndefined();
  });

  it("keeps the withdrawal open, extended, waived, or closed", () => {
    expect(withdrawalDecision({ status: "pending" }, NOW).open).toBe(true);
    expect(
      withdrawalDecision(
        {
          status: "delivered",
          deliveredAt: new Date(NOW - 13 * DAY).toISOString(),
          withdrawalInfoProvided: true,
        },
        NOW,
      ).open,
    ).toBe(true);
    expect(
      withdrawalDecision(
        {
          status: "delivered",
          deliveredAt: new Date(NOW - 15 * DAY).toISOString(),
          withdrawalInfoProvided: true,
        },
        NOW,
      ),
    ).toEqual({ open: false, reason: "expired" });
    expect(
      withdrawalDecision(
        {
          status: "delivered",
          deliveredAt: "2026-09-01T12:00:00.000Z",
          withdrawalInfoProvided: false,
        },
        NOW,
      ).open,
    ).toBe(true);
    expect(
      withdrawalDecision(
        {
          status: "delivered",
          deliveredAt: "2025-09-01T12:00:00.000Z",
          withdrawalInfoProvided: false,
        },
        NOW,
      ),
    ).toEqual({ open: false, reason: "expired" });
    expect(
      withdrawalDecision(
        {
          status: "processing",
          items: [{ downloadable: true }],
          digitalWaiverAt: "2026-10-01T00:00:00.000Z",
        },
        NOW,
      ),
    ).toEqual({ open: false, reason: "waived" });
    expect(
      withdrawalDecision({ status: "pending", withdrawalAt: "2026-10-04T00:00:00.000Z" }, NOW),
    ).toEqual({
      open: false,
      reason: "already",
    });
    expect(withdrawalDecision({ status: "cancelled" }, NOW)).toEqual({
      open: false,
      reason: "closed",
    });
  });
});

describe("declareWithdrawal", () => {
  function orderStore(order: Record<string, unknown>, couponUsed = 2) {
    const rows = new Map<string, Record<string, unknown>[]>([
      ["orders", [{ ...order }]],
      ["coupons", [{ _id: "coupon-1", code: "SAVE", usedCount: couponUsed, tenantId: "t1" }]],
      ["products", [{ _id: "p1", inventory: 1, inventoryQty: 1, tenantId: "t1" }]],
    ]);
    const find = (collection: string, filter: Record<string, unknown>) =>
      (rows.get(collection) || []).find((row) =>
        Object.entries(filter).every(([key, value]) => String(row[key]) === String(value)),
      ) ?? null;
    const store: CommerceStore = {
      tenantId: "t1" as never,
      async hasCollection() {
        return true;
      },
      async findOne(collection, filter) {
        return find(collection, filter);
      },
      async findMany() {
        return [];
      },
      async create() {
        return {};
      },
      async update(collection, id, patch) {
        const row = (rows.get(collection) || []).find((entry) => String(entry._id) === String(id));
        if (row) Object.assign(row, patch);
      },
      async delete() {},
    };
    return { store, rows };
  }

  const pending = {
    _id: "order-1",
    orderNumber: "1001",
    customerEmail: "Buyer@Example.com",
    status: "pending",
    couponCode: "SAVE",
    inventoryCommitted: true,
    items: [
      { productId: "p1", title: "Tee", sku: "SKU", qty: 1, unitAmount: 1000, currency: "EUR" },
    ],
  };

  it("cancels a pending order, restocks, and returns one coupon use", async () => {
    const { store, rows } = orderStore(pending);
    const saved = await declareWithdrawal(store, {
      orderNumber: "1001",
      name: "Ada",
      email: "buyer@example.com",
      confirm: true,
    });
    expect(saved.status).toBe("cancelled");
    expect(saved.withdrawalAt).toEqual(expect.any(String));
    expect(rows.get("products")?.[0]?.inventory).toBe(2);
    expect(rows.get("coupons")?.[0]?.usedCount).toBe(1);
  });

  it("records a shipped withdrawal without cancelling or releasing the coupon", async () => {
    const { store, rows } = orderStore({ ...pending, status: "shipped" });
    const saved = await declareWithdrawal(store, {
      orderNumber: "1001",
      name: "Ada",
      email: "buyer@example.com",
      confirm: true,
    });
    expect(saved.status).toBe("shipped");
    expect(saved.withdrawalAt).toEqual(expect.any(String));
    expect(rows.get("coupons")?.[0]?.usedCount).toBe(2);
    expect(rows.get("products")?.[0]?.inventory).toBe(1);
  });

  it("rejects a second confirmation and an email that does not match", async () => {
    const { store } = orderStore({ ...pending, withdrawalAt: "2026-10-04T00:00:00.000Z" });
    await expect(
      declareWithdrawal(store, {
        orderNumber: "1001",
        name: "Ada",
        email: "buyer@example.com",
        confirm: true,
      }),
    ).rejects.toMatchObject({ code: "WITHDRAWAL_CLOSED" });
    await expect(
      declareWithdrawal(orderStore(pending).store, {
        orderNumber: "1001",
        name: "Ada",
        email: "other@example.com",
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("trader settings and VIES", () => {
  it("uses the German payment phrase unless the store language is English", () => {
    expect(consumerCopy(readCommerceLegal({ storeLanguage: "de" })).pay).toBe(
      "zahlungspflichtig bestellen",
    );
    expect(consumerCopy(readCommerceLegal({ storeLanguage: "en-US" })).pay).toBe(
      "Order with obligation to pay",
    );
    expect(readCommerceLegal(undefined).pricesIncludeTax).toBe(true);
  });

  it("requires a reachable trader and a tax identifier", () => {
    const legal = readCommerceLegal({
      legalName: "Laden GmbH",
      legalAddress: "Hauptstr. 1",
      legalEmail: "shop@example.com",
      phone: "+49 30 000",
    });
    expect(() => assertTraderIdentity(legal)).toThrow(AppError);
    try {
      assertTraderIdentity(legal);
    } catch (err) {
      expect((err as AppError).code).toBe("TRADER_TAX_ID");
    }
    expect(() =>
      assertTraderIdentity(readCommerceLegal({ legalName: "Laden GmbH", vatId: "DE123456789" })),
    ).toThrow(AppError);
  });

  it("accepts a confirmed VAT ID and keeps VAT when VIES is down", async () => {
    safeFetch.mockReset();
    safeFetch.mockResolvedValueOnce({
      success: true,
      status: 200,
      body: JSON.stringify({ valid: true }),
    });
    await expect(verifyEuVatId("DE123456789")).resolves.toMatchObject({
      status: "valid",
      id: "DE123456789",
    });

    safeFetch.mockResolvedValueOnce({ success: false, status: 503 });
    await expect(verifyEuVatId("DE123456789")).resolves.toMatchObject({ status: "unavailable" });

    safeFetch.mockClear();
    await expect(verifyEuVatId("DE12")).resolves.toEqual({ status: "invalid" });
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
