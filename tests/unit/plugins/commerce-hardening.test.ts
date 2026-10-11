/**
 * @file tests/unit/plugins/commerce-hardening.test.ts
 * @description Oversell guard (per-product lock) + Idempotency-Key helpers.
 *
 * Covers the two correctness gaps in the checkout path:
 * - inventory decrement is read-modify-write, so concurrent orders for the last
 *   unit must be serialized (no oversell, never negative),
 * - `Idempotency-Key` must make concurrent/repeated checkout/pay calls run once.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@utils/error-handling";
import {
  productLockKey,
  resetCommerceLocks,
  withKeyLock,
} from "../../../src/plugins/commerce/locks";
import {
  normalizeIdempotencyKey,
  withIdempotency,
} from "../../../src/plugins/commerce/idempotency";
import { decrementStock } from "../../../src/plugins/commerce/inventory-service";
import type { CommerceStore } from "../../../src/plugins/commerce/store";
import type { CartLine } from "../../../src/plugins/commerce/cart-service";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function memoryStore(tenantId: string, seed: Record<string, any[]>): CommerceStore {
  const rows = new Map<string, any[]>(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  const match = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => String(row[k]) === String(v));
  return {
    tenantId: tenantId as any,
    async hasCollection() {
      return true;
    },
    async findOne(collection, filter) {
      return (rows.get(collection) || []).find((r) => match(r, filter)) ?? null;
    },
    async findMany(collection, filter) {
      return (rows.get(collection) || []).filter((r) => match(r, filter));
    },
    async create(collection, data) {
      if (!rows.has(collection)) rows.set(collection, []);
      const list = rows.get(collection)!;
      const row = { ...data, _id: `${collection}-${list.length}` };
      list.push(row);
      return row;
    },
    async update(collection, id, data) {
      const list = rows.get(collection) || [];
      const idx = list.findIndex((r) => r._id === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data };
    },
    async delete(collection, id) {
      rows.set(
        collection,
        (rows.get(collection) || []).filter((r) => r._id !== id),
      );
    },
  };
}

beforeEach(() => {
  resetCommerceLocks();
});

describe("withKeyLock", () => {
  it("serializes same-key critical sections (no interleave)", async () => {
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        withKeyLock("same", async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await delay(4);
          active--;
        }),
      ),
    );
    expect(maxActive).toBe(1);
  });

  it("runs different keys concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        withKeyLock(`k${i}`, async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await delay(4);
          active--;
        }),
      ),
    );
    expect(maxActive).toBeGreaterThan(1);
  });
});

describe("normalizeIdempotencyKey", () => {
  it("trims and accepts a normal token", () => {
    expect(normalizeIdempotencyKey("  order-123  ")).toBe("order-123");
  });
  it("rejects empty, missing and over-long values", () => {
    expect(normalizeIdempotencyKey("")).toBeUndefined();
    expect(normalizeIdempotencyKey(null)).toBeUndefined();
    expect(normalizeIdempotencyKey(undefined)).toBeUndefined();
    expect(normalizeIdempotencyKey("a".repeat(256))).toBeUndefined();
  });
});

describe("withIdempotency", () => {
  it("runs the side effect once for concurrent same-key calls", async () => {
    let runs = 0;
    const persisted = new Map<string, { id: number }>();
    const call = () =>
      withIdempotency(
        "key-1",
        async () => persisted.get("key-1") ?? null,
        async () => {
          runs++;
          await delay(5);
          const value = { id: runs };
          persisted.set("key-1", value);
          return value;
        },
      );
    const results = await Promise.all([call(), call(), call(), call()]);
    expect(runs).toBe(1);
    expect(results.every((r) => r.id === 1)).toBe(true);
  });

  it("replays a stored result on a later retry", async () => {
    let runs = 0;
    const persisted = new Map<string, { n: number }>();
    const run = () =>
      withIdempotency(
        "key-2",
        async () => persisted.get("key-2") ?? null,
        async () => {
          runs++;
          const value = { n: runs };
          persisted.set("key-2", value);
          return value;
        },
      );
    const first = await run();
    const second = await run();
    expect(runs).toBe(1);
    expect(second).toEqual(first);
  });

  it("runs unconditionally without a key", async () => {
    let runs = 0;
    await withIdempotency(
      undefined,
      async () => null,
      async () => {
        runs++;
        return runs;
      },
    );
    expect(runs).toBe(1);
  });
});

describe("inventory oversell guard", () => {
  const line = (productId: string): CartLine =>
    ({
      productId,
      title: "Widget",
      sku: "SKU-1",
      qty: 1,
      unitAmount: 999,
      currency: "EUR",
    }) as CartLine;

  it("sells the last unit to exactly one of N concurrent orders", async () => {
    const orders = Array.from({ length: 6 }, (_, i) => ({
      _id: `o${i}`,
      tenantId: "t1",
      status: "pending",
    }));
    const store = memoryStore("t1", {
      products: [
        {
          _id: "p1",
          tenantId: "t1",
          title: "Widget",
          sku: "SKU-1",
          inventory: 1,
          lowStockThreshold: 0,
        },
      ],
      orders,
    });

    const results = await Promise.allSettled(
      orders.map((o) => decrementStock(store, [line("p1")], o._id)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(AppError);
      expect((r.reason as AppError).code).toBe("OUT_OF_STOCK");
    }

    const product = await store.findOne("products", { _id: "p1" });
    const inventory = product ? Number(product.inventory) : NaN;
    expect(inventory).toBe(0);
    expect(inventory).toBeGreaterThanOrEqual(0);
  });

  it("uses a stable per-product lock key", () => {
    expect(productLockKey("t1", "p1")).toBe("t1:product:p1");
    expect(productLockKey("", "p1")).toBe("global:product:p1");
  });
});
