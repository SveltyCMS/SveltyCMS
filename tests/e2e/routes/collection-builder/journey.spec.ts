import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page, request }) => {
    // 1. Authentication
    await loginAsAdmin(page);
    await expect(page.getByText("Dashboard")).toBeVisible();

    // 2. Create a New Collection via editor
    const collectionName = `JourneyProj_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new");
    await expect(page.getByTestId("collection-name-input")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("collection-name-input").fill(collectionName);

    // 3. Configure Collection Fields (GUI)
    await page.getByRole("button", { name: /field configuration/i }).click();
    await page.getByTestId("quick-add-text").click();
    await expect(page.getByTestId("widget-fields-list")).toContainText(/new text/i, {
      timeout: 10_000,
    });

    // 4. Save & Compile Schema
    await page.getByTestId("save-collection-button").click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({ timeout: 15_000 });

    // 6. Create an Entry in the New Collection
    // Navigate to the newly created collection page
    await page.goto(`/en/Collections/${collectionName}`);
    await page.getByRole("button", { name: /create new/i }).click();

    // Fill the dynamically generated text field
    await page.getByLabel(/new text/i).fill("The TQA Project");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("The TQA Project")).toBeVisible();

    // 7. Verify API Output (Public Interface)
    const apiRes = await request.get(`/api/collections/${collectionName}`);
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    const entry = body.data.find((e: any) => e.new_text === "The TQA Project");

    expect(entry).toBeDefined();
    expect(entry.status).toBe("unpublish"); // Default status

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
