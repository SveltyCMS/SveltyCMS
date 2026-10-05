/**
 * @file tests/unit/setup/ecommerce-defaults.test.ts
 * @description Idempotent ecommerce tax and shipping seed.
 */

import { withSystemScope } from "@src/databases/system-tenant-scope";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import { seedEcommerceDefaults } from "@src/routes/setup/seed";
import { describe, expect, it, vi } from "vitest";

function createMockAdapter(rowsByCollection: Record<string, unknown>) {
  return {
    crud: {
      findMany: vi.fn(async (collection: string) => rowsByCollection[collection] ?? []),
      insertMany: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as DatabaseAdapter;
}

describe("seedEcommerceDefaults", () => {
  it("inserts a worldwide zone and a DE VAT row when both collections are empty", async () => {
    const adapter = createMockAdapter({
      shipping_zones: { success: true, data: [] },
      tax_rates: { success: true, data: [] },
    });

    await seedEcommerceDefaults(adapter, { tenantId: "shop" });

    expect(adapter.crud!.insertMany).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(adapter.crud!.insertMany).mock.calls;
    expect(calls[0]?.[0]).toBe("shipping_zones");
    expect(calls[0]?.[1]?.[0]).toMatchObject({
      name: "Worldwide",
      countries: "",
      method: "flat_rate",
      rate: 5,
      status: "publish",
      tenantId: "shop",
    });
    expect(calls[0]?.[1]?.[0]).not.toHaveProperty("freeThreshold");
    expect(calls[1]?.[0]).toBe("tax_rates");
    expect(calls[1]?.[1]?.[0]).toMatchObject({
      country: "DE",
      rate: 19,
      reducedRate: 7,
      label: "VAT",
      shippingTaxable: true,
      status: "publish",
      tenantId: "shop",
    });
    expect(adapter.crud!.findMany).toHaveBeenCalledWith(
      "shipping_zones",
      expect.objectContaining({ tenantId: "shop" }),
      expect.objectContaining({ ...withSystemScope("seed"), limit: 1 }),
    );
  });

  it("skips a collection that already has a row and still seeds the empty one", async () => {
    const adapter = createMockAdapter({
      shipping_zones: [{ name: "EU" }],
      tax_rates: { success: true, data: [] },
    });

    await seedEcommerceDefaults(adapter);

    expect(adapter.crud!.insertMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adapter.crud!.insertMany).mock.calls[0]?.[0]).toBe("tax_rates");
  });

  it("seeds the country from the wizard and skips tax when the rate is blank", async () => {
    const france = createMockAdapter({
      shipping_zones: { success: true, data: [] },
      tax_rates: { success: true, data: [] },
    });
    await seedEcommerceDefaults(france, {
      market: { homeCountry: "fr", taxRate: 20, reducedRate: 5.5, label: "VAT" },
    });
    const taxCall = vi
      .mocked(france.crud!.insertMany)
      .mock.calls.find((call) => call[0] === "tax_rates");
    expect(taxCall?.[1]?.[0]).toMatchObject({
      country: "FR",
      rate: 20,
      reducedRate: 5.5,
      label: "VAT",
    });

    const open = createMockAdapter({
      shipping_zones: [],
      tax_rates: [],
    });
    await seedEcommerceDefaults(open, { market: { homeCountry: "", taxRate: null } });
    expect(vi.mocked(open.crud!.insertMany).mock.calls.map((call) => call[0])).toEqual([
      "shipping_zones",
    ]);
  });

  it("does not insert when the adapter cannot read the collection", async () => {
    const adapter = createMockAdapter({
      shipping_zones: { success: false, message: "missing" },
      tax_rates: { success: false, message: "missing" },
    });

    await seedEcommerceDefaults(adapter);

    expect(adapter.crud!.insertMany).not.toHaveBeenCalled();
  });

  it("no-ops when CRUD is unavailable", async () => {
    const adapter = {} as DatabaseAdapter;
    await expect(seedEcommerceDefaults(adapter)).resolves.toBeUndefined();
  });
});
