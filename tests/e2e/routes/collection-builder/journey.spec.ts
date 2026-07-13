import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

/**
 * @file tests/e2e/master-behavioral-journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 */

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page }) => {
    // 1. Authentication
    // Note: login redirects to the first existing collection (e.g. /en/Names),
    // not /config/collectionbuilder, so we only assert the login succeeded.
    await loginAsAdmin(page);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // 2. Create a New Collection via editor
    const collectionName = `JourneyProj_${Date.now()}`;
    await page.goto("/config/collectionbuilder/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("collection-name-input")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("collection-name-input").fill(collectionName);

    // 3. Configure Collection Fields (GUI) — switch to the Widgets & Fields tab
    await page.getByTestId("tab-widgets").click();
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

    // 6. Create an Entry in the New Collection
    // Navigate to the newly created collection page.
    // The collection content route is /[language]/[...collection], and the
    // builder stores collections with canonical path "/collection/<slug>"
    // (slug = name lowercased, spaces→underscores). So the public URL is
    // /en/collection/<slug> — NOT /en/<name> (that resolves to collection
    // path "/<name>" which doesn't exist → 404 → builder).
    const collectionSlug = collectionName.toLowerCase().replace(/ /g, "_");
    await page.goto(`/en/collection/${collectionSlug}`);
    // The entry-list multi-button's create action is labeled "Create"
    // (paraglide: entrylist_multibutton_create), not "Create New".
    // The accessible name lives on an inner <Button> that has
    // `pointer-events-none`; the click handler is on the wrapping div, so
    // Playwright's actionability check flags the wrapper as intercepting.
    // Use force to dispatch the click, which bubbles to the wrapper handler.
    await page.getByRole("button", { name: /^create$/i }).click({ force: true });

    // Fill the dynamically generated text field (Input widget → label "New Input").
    // Use the textbox role to avoid matching the "Insert token into New Input" button.
    await page.getByRole("textbox", { name: "New Input" }).fill("The TQA Project");
    await page.getByRole("button", { name: /save/i }).first().click();
    // After save we land back on the collection list. The list truncates the
    // entry value to an initial ("T") in narrow cells, so we cannot match the
    // full text. Instead assert a data row is present; the API check below
    // verifies the entry content.
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: /unpublish/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // 7. Verify API Output (Public Interface)
    // The collection _id is the slug (name lowercased, spaces→underscores),
    // so query the API with the slug — not the raw display name.
    // Use `page.request` (not the standalone `request` fixture) so the call
    // shares the logged-in session cookies; otherwise the API returns 401.
    // Pass `publicationFilter=all` so unpublished entries (the default status
    // for a freshly created entry) are returned — the default filter can
    // exclude them, and the builder project runs serially against one DB so
    // prior tests can leave the publication default in a non-"all" state.
    // `bypassCache=true` avoids a stale empty cache from a prior test.
    const apiRes = await page.request.get(
      `/api/collections/${collectionSlug}?publicationFilter=all&bypassCache=true`,
    );
    expect(apiRes.ok()).toBeTruthy();

    const body = await apiRes.json();
    // Input widget key is "Input" → db_fieldName is "new_input".
    // The field value may be a plain string OR a localized object
    // `{ <locale>: value }` depending on whether per-field content
    // localization is enabled — which a prior test in this project can toggle.
    // Handle both forms.
    const entry = (body.data ?? []).find((e: any) => {
      const v = e.new_input;
      const text = typeof v === "string" ? v : (v?.en ?? v?.[Object.keys(v ?? {})[0]]);
      return text === "The TQA Project";
    });

    expect(entry).toBeDefined();
    expect(entry.status).toBe("unpublish"); // Default status

    console.log("✅ Master Behavioral Journey Completed Successfully.");
  });
});
