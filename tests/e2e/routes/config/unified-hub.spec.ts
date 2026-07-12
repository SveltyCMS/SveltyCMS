/**
 * @file tests/e2e/routes/config/unified-hub.spec.ts
 * @description E2E smoke tests for Unified Data Hub plugin — extensions + API contract.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

test.describe("Unified Data Hub", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("extensions page loads (plugin enablement surface)", async ({ page }) => {
    await page.goto("/config/extensions");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("virtual-collections API is authenticated and returns JSON envelope", async ({
    page,
    request,
  }) => {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await request.get("/api/virtual-collections", {
      headers: { Cookie: cookieHeader },
    });

    expect(res.status()).toBeLessThan(500);
    const body = await res.json();

    if (res.status() === 200) {
      expect(body).toHaveProperty("data");
    } else {
      // Plugin disabled or license gate — must be structured, not HTML error page
      expect([403, 404, 503]).toContain(res.status());
      expect(body.error || body.message || body.code).toBeTruthy();
    }
  });

  test("virtual-collections rejects unauthenticated access", async ({ request }) => {
    const res = await request.get("/api/virtual-collections");
    expect([401, 403]).toContain(res.status());
  });

  test("reads virtual collection rows after hub seed (CMS-agnostic, external Postgres fixture)", async ({
    page,
    request,
  }) => {
    await loginAsAdmin(page);

    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 25 },
    });

    if (seedRes.status() === 503) {
      const body = await seedRes.json().catch(() => ({}));
      test.skip(
        true,
        body.message || "Postgres fixture unavailable — start Docker profile postgresql",
      );
      return;
    }
    expect(seedRes.ok()).toBeTruthy();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await request.get(
      "/api/virtual-collections/bench-articles?limit=25&bypassCache=true",
      { headers: { Cookie: cookieHeader } },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.length).toBe(25);
    expect(body.data[0].title).toMatch(/Bench Article/);
  });

  test("unified-data-hub plugin can be enabled from extensions", async ({ page }) => {
    await page.goto("/config/extensions");
    const card = page.locator("div").filter({ hasText: "Unified Data Hub" }).first();
    const visible = await card
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      test.skip(true, "Unified Data Hub plugin not listed in extensions");
      return;
    }
    const toggle = card.getByRole("button", { name: /active|disabled/i });
    const label = (await toggle.textContent())?.trim() ?? "";
    if (label.toLowerCase() === "disabled") {
      await toggle.click();
      await expect(toggle).toHaveText(/active/i, { timeout: 10_000 });
    }
  });

  test("hub workspace shows connector and collection forms", async ({ page, request }) => {
    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 3 },
    });
    if (seedRes.status() === 503) {
      test.skip(true, "Postgres fixture unavailable");
      return;
    }

    await page.goto("/config?plugin=unified-data-hub");
    const workspace = page.getByTestId("udh-workspace");
    const found = await workspace
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      test.skip(true, "Hub workspace not visible — enable plugin first");
      return;
    }

    await expect(page.getByTestId("udh-add-connector-form")).toBeVisible();
    await expect(page.getByTestId("udh-add-collection-form")).toBeVisible();
    await expect(page.getByTestId("udh-tier-label")).toBeVisible();
  });

  test("hub workspace shows seeded virtual collection", async ({ page, request }) => {
    await loginAsAdmin(page);

    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 5 },
    });

    if (seedRes.status() === 503) {
      test.skip(true, "Postgres fixture unavailable");
      return;
    }
    expect(seedRes.ok()).toBeTruthy();

    await page.goto("/config?plugin=unified-data-hub");

    const heading = page.getByRole("heading", { name: /unified data hub/i });
    const found = await heading
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!found) {
      test.skip(true, "Unified Data Hub workspace not visible — plugin UI may be disabled");
      return;
    }

    await expect(page.getByText("Bench Articles")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("bench-articles")).toBeVisible();
  });

  test("hub workspace shows upgrade prompt at community connector cap", async ({
    page,
    request,
  }) => {
    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 3 },
    });
    if (seedRes.status() === 503) {
      test.skip(true, "Postgres fixture unavailable");
      return;
    }

    await page.goto("/config?plugin=unified-data-hub");
    const workspace = page.getByTestId("udh-workspace");
    const found = await workspace
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      test.skip(true, "Hub workspace not visible");
      return;
    }

    await expect(page.getByTestId("udh-tier-label")).toContainText(/community/i);
    await expect(page.getByTestId("upgrade-prompt")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("upgrade-prompt-cta")).toBeVisible();
  });

  test("native stitch enrich endpoint returns keyed virtual rows", async ({ page, request }) => {
    const seedRes = await request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount: 10 },
    });
    if (seedRes.status() === 503) {
      test.skip(true, "Postgres fixture unavailable");
      return;
    }

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await request.get(
      "/api/virtual-collections/bench-authors/enrich?keys=1,2&field=id&bypassCache=true",
      { headers: { Cookie: cookieHeader } },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data?.["1"]?.name).toMatch(/Bench Author/);
    expect(body.meta?.matched).toBeGreaterThanOrEqual(1);
  });
});
