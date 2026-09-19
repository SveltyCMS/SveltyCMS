/**
 * @file tests/unit/plugins/commerce.test.ts
 * @description Tenant isolation, cart merge, totals, and F1 (no client amount).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: vi.fn(() => true),
  resetMultiTenantCache: vi.fn(),
}));

import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { MAX_PAGE_SIZE } from "@utils/api-params";
import { requireCommerceTenantId, withTenant } from "../../../src/plugins/commerce/tenant";
import { computeTotals } from "../../../src/services/commerce/adjustment-engine";
import { money } from "../../../src/services/commerce/price";
import {
  addCartItem,
  getOrCreateCart,
  mergeCartOnLogin,
  type CartLine,
} from "../../../src/plugins/commerce/cart-service";
import type { CommerceStore } from "../../../src/plugins/commerce/store";
import { orderAnalytics } from "../../../src/plugins/commerce/analytics";
import { resolveDownloadFiles } from "../../../src/routes/api/[...path]/handlers/commerce";
import { handleCollectionFind } from "../../../src/routes/api/[...path]/handlers/collections";
import type { LocalCMS } from "../../../src/services/sdk";
import type { DatabaseId } from "../../../src/content/types";
import { createMockRequestEvent } from "../utils/mock-event";
import { AppError } from "@utils/error-handling";

const mockedMulti = isMultiTenantEnabled as any;

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
      Object.entries(filter).every(([k, v]) => {
        const inList = (v as { $in?: unknown[] } | null)?.$in;
        if (Array.isArray(inList)) {
          return inList.some((item) => String(row[k]) === String(item));
        }
        return String(row[k]) === String(v);
      }),
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

describe("cart row hardening", () => {
  it("skips malformed cart items instead of crashing money()", async () => {
    const store = memoryStore("tenant-a");
    await store.create("carts", {
      sessionId: "s1",
      customer: null,
      items: [
        { productId: "p1", title: "Good", qty: 2, unitAmount: 500, currency: "EUR" },
        { productId: "p2", title: "Broken" },
        "garbage",
      ],
      appliedCoupon: null,
    });
    const cart = await getOrCreateCart(store, { sessionId: "s1", currency: "EUR" });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].qty).toBe(2);
    expect(cart.subtotal).toBe(10);
  });

  it("coerces string quantities into integers", async () => {
    const store = memoryStore("tenant-a");
    await store.create("carts", {
      sessionId: "s1",
      customer: null,
      items: [{ productId: "p1", title: "X", qty: "2", unitAmount: 500, currency: "EUR" }],
      appliedCoupon: null,
    });
    const cart = await getOrCreateCart(store, { sessionId: "s1", currency: "EUR" });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].qty).toBe(2);
    expect(cart.subtotal).toBe(10);
  });

  it("sums lines in the view currency even when a line carries a stale currency", async () => {
    const store = memoryStore("tenant-a");
    await store.create("carts", {
      sessionId: "s1",
      customer: null,
      items: [{ productId: "p1", title: "X", qty: 1, unitAmount: 900, currency: "USD" }],
      appliedCoupon: null,
    });
    const cart = await getOrCreateCart(store, { sessionId: "s1", currency: "EUR" });
    expect(cart.currency).toBe("EUR");
    expect(cart.subtotal).toBe(9);
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

  it("documents that /api/commerce/confirm binds intentId to order", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/routes/api/[...path]/handlers/commerce.ts", "utf8"),
    );
    expect(src).toContain("order.stripePaymentIntentId !== intentId");
  });
});

describe("Cart Expiration & Self-Healing", () => {
  it("resets expired cart items when retrieved after expiration date", async () => {
    const store = memoryStore("tenant-a");
    const pastDate = new Date(Date.now() - 100000).toISOString();
    await store.create("carts", {
      sessionId: "expired-session",
      customer: null,
      items: [{ productId: "p1", title: "Item 1", qty: 2, unitAmount: 500, currency: "EUR" }],
      subtotal: 10,
      appliedCoupon: "PROMO10",
      expiresAt: pastDate,
    });

    const cart = await getOrCreateCart(store, { sessionId: "expired-session", currency: "EUR" });
    expect(cart.items).toHaveLength(0);
    expect(cart.subtotal).toBe(0);
    expect(cart.appliedCoupon).toBeNull();
    expect(new Date(cart.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Variant Matrix Generation & DoS Protection", () => {
  it("caps Cartesian product generation at 500 variants to prevent CPU/memory exhaustion", async () => {
    const { expandVariantMatrix } = await import("../../../src/plugins/commerce/variants");
    const attributes = [
      { name: "Size", values: ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL"] },
      {
        name: "Color",
        values: [
          "Red",
          "Green",
          "Blue",
          "Yellow",
          "Black",
          "White",
          "Purple",
          "Orange",
          "Pink",
          "Cyan",
        ],
      },
      {
        name: "Material",
        values: ["Cotton", "Polyester", "Wool", "Silk", "Linen", "Nylon", "Rayon", "Spandex"],
      },
    ];
    // 10 * 10 * 8 = 800 combinations
    const result = expandVariantMatrix(attributes);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBe(500);
  });
});

describe("digital downloads — batched product lookup", () => {
  const orderLine = (overrides: Partial<CartLine> = {}): CartLine => ({
    productId: "p1",
    title: "Item",
    sku: "SKU",
    qty: 1,
    unitAmount: 100,
    currency: "EUR",
    ...overrides,
  });

  it("issues one product lookup for a multi-line order and resolves every downloadable line", async () => {
    const store = memoryStore("tenant-a");
    store.rows
      .get("products")!
      .push(
        { _id: "p1", tenantId: "tenant-a", title: "Album", downloadFile: "album.zip" },
        { _id: "p3", tenantId: "tenant-a", title: "E-Book", downloadFile: "ebook.epub" },
      );
    const productFilters: Record<string, unknown>[] = [];
    const countingStore: CommerceStore = {
      ...store,
      findMany: async (collection, filter, opts) => {
        if (collection === "products") productFilters.push(filter);
        return store.findMany(collection, filter, opts);
      },
    };

    const files = await resolveDownloadFiles(
      countingStore,
      [
        orderLine({ productId: "p1", title: "Album", downloadable: true }),
        orderLine({ productId: "p2", title: "Poster", downloadable: false }),
        orderLine({ productId: "p3", title: "E-Book", downloadable: true }),
      ],
      { tenantId: "tenant-a", orderId: "order-1" },
      (input) => `tok:${input.productId}`,
    );

    expect(productFilters).toHaveLength(1);
    expect(productFilters[0]).toEqual({ _id: { $in: ["p1", "p3"] } });
    expect(files).toEqual([
      { productId: "p1", title: "Album", token: "tok:p1", file: "album.zip" },
      { productId: "p3", title: "E-Book", token: "tok:p3", file: "ebook.epub" },
    ]);
  });

  it("keeps the file:null fallback for a downloadable line whose product is missing", async () => {
    const store = memoryStore("tenant-a");
    store.rows.get("products")!.push({
      _id: "p1",
      tenantId: "tenant-a",
      title: "Album",
      downloadFile: "album.zip",
    });

    const files = await resolveDownloadFiles(
      store,
      [
        orderLine({ productId: "p1", title: "Album", downloadable: true }),
        orderLine({ productId: "p9", title: "Ghost", downloadable: true }),
      ],
      { tenantId: "tenant-a", orderId: "order-1" },
      (input) => `tok:${input.productId}`,
    );

    expect(files).toEqual([
      { productId: "p1", title: "Album", token: "tok:p1", file: "album.zip" },
      { productId: "p9", title: "Ghost", token: "tok:p9", file: null },
    ]);
  });

  it("skips the product query entirely when no line is downloadable", async () => {
    const store = memoryStore("tenant-a");
    let productQueries = 0;
    const countingStore: CommerceStore = {
      ...store,
      findMany: async (collection, filter, opts) => {
        if (collection === "products") productQueries += 1;
        return store.findMany(collection, filter, opts);
      },
    };

    const files = await resolveDownloadFiles(
      countingStore,
      [orderLine({ downloadable: false })],
      { tenantId: "tenant-a", orderId: "order-1" },
      (input) => `tok:${input.productId}`,
    );

    expect(files).toEqual([]);
    expect(productQueries).toBe(0);
  });
});

describe("orderAnalytics — internal aggregation is not clamped by MAX_PAGE_SIZE", () => {
  it("sees orders past the public page cap through the streaming path", async () => {
    const total = MAX_PAGE_SIZE + 50;
    const orders = Array.from({ length: total }, (_, i) => ({
      _id: `o${i}`,
      tenantId: "tenant-a",
      status: "delivered",
      totalCents: 100,
    }));
    const clampedFind = vi.fn(
      async (_collection: string, opts: { offset?: number; limit?: number }) => {
        const offset = opts?.offset ?? 0;
        const limit = Math.min(opts?.limit ?? 50, MAX_PAGE_SIZE);
        return { success: true, data: orders.slice(offset, offset + limit) };
      },
    );
    const findStreaming = vi.fn(async (_collection: string, _options: Record<string, unknown>) =>
      (async function* () {
        yield* orders;
      })(),
    );
    const cms = { collections: { find: clampedFind, findStreaming } } as unknown as LocalCMS;

    const result = await orderAnalytics(cms, "tenant-a" as DatabaseId);

    expect(result.orderCount).toBe(total);
    expect(result.paidCount).toBe(total);
    expect(result.gross).toBe(total); // 100 cents per order
    expect(findStreaming).toHaveBeenCalledTimes(1);
    expect(findStreaming.mock.calls[0][1]).toMatchObject({
      tenantId: "tenant-a",
      system: true,
      publicationFilter: "all",
      limit: 500,
    });
    // Regression guard: the clamped paged funnel would only see MAX_PAGE_SIZE rows.
    expect(clampedFind).not.toHaveBeenCalled();
  });
});

describe("handleCollectionFind — streaming heuristic at the page-size cap", () => {
  function getEvent(query: string) {
    return createMockRequestEvent({
      method: "GET",
      url: `/api/collections/posts${query}`,
    });
  }

  it("streams a request whose clamped limit reaches MAX_PAGE_SIZE", async () => {
    const findStreaming = vi.fn(async () => (async function* () {})());
    const find = vi.fn(async () => ({ success: true, data: [] }));
    const cms = { collections: { findStreaming, find } } as unknown as LocalCMS;
    const event = getEvent(`?limit=${MAX_PAGE_SIZE}`);

    const response = await handleCollectionFind(
      event,
      cms,
      "t1" as DatabaseId,
      { _id: "u1" },
      "posts",
      event.url,
    );

    expect(findStreaming).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps the buffered JSON envelope below the cap", async () => {
    const findStreaming = vi.fn(async () => (async function* () {})());
    const find = vi.fn(async (_collection: string, _options: Record<string, unknown>) => ({
      success: true,
      data: [],
    }));
    const cms = { collections: { findStreaming, find } } as unknown as LocalCMS;
    const event = getEvent("");

    const response = await handleCollectionFind(
      event,
      cms,
      "t1" as DatabaseId,
      { _id: "u1" },
      "posts",
      event.url,
    );

    expect(findStreaming).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0][1]).toMatchObject({ limit: 50 });
    expect(await response.json()).toEqual({ success: true, data: [] });
  });
});
