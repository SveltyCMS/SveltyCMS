import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/test-api";

/**
 * @file tests/e2e/routes/collection-builder/journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 *
 * ### Parallel Worker Safety:
 * - Each worker uses a unique collection name (worker index + timestamp)
 * - All state is self-contained within the test
 */

test.describe("Master Behavioral Journey", () => {
  test.setTimeout(120_000);

  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page }, testInfo) => {
    // Inject E2E flag for synchronous widget init
    await page.addInitScript(() => {
      (window as any).__SVELTYCMS_E2E__ = true;
    });

    // 1. Authentication
    await loginAsAdmin(page);
    await page.goto("/config/collectionbuilder");
    await expect(
      page.getByRole("heading", { level: 1, name: /collection builder/i }),
    ).toBeVisible();

    // 2. Create a New Collection via editor (worker-unique name for parallel safety)
    const collectionName = `JourneyProj_${testInfo.workerIndex}_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new");
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("collection-name-input").fill(collectionName);

    // 3. Configure Collection Fields (GUI) — click step 2 in the stepper
    await page.getByRole("button", { name: /field configuration/i }).click();
    await page.getByTestId("quick-add-input").click();
    await expect(page.getByText(/New Input/i)).toBeVisible({
      timeout: 10_000,
    });

    // 4. Save & Compile Schema
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({
      timeout: 15_000,
    });

    // 5. Navigate to the collection entry list page
    const collectionSlug = collectionName.toLowerCase().replace(/[^a-z0-9_]/g, "");
    await page.goto(`/en/collection/${collectionSlug}?bypassCache=true&_t=${Date.now()}`);
    await expect(page.getByRole("heading", { name: RegExp(collectionName, "i") })).toBeVisible({
      timeout: 15_000,
    });

    // 6. Create entry via public REST API with multilang format
    const entryRes = await page.request.post(`/api/collections/${collectionName}`, {
      data: { new_input: { en: "The TQA Project" } },
    });
    console.log(`POST /api/collections/${collectionName}: status=${entryRes.status()}`);
    expect(entryRes.ok()).toBeTruthy();

    // 7. Force cache invalidation via Testing API so the entry list picks up the new entry
    const invRes = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "increment-cache-version",
        collectionId: collectionName,
      },
    });
    console.log(`POST /api/testing (increment-cache-version): status=${invRes.status()}`);

    // 8. Navigate directly to the entry list with full cache bypass
    await page.goto(`/en/collection/${collectionSlug}?bypassCache=true&_t=${Date.now()}`);
    await expect(page.getByRole("heading", { name: RegExp(collectionName, "i") })).toBeVisible({
      timeout: 15_000,
    });

    // Wait for the entry row to appear (use polling in case of async rendering)
    await expect(page.getByText("The TQA Project").first()).toBeVisible({ timeout: 15_000 });

    // 9. Verify API Output (via Testing API)
    const apiRes = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "list-entries",
        collectionId: collectionName,
      },
    });
    console.log(`POST /api/testing (list-entries): status=${apiRes.status()}`);
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    // SDK response wraps in { data: [...], meta: {...} }
    const entries = body.data?.data ?? body.data ?? [];
    const entry = entries.find((e: any) => e.new_input?.en === "The TQA Project");

    expect(entry).toBeDefined();
    expect(entry.status).toBe("draft");

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
