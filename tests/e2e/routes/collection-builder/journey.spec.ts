import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page, request }) => {
    test.setTimeout(120_000);
    // Block external icon API requests that cause CORS errors with test headers
    await page.route("https://api.iconify.design/**", (route) => route.abort());
    await page.route("https://api.simplesvg.com/**", (route) => route.abort());
    await page.route("https://api.unisvg.com/**", (route) => route.abort());

    // 1. Authentication
    await loginAsAdmin(page);

    // 2. Create a New Collection via editor
    const collectionName = `JourneyProj_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new");
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("collection-name-input").fill(collectionName);
    // Blur the input to trigger form sync
    await page.getByTestId("collection-name-input").blur();
    // Wait for Database ID to update to ensure form data synced to collection store
    const expectedDbName = collectionName.toLowerCase().replace(/ /g, "_");
    await expect(page.getByText(expectedDbName).first()).toBeVisible({ timeout: 5000 });
    // Additional wait for Svelte reactivity to fully update collection store
    await page.waitForTimeout(2000);

    // 3. Configure Collection Fields (GUI)
    await expect(page.getByTestId("collection-editor-stepper")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /field configuration/i }).click();
    // Wait for form sync after step change
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("quick-add-input")).toBeVisible({ timeout: 10_000 });
    // Wait for widget store to initialize, then click quick-add with retry
    let fieldAdded = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(3000);
      await page.getByTestId("quick-add-input").click();
      try {
        await expect(page.getByTestId("widget-fields-list")).toContainText(/new input/i, {
          timeout: 5000,
        });
        fieldAdded = true;
        break;
      } catch {
        console.log(`[Journey] Widget not added on attempt ${i + 1}, retrying...`);
      }
    }
    if (!fieldAdded) {
      throw new Error("Failed to add text widget after 3 attempts");
    }

    // 4. Save & Compile Schema
    // Wait before save to ensure collection store is fully updated
    await page.waitForTimeout(1000);
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({ timeout: 15_000 });
    // Wait for contentSystem.refresh() to create the DB table (increased from 5s to 10s)
    await page.waitForTimeout(10000);

    // 6. Create an Entry in the New Collection
    // Navigate to the newly created collection page (with retry)
    let collectionPageLoaded = false;
    for (let i = 0; i < 3; i++) {
      await page.goto(`/en/collection/${collectionName}`);
      try {
        await expect(page.getByRole("button", { name: /create/i }).first()).toBeVisible({
          timeout: 10_000,
        });
        collectionPageLoaded = true;
        break;
      } catch {
        console.log(`[Journey] Collection page not ready on attempt ${i + 1}, retrying...`);
        await page.waitForTimeout(3000);
      }
    }
    if (!collectionPageLoaded) {
      throw new Error(`Collection page for ${collectionName} did not load after 3 attempts`);
    }
    await page
      .getByRole("button", { name: /create/i })
      .first()
      .click();

    // Fill the dynamically generated text field
    await page.getByRole("textbox", { name: /new input/i }).fill("The TQA Project");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page.getByText(/Showing 1.*1 items/i)).toBeVisible({ timeout: 15_000 });

    // 7. Verify API Output (Public Interface)
    const apiRes = await page.request.get(`/api/collections/${collectionName}`);
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    const entry = body.data.find((e: any) => e.new_input === "The TQA Project");

    expect(entry).toBeDefined();
    expect(entry.status).toBe("unpublish"); // Default status

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
