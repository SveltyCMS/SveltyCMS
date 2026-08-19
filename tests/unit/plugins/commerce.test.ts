/**
 * @file tests/unit/plugins/commerce.test.ts
 * @description Tenant isolation, cart merge, totals, and F1 (no client amount).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn(() => true),
}));

import { isMultiTenantEnabled } from "@utils/tenant";
import { requireCommerceTenantId, withTenant } from "../../../src/plugins/commerce/tenant";
import { computeTotals } from "../../../src/services/commerce/adjustment-engine";
import { money } from "../../../src/services/commerce/price";
import {
  addCartItem,
  getOrCreateCart,
  mergeCartOnLogin,
} from "../../../src/plugins/commerce/cart-service";
import type { CommerceStore } from "../../../src/plugins/commerce/store";
import { AppError } from "@utils/error-handling";

const mockedMulti = vi.mocked(isMultiTenantEnabled);

function memoryStore(tenantId: string): CommerceStore & { rows: Map<string, any[]> } {
  const rows = new Map<string, any[]>([
    ["carts", []],
    ["products", []],
    ["orders", []],
    ["coupons", []],
    ["tax_rates", []],
    ["shipping_zones", []],
  ]);
  const scoped = (collection: string, filter: Record<string, unknown>) =>
    (rows.get(collection) || []).filter((row) =>
      Object.entries(filter).every(([k, v]) => String(row[k]) === String(v)),
    );
  return {
    tenantId: tenantId as any,
    rows,
    async hasCollection() {
      return true;
    },
    async findOne(collection, filter) {
      return scoped(collection, { ...filter, tenantId })[0] ?? null;
    },
    async findMany(collection, filter) {
      return scoped(collection, { ...filter, tenantId });
    },
    async create(collection, data) {
      const row = {
        ...data,
        tenantId,
        _id: `${tenantId}-${collection}-${rows.get(collection)!.length}`,
      };
      rows.get(collection)!.push(row);
      return row;
    },
    async update(collection, id, data) {
      const list = rows.get(collection)!;
      const idx = list.findIndex((r) => r._id === id && r.tenantId === tenantId);
      if (idx >= 0) list[idx] = { ...list[idx], ...data, tenantId };
    },
    async delete(collection, id) {
      const list = rows.get(collection)!;
      const next = list.filter((r) => !(r._id === id && r.tenantId === tenantId));
      rows.set(collection, next);
    },
  };
}

describe("requireCommerceTenantId", () => {
  it("throws TENANT_REQUIRED when multi-tenant and tenant is missing", () => {
    mockedMulti.mockReturnValue(true);
    try {
      requireCommerceTenantId(null);
      throw new Error("expected raise");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("TENANT_REQUIRED");
    }
  });

  it("falls back to global when multi-tenant is off", () => {
    mockedMulti.mockReturnValue(false);
    expect(String(requireCommerceTenantId(null))).toBe("global");
  });
});

describe("withTenant", () => {
  it("always includes tenantId on the filter", () => {
    expect(withTenant("t1" as any, { sessionId: "s" })).toEqual({ sessionId: "s", tenantId: "t1" });
  });
});

describe("computeTotals", () => {
  it("applies weighted adjustments to integer cents", () => {
    const out = computeTotals(money(1999, "EUR"), [
      { type: "promotion", label: "10%", weight: 10, amount: money(-200, "EUR") },
      { type: "shipping", label: "ship", weight: 20, amount: money(450, "EUR") },
      { type: "tax", label: "vat", weight: 30, amount: money(380, "EUR") },
    ]);
    expect(out.grandTotal.amount).toBe(2629);
  });
});

describe("cart tenant isolation + merge", () => {
  beforeEach(() => mockedMulti.mockReturnValue(true));

  it("does not return another tenant's cart for the same session id", async () => {
    const a = memoryStore("tenant-a");
    const b = memoryStore("tenant-b");
    a.rows.get("products")!.push({
      _id: "p1",
      tenantId: "tenant-a",
      title: "Tee",
      sku: "TEE",
      price: 10,
    });
    b.rows.get("products")!.push({
      _id: "p1",
      tenantId: "tenant-b",
      title: "Other",
      sku: "OTH",
      price: 99,
    });
    await addCartItem(a, {
      sessionId: "same-cookie",
      currency: "EUR",
      productId: "p1",
      qty: 1,
    });
    const cartB = await getOrCreateCart(b, { sessionId: "same-cookie", currency: "EUR" });
    expect(cartB.items).toHaveLength(0);
    const cartA = await getOrCreateCart(a, { sessionId: "same-cookie", currency: "EUR" });
    expect(cartA.items).toHaveLength(1);
    expect(cartA.items[0].title).toBe("Tee");
  });

  it("merges guest lines into the customer cart on login", async () => {
    const store = memoryStore("tenant-a");
    store.rows.get("products")!.push({
      _id: "p1",
      tenantId: "tenant-a",
      title: "Mug",
      sku: "MUG",
      price: 5,
    });
    await addCartItem(store, {
      sessionId: "guest-1",
      currency: "EUR",
      productId: "p1",
      qty: 2,
    });
    await store.create("carts", {
      sessionId: "other",
      customer: "user-1",
      items: [],
      subtotal: 0,
    });
    const merged = await mergeCartOnLogin(store, {
      sessionId: "guest-1",
      customerId: "user-1",
      currency: "EUR",
    });
    expect(merged.customer).toBe("user-1");
    expect(merged.items[0].qty).toBe(2);
  });
});

describe("variant matrix and digital cart", () => {
  it("expands attribute cartesian product", async () => {
    const { expandVariantMatrix } = await import("../../../src/plugins/commerce/variants");
    const rows = expandVariantMatrix(
      [
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Red"] },
      ],
      { skuPrefix: "TEE" },
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title)).toEqual(["S / Red", "M / Red"]);
  });

  it("treats all-downloadable carts as digital-only", async () => {
    const { cartIsDigitalOnly } = await import("../../../src/plugins/commerce/quotes");
    expect(cartIsDigitalOnly({ items: [{ downloadable: true }, { downloadable: true }] })).toBe(
      true,
    );
    expect(cartIsDigitalOnly({ items: [{ downloadable: true }, { downloadable: false }] })).toBe(
      false,
    );
  });
});

describe("F1 — Stripe PaymentIntent ignores client amount", () => {
  it("documents that /api/commerce/pay requires orderId, not amount", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/routes/api/[...path]/handlers/commerce.ts", "utf8"),
    );
    expect(src).toContain("body.amount != null");
    expect(src).toContain("order.totalCents");
    expect(src).not.toMatch(/createIntent\(\{[\s\S]*amount:\s*body\.amount/);
  });
});
