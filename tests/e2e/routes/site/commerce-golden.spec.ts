/**
 * @file tests/e2e/routes/site/commerce-golden.spec.ts
 * @description Guest commerce golden journey — /shop → add to cart → /cart.
 *
 * Routes covered (previously untested): /shop, /cart, /api/commerce/cart.
 *
 * Seed-first policy (control-map): the commerce plugin, the `products` and
 * `carts` collections, and one published product are provisioned via the
 * testing API in beforeAll; the seeds' success is asserted (no soft-skips).
 */

import { expect, test, type APIRequestContext } from "@playwright/test";
import { TEST_API_HEADERS } from "../../helpers/api";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";

const RUN_STAMP = Date.now().toString(36);
const PRODUCT_TITLE = "E2E Golden Sneaker";
const PRODUCT_SKU = "E2E-GOLD-001";
const PRODUCT_PRICE = "49.00";
// `x-test-worker-index` gives the request DB-worker isolation, but the E2E
// harness runs MULTI_TENANT=false, so `requireCommerceTenantId` resolves the
// guest (and the testing API) tenant to `global`. Seed plugin state + product
// rows under that same tenant or the /shop and /cart reads find nothing.
const COMMERCE_TENANT = "global";

/** Post an /api/testing action; fail hard on non-OK or unsuccessful bodies. */
async function postTesting(
  request: APIRequestContext,
  action: string,
  data: Record<string, unknown> = {},
) {
  const res = await request.post("/api/testing", {
    headers: { ...TEST_API_HEADERS, "x-test-tenant-id": COMMERCE_TENANT },
    data: { action, ...data },
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  expect(
    res.ok(),
    `POST /api/testing ${action} failed: ${res.status()} ${text.slice(0, 400)}`,
  ).toBeTruthy();
  expect(
    body.success,
    `POST /api/testing ${action} unsuccessful: ${JSON.stringify(body).slice(0, 300)}`,
  ).not.toBe(false);
  return body;
}

test.describe("Guest commerce golden journey", () => {
  // Guests must not inherit the admin storageState — blank context per test.
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async ({ request }) => {
    // 1. Enable the commerce plugin (core, always registered — fail hard).
    await postTesting(request, "enable-plugin", { pluginId: "commerce", enabled: true });

    // 2. The commerce API refuses to operate without BOTH `products` and
    //    `carts` collections (handler-level guard) — provision them.
    const productsSchema = {
      _id: "products",
      name: "products",
      fields: [
        { db_fieldName: "title", name: "Title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "slug", name: "Slug", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "sku", name: "SKU", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "price", name: "Price", widget: { Name: "Input" }, type: "number" },
        {
          db_fieldName: "comparePrice",
          name: "Compare Price",
          widget: { Name: "Input" },
          type: "number",
        },
        { db_fieldName: "inventory", name: "Inventory", widget: { Name: "Input" }, type: "number" },
        {
          db_fieldName: "lowStockThreshold",
          name: "Low Stock Threshold",
          widget: { Name: "Input" },
          type: "number",
        },
        { db_fieldName: "tags", name: "Tags", widget: { Name: "Input" }, type: "json" },
      ],
      status: "publish",
    };
    const cartsSchema = {
      _id: "carts",
      name: "carts",
      fields: [
        { db_fieldName: "sessionId", name: "Session", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "customer", name: "Customer", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "items", name: "Items", widget: { Name: "Input" }, type: "json" },
        { db_fieldName: "subtotal", name: "Subtotal", widget: { Name: "Input" }, type: "number" },
        {
          db_fieldName: "appliedCoupon",
          name: "Coupon",
          widget: { Name: "Input" },
          type: "string",
        },
        { db_fieldName: "expiresAt", name: "Expires", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "status", name: "Status", widget: { Name: "Input" }, type: "string" },
      ],
      status: "publish",
    };
    const col = await postTesting(request, "create-collection", {
      schema: productsSchema,
    });
    expect(
      col.success || col.results?.some((r: any) => r.id === "products" && r.success),
      `create-collection products: ${JSON.stringify(col).slice(0, 300)}`,
    ).toBe(true);
    const cartCol = await postTesting(request, "create-collection", { schema: cartsSchema });
    expect(
      cartCol.success || cartCol.results?.some((r: any) => r.id === "carts" && r.success),
      `create-collection carts: ${JSON.stringify(cartCol).slice(0, 300)}`,
    ).toBe(true);

    // 3. One published product under the commerce (global) tenant.
    const insert = await postTesting(request, "insert", {
      collectionId: "products",
      data: {
        title: PRODUCT_TITLE,
        slug: `e2e-golden-sneaker-${RUN_STAMP}`,
        sku: PRODUCT_SKU,
        price: 49,
        comparePrice: 59,
        inventory: 10,
        lowStockThreshold: 5,
        tags: ["featured"],
        status: "publish",
        tenantId: COMMERCE_TENANT,
      },
    });
    expect(insert.success, `insert product: ${JSON.stringify(insert).slice(0, 300)}`).toBe(true);
  });

  test("guest sees the seeded product on /shop", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfPresent(page);

    await expect(page.getByText(PRODUCT_TITLE, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    // Price renders via toFixed(2) → "49.00"
    await expect(page.getByText(PRODUCT_PRICE, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Add to cart" }).first()).toBeVisible();
  });

  test("guest adds to cart and sees the line on /cart", async ({ page }) => {
    await page.goto("/shop", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfPresent(page);

    const addBtn = page.getByRole("button", { name: "Add to cart" }).first();
    await expect(addBtn).toBeVisible({ timeout: 20_000 });

    const cartRes = page.waitForResponse(
      (res) => res.url().includes("/api/commerce/cart") && res.request().method() === "POST",
      { timeout: 20_000 },
    );
    await addBtn.click();
    const res = await cartRes;
    expect(res.ok(), `POST /api/commerce/cart status=${res.status()}`).toBeTruthy();

    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfPresent(page);

    // Outcome assertions — the cart line shows title, SKU and the subtotal.
    await expect(page.getByText(PRODUCT_TITLE, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(PRODUCT_SKU, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/subtotal/i)).toBeVisible();
  });
});
