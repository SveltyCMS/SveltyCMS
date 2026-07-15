/**
 * @file tests/e2e/routes/collection-builder/journey.spec.ts
 * @description TQA Pillar 1: Comprehensive behavioral journey test.
 * Simulates the full lifecycle: Builder -> Schema -> Entry -> API.
 * Uses shared collection-builder-flow helpers for stable selectors.
 */

import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import {
  addInputField,
  openNewCollectionEditor,
  saveCollectionSchema,
  uniqueCollectionFixture,
} from "../../helpers/collection-builder-flow";

test.describe("Master Behavioral Journey", () => {
  test("Full Lifecycle: Builder -> Schema -> Entry -> API", async ({ page }) => {
    // 1. Authentication
    await loginAsAdmin(page);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    // 2–4. New collection + field + save (shared helpers / test ids)
    const fixture = uniqueCollectionFixture("JourneyProj");
    await openNewCollectionEditor(page);
    await page.getByTestId("collection-name-input").fill(fixture.name);
    await addInputField(page, { label: "New Input", fieldName: "new_input" });
    await saveCollectionSchema(page);

    // 5. Create an Entry in the New Collection
    // Public URL is /en/collection/<slug> (slug = name lowercased).
    const collectionSlug = fixture.slug;
    await page.goto(`/en/collection/${collectionSlug}`, { waitUntil: "domcontentloaded" });

    // Create button: prefer test id, force-click role fallback (pointer-events on inner Button)
    const createByTestId = page.getByTestId("entry-list-action-create");
    if (await createByTestId.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await createByTestId.click();
    } else {
      await page.getByRole("button", { name: /^create$/i }).click({ force: true });
    }

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
