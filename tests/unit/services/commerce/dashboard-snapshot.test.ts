/**
 * @file tests/unit/services/commerce/dashboard-snapshot.test.ts
 * @description Unit tests for ecommerce dashboard widget payload helpers.
 */

import { describe, expect, it } from "vitest";
import {
  commerceRows,
  displayText,
  inventoryQty,
  summarizeInventory,
  summarizeOrders,
} from "../../../../src/services/commerce/dashboard-snapshot";

describe("commerceRows", () => {
  it("unwraps LocalCMS { success, data: [] } envelopes", () => {
    expect(commerceRows({ success: true, data: [{ _id: "1" }] })).toEqual([{ _id: "1" }]);
  });

  it("unwraps { data: { items } } envelopes", () => {
    expect(commerceRows({ data: { items: [{ sku: "A" }] } })).toEqual([{ sku: "A" }]);
  });

  it("returns [] on failed or empty results", () => {
    expect(commerceRows(null)).toEqual([]);
    expect(commerceRows({ success: false, data: [{ _id: "x" }] })).toEqual([]);
    expect(commerceRows({ data: {} })).toEqual([]);
  });
});

describe("displayText", () => {
  it("unwraps localized title objects", () => {
    expect(displayText({ en: "Shirt", de: "Hemd" })).toBe("Shirt");
    expect(displayText("plain")).toBe("plain");
    expect(displayText(null)).toBe("");
  });
});

describe("inventoryQty", () => {
  it("reads preset inventory and importer aliases", () => {
    expect(inventoryQty({ inventory: 4 })).toBe(4);
    expect(inventoryQty({ inventoryQty: 7 })).toBe(7);
    expect(inventoryQty({ inventoryQuantity: 2 })).toBe(2);
    expect(inventoryQty({})).toBe(0);
  });
});

describe("summarizeOrders", () => {
  it("counts status mix and caps the recent list", () => {
    const snap = summarizeOrders(
      [
        {
          _id: "1",
          orderNumber: "ORD-1",
          status: "pending",
          total: 12.5,
          customerEmail: "a@x.com",
        },
        {
          _id: "2",
          orderNumber: "ORD-2",
          status: "processing",
          total: 9,
          customerEmail: "b@x.com",
        },
        { _id: "3", orderNumber: "ORD-3", status: "pending", total: 3, customerEmail: "c@x.com" },
      ],
      2,
    );
    expect(snap.available).toBe(true);
    expect(snap.total).toBe(3);
    expect(snap.byStatus).toEqual({ pending: 2, processing: 1 });
    expect(snap.recent).toHaveLength(2);
    expect(snap.recent[0].orderNumber).toBe("ORD-1");
    expect(snap.recent[0].total).toBe(12.5);
  });
});

describe("summarizeInventory", () => {
  it("emits one low-stock row per variant using preset inventory", () => {
    const snap = summarizeInventory(
      [
        {
          _id: "p1",
          title: { en: "Tee" },
          sku: "TEE",
          lowStockThreshold: 5,
          variants: [
            { sku: "TEE-S", inventory: 1, title: "Small" },
            { sku: "TEE-M", inventory: 20, title: "Medium" },
            { sku: "TEE-L", inventoryQty: 0, title: "Large" },
          ],
        },
      ],
      8,
    );
    expect(snap.tracked).toBe(3);
    expect(snap.outOfStock).toBe(1);
    expect(snap.lowStock.map((r) => r.sku)).toEqual(["TEE-L", "TEE-S"]);
    expect(snap.lowStock[0].title).toContain("Tee");
  });

  it("falls back to product-level inventory when there are no variants", () => {
    const snap = summarizeInventory(
      [{ _id: "p2", title: "Mug", sku: "MUG", inventory: 0, lowStockThreshold: 3 }],
      8,
    );
    expect(snap.tracked).toBe(1);
    expect(snap.outOfStock).toBe(1);
    expect(snap.lowStock[0]).toMatchObject({ sku: "MUG", qty: 0, threshold: 3 });
  });

  it("treats stockStatus out_of_stock as out even when qty is leftover", () => {
    const snap = summarizeInventory(
      [{ _id: "p3", title: "Hat", sku: "HAT", inventory: 2, stockStatus: "out_of_stock" }],
      8,
    );
    expect(snap.outOfStock).toBe(1);
    expect(snap.lowStock).toHaveLength(1);
  });
});
