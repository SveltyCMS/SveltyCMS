/**
 * @file tests/e2e/routes/config/unified-hub.spec.ts
 * @description Unified Data Hub E2E — always-on API/smoke + optional Postgres fixture suite.
 *
 * Postgres-dependent tests: hard-fail when REQUIRE_OPTIONAL_INFRA=true;
 * otherwise skip with [optional-infra:POSTGRES] only (not empty-install soft-skip).
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";
import { enablePlugin, handleOptionalInfraUnavailable } from "../../helpers/seed";

async function seedHub(request: APIRequestContext, rowCount = 25) {
  return request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "seed-unified-data-hub", fixture: "postgres", rowCount },
  });
}

/** Require Postgres UDH seed or optional-infra skip/hard-fail. */
async function requireHubSeed(request: APIRequestContext, rowCount: number) {
  const seedRes = await seedHub(request, rowCount);
  if (seedRes.status() === 503) {
    const body = await seedRes.json().catch(() => ({}));
    handleOptionalInfraUnavailable(
      "POSTGRES",
      body.message || "Postgres UDH fixture unavailable — docker compose --profile postgresql",
      (cond, desc) => test.skip(cond, desc),
    );
    return null;
  }
  expect(seedRes.ok(), `seed-unified-data-hub failed: ${seedRes.status()}`).toBeTruthy();
  return seedRes;
}

test.describe("Unified Data Hub — always-on", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("extensions page loads", async ({ page }) => {
    await page.goto("/config/extensions");
    await expect(
      page
        .getByTestId("extensions-page")
        .or(page.getByRole("heading", { level: 1 }))
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("virtual-collections API returns structured envelope", async ({ page, request }) => {
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
      expect([403, 404, 503]).toContain(res.status());
      expect(body.error || body.message || body.code).toBeTruthy();
    }
  });

  test("virtual-collections rejects unauthenticated access", async ({ request }) => {
    const res = await request.get("/api/virtual-collections");
    expect([401, 403]).toContain(res.status());
  });

  test("unified-data-hub can be enabled (enable-plugin or UI)", async ({ page }) => {
    try {
      await enablePlugin(page, "unified-data-hub", true);
    } catch {
      // Plugin may not be registered — fall through to UI hard assert
    }
    await page.goto("/config/extensions");
    await expect(
      page
        .getByTestId("extensions-page")
        .or(page.getByRole("heading", { level: 1 }))
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    const card = page
      .getByTestId("plugin-card-unified-data-hub")
      .or(page.locator("[data-plugin-id='unified-data-hub']"))
      .or(page.locator("div").filter({ hasText: "Unified Data Hub" }).first());
    await expect(
      card.first(),
      "Unified Data Hub plugin must be registered in this install",
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Unified Data Hub — Postgres fixture", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("reads virtual collection rows after hub seed", async ({ page, request }) => {
    await requireHubSeed(request, 25);

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

  test("hub workspace shows connector and collection forms", async ({ page, request }) => {
    await requireHubSeed(request, 3);
    try {
      await enablePlugin(page, "unified-data-hub", true);
    } catch {
      /* may already be on */
    }

    await page.goto("/config?plugin=unified-data-hub");
    await expect(page.getByTestId("udh-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("udh-add-connector-form")).toBeVisible();
    await expect(page.getByTestId("udh-add-collection-form")).toBeVisible();
    await expect(page.getByTestId("udh-tier-label")).toBeVisible();
  });

  test("hub workspace shows seeded virtual collection", async ({ page, request }) => {
    await requireHubSeed(request, 5);
    try {
      await enablePlugin(page, "unified-data-hub", true);
    } catch {
      /* */
    }

    await page.goto("/config?plugin=unified-data-hub");
    await expect(page.getByRole("heading", { name: /unified data hub/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Bench Articles")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("bench-articles")).toBeVisible();
  });

  test("hub workspace shows upgrade prompt at community connector cap", async ({
    page,
    request,
  }) => {
    await requireHubSeed(request, 3);
    try {
      await enablePlugin(page, "unified-data-hub", true);
    } catch {
      /* */
    }

    await page.goto("/config?plugin=unified-data-hub");
    await expect(page.getByTestId("udh-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("udh-tier-label")).toContainText(/community/i);
    await expect(page.getByTestId("upgrade-prompt")).toBeVisible({ timeout: 10_000 });
  });

  test("native stitch enrich endpoint returns keyed virtual rows", async ({ page, request }) => {
    await requireHubSeed(request, 10);

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
