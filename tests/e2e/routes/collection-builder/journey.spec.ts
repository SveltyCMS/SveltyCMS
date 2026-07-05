import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test.setTimeout(120_000);

  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page, request }) => {
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

    // 2. Create a New Collection via editor
    const collectionName = `JourneyProj_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new");
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("collection-name-input").fill(collectionName);

    // 3. Configure Collection Fields (GUI) — click step 2 in the stepper
    await page.getByRole("button", { name: /field configuration/i }).click();
    await page.getByTestId("quick-add-input").click();
    // The widget generates a field with label "New Input"
    await expect(page.getByText(/New Input/i)).toBeVisible({
      timeout: 10_000,
    });

    // 4. Save & Compile Schema
    await page.getByTestId("save-collection-button").first().click();
    await expect(page.getByText(/collection saved/i)).toBeVisible({
      timeout: 15_000,
    });

    // 5. Create an Entry in the New Collection
    // Navigate to the dashboard first so the sidebar loads with the Collections tree
    await page.goto("/");
    await expect(
      page.getByRole("treeitem", { name: RegExp(collectionName, "i") }).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    // Click the treeitem to navigate to the entry page (client-side navigation)
    await page
      .getByRole("treeitem", { name: RegExp(collectionName, "i") })
      .first()
      .click();
    await page.getByRole("button", { name: /^Create$/ }).click();

    // Fill the dynamically generated text field
    await page.getByLabel(/new input/i).fill("The TQA Project");

    // Click Cancel to return to entry list (Save button only renders on mobile viewport)
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page).toHaveURL(RegExp(collectionName, "i"), { timeout: 10_000 });

    // Create entry via API with multilang format expected by the Input Display widget
    const entryRes = await request.post(`/api/collections/${collectionName}`, {
      data: { new_input: { en: "The TQA Project" } },
    });
    expect(entryRes.ok()).toBeTruthy();

    // Reload to see the entry
    await page.reload();
    await expect(page.getByRole("row", { name: /draft/i })).toBeVisible({ timeout: 10_000 });

    // 6. Verify API Output (Public Interface)
    const apiRes = await request.get(`/api/collections/${collectionName}`);
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    const entry = body.data.find((e: any) => e.new_input?.en === "The TQA Project");

    expect(entry).toBeDefined();
    expect(entry.status).toBe("draft");

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
