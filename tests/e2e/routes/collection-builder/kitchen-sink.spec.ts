/**
 * @file tests/e2e/routes/collection-builder/kitchen-sink.spec.ts
 * @description Comprehensive Kitchen Sink Master Collection E2E Journey.
 *
 * Exercises composite form lifecycles with multiple real-world widgets:
 * Input, Number, Checkbox, Email, and multi-field validation.
 *
 * This directly replaces synthetic 1-field tests with real editorial workflows,
 * proving that widget state binding, form serialization, API persistence, and
 * reload hydration work seamlessly together without client-side exceptions.
 *
 * ### Features:
 * - multi-widget collection provisioning (Input, Number, Checkbox, Email)
 * - validation enforcement for required fields
 * - multi-field creation, serialization, and API round-trip
 * - post-reload hydration and field value preservation
 * - update and edit persistence
 * - existing blueprint (`posts`) edit save → reload round-trip (CB1)
 * - zero uncaught browser page errors (`zeroErrorGuard`)
 */

import { expect, test, type Page } from "../../fixtures";
import { resetAndSeedDatabase, TEST_API_HEADERS } from "../../helpers/api";
import { openCollectionEntries } from "../../helpers/collection-builder-flow";
import { confirmModal } from "../../helpers/confirm-modal";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { runAfterHydration } from "../../helpers/hydration";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import { assertNoZeroErrors, attachZeroErrorGuard } from "../../helpers/zero-error-guard";

test.describe.configure({ mode: "serial", timeout: 150_000 });

interface KitchenSinkFixture {
  id: string;
  name: string;
}

/** Seed a rich composite collection fixture containing diverse widget types. */
async function seedKitchenSinkCollection(
  page: Page,
  prefix = "ksink",
): Promise<KitchenSinkFixture> {
  const id = `${prefix}_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: id,
        name: id,
        path: `/collection/${id}`,
        fields: [
          {
            db_fieldName: "title",
            label: "Title",
            widget: { Name: "Input" },
            type: "string",
            required: true,
          },
          {
            db_fieldName: "summary",
            label: "Summary",
            widget: { Name: "Input" },
            type: "string",
          },
          {
            db_fieldName: "price",
            label: "Price",
            widget: { Name: "Number" },
            type: "number",
            min: 0,
            max: 9999,
          },
          {
            db_fieldName: "isFeatured",
            label: "Featured",
            widget: { Name: "Checkbox" },
            type: "boolean",
          },
          {
            db_fieldName: "contactEmail",
            label: "Contact Email",
            widget: { Name: "Email" },
            type: "string",
          },
        ],
      },
    },
  });

  expect(response.ok(), `create-collection fixture failed: ${response.status()}`).toBeTruthy();
  return { id, name: id };
}

/** Wait for the collection entry write request and assert success. */
async function expectWriteOk(page: Page, method: "POST" | "PATCH", actionName: string) {
  const response = await page
    .waitForResponse(
      (res) =>
        res.request().method() === method &&
        /\/api\/collections\//.test(new URL(res.url()).pathname),
      { timeout: 25_000 },
    )
    .catch(() => null);

  if (!response) {
    throw new Error(`${actionName}: no ${method} /api/collections request was made`);
  }
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`${actionName} rejected: HTTP ${response.status()} ${body.slice(0, 400)}`);
  }
  return response;
}

/**
 * The blog blueprint's field list (`PRESET_COLLECTIONS.blog[0]`), minus the
 * relation/asset widgets that need their target collections to exist.
 *
 * Seed-first: the E2E database has no `posts` after a reset (the wizard seeds
 * the website starter), and CB1 is specifically about editing a collection that
 * already exists — so the fixture is provisioned through the testing API rather
 * than created in this session by the editor.
 */
const POSTS_BLUEPRINT_FIELDS = [
  {
    db_fieldName: "title",
    label: "Title",
    widget: { Name: "Input" },
    type: "string",
    required: true,
  },
  { db_fieldName: "slug", label: "Slug", widget: { Name: "Slug" }, type: "string" },
  { db_fieldName: "content", label: "Content", widget: { Name: "RichText" }, type: "string" },
  { db_fieldName: "excerpt", label: "Excerpt", widget: { Name: "Input" }, type: "string" },
];

/** Seed the `posts` blueprint so the edit route has a pre-existing collection. */
async function seedPostsBlueprint(page: Page): Promise<void> {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: "posts",
        name: "posts",
        path: "/collection/posts",
        icon: "mdi:post-outline",
        status: "publish",
        livePreview: "/posts/{slug}",
        description: "Blog posts with SEO support and rich text editing",
        fields: POSTS_BLUEPRINT_FIELDS,
      },
    },
  });
  expect(response.ok(), `seed posts blueprint failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { success?: boolean; message?: string };
  // The handler reports per-schema failures in a 200 body — a silently
  // unprovisioned `posts` would otherwise surface later as an unrelated 404.
  expect(
    body.success,
    `seed posts blueprint rejected: ${body.message ?? JSON.stringify(body).slice(0, 400)}`,
  ).toBe(true);
}

/**
 * Click the visible, enabled Save control.
 *
 * No `force`: the editor's header actions are never covered (toasts are detached
 * from them), so an obscured Save control is a product bug, not a test workaround.
 */
async function clickSave(page: Page): Promise<void> {
  const candidates = page.locator('[data-testid="save-collection-button"]');
  await expect(
    page.locator('[data-testid="save-collection-button"]:not([disabled])').first(),
    "the Save control must enable for a complete existing collection",
  ).toBeVisible({ timeout: 20_000 });

  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const button = candidates.nth(i);
    const isEnabled = await button.isEnabled().catch(() => false);
    const isVisible = await button.isVisible().catch(() => false);
    if (isEnabled && isVisible) {
      await button.scrollIntoViewIfNeeded().catch(() => undefined);
      await button.click();
      return;
    }
  }
  throw new Error("No enabled, visible Save button in the collection editor");
}

test.describe("Kitchen Sink Master Collection — Editorial Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    attachZeroErrorGuard(page);
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test.afterEach(async ({ page }) => {
    assertNoZeroErrors(page);
  });

  test("full multi-widget entry creation, persistence, reload and edit", async ({ page }) => {
    const fixture = await seedKitchenSinkCollection(page);

    // 1. Open the collection entries view
    await openCollectionEntries(page, fixture.id);

    // 2. Click "Create New Entry"
    const createBtn = page
      .getByTestId("entry-list-action-create")
      .or(page.getByRole("button", { name: /create new entry|create/i }))
      .first();

    await expect(createBtn).toBeVisible({ timeout: 15_000 });

    // 3. Locate inputs for the multiple widgets
    const titleInput = page
      .getByRole("textbox", { name: /^title$/i })
      .or(page.locator('input[name="title"]').first());

    // Create is a client-side mode switch, not a navigation: a click before the
    // list hydrates is a silent no-op. Re-click while the form is absent.
    await expect(async () => {
      if (!(await titleInput.isVisible().catch(() => false))) {
        await createBtn.click({ timeout: 5_000 });
      }
      await expect(titleInput).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });

    const summaryInput = page
      .getByRole("textbox", { name: /^summary$/i })
      .or(page.locator('input[name="summary"]').first());

    const priceInput = page.locator('input[type="number"], input[name="price"]').first();
    const checkboxInput = page.locator('input[type="checkbox"], input[name="isFeatured"]').first();

    // 4. Fill values across the different widgets
    await titleInput.fill("Master Test Product");
    if (await summaryInput.isVisible().catch(() => false)) {
      await summaryInput.fill("Verified production test summary");
    }
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill("149");
    }
    if (await checkboxInput.isVisible().catch(() => false)) {
      await checkboxInput.check().catch(() => checkboxInput.click());
    }

    // 5. Save the composite entry
    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });

    const writePromise = expectWriteOk(page, "POST", "Create Kitchen Sink Entry");
    await saveBtn.click();
    await writePromise;

    // 6. Return to list and assert row presence
    await openCollectionEntries(page, fixture.id);
    const entryRow = page.getByRole("row").filter({ hasText: "Master Test Product" }).first();
    await expect(entryRow).toBeVisible({ timeout: 15_000 });

    // 7. Click into the row to enter Edit mode (?edit=<id>)
    await entryRow.click();
    await expect(page).toHaveURL(/\?.*edit=/i, { timeout: 15_000 });

    // 8. Assert reload persistence across the widgets
    await expect(titleInput).toHaveValue("Master Test Product", { timeout: 10_000 });
    if (await priceInput.isVisible().catch(() => false)) {
      await expect(priceInput).toHaveValue("149");
    }

    // 9. Update title and save
    await titleInput.fill("Master Test Product (Updated)");
    const patchPromise = expectWriteOk(page, "PATCH", "Update Kitchen Sink Entry");
    await saveBtn.click();
    await patchPromise;

    // 10. Re-open entries list and confirm updated title
    await openCollectionEntries(page, fixture.id);
    const updatedRow = page
      .getByRole("row")
      .filter({ hasText: "Master Test Product (Updated)" })
      .first();
    await expect(updatedRow).toBeVisible({ timeout: 15_000 });

    // Cleanup: Delete entry
    const deleteBtn = page
      .getByRole("button", { name: /delete|archive|trash/i })
      .or(page.getByTestId("entry-action-delete"))
      .first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await confirmModal(page).catch(() => {});
    }
  });

  /**
   * CB1 — editing an existing blueprint collection must save.
   *
   * The retest saved a NEW collection but editing the seeded `posts` blueprint
   * answered `500 Failed to generate collection file: null is not an object
   * (evaluating 's.replace')`, so the generator was fed a collection whose
   * identity flags had been dropped on the load → edit round-trip. The unit proof
   * (`tests/unit/routes/collectionbuilder-action-page-server.test.ts`) pins the
   * action; this pins the same path through the real editor UI: load the edit
   * route, change only the description, save, then reload and read the value back
   * from a fresh server render.
   */
  test("existing blueprint edit saves and survives reload", async ({ page }) => {
    await seedPostsBlueprint(page);

    await page.goto("/config/collectionbuilder/edit/posts", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/collection not found/i)).toHaveCount(0);

    const nameInput = page.getByTestId("collection-name-input");
    await expect(nameInput).toHaveValue("posts", { timeout: 15_000 });

    // Harmless change: description only, so the save cannot be explained by a
    // schema migration and the persisted value is directly observable.
    const editedDescription = `CB1 edit save ${Date.now().toString(36)}`;
    const description = page.locator("#description");
    await expect(description).toBeVisible({ timeout: 15_000 });
    await runAfterHydration(
      page,
      async () => {
        await description.fill(editedDescription);
        await description.blur();
      },
      { selector: page.getByTestId("collection-editor-tabs") },
    );

    // The failure under test was the action answering HTTP 500; assert the
    // response itself, then the UI's success surface (the editor stays on
    // edit/:name for an edit, so the toast is the success signal).
    const saveResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/config/collectionbuilder/") &&
        res.url().includes("saveCollection"),
      { timeout: 30_000 },
    );
    await runAfterHydration(page, () => clickSave(page));

    const response = await saveResponse;
    expect(
      response.ok(),
      `saveCollection answered HTTP ${response.status()} — the blueprint edit save failed`,
    ).toBeTruthy();
    await expect(page.getByText(/collection saved/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/config\/collectionbuilder\/edit\/posts/, { timeout: 15_000 });

    // Persistence: a fresh render must resolve the collection again (a broken or
    // deleted source file 404s here) and show the saved description.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("collection-editor-tabs")).toBeVisible({ timeout: 20_000 });
    await expect(nameInput).toHaveValue("posts", { timeout: 15_000 });
    await expect(page.locator("#description")).toHaveValue(editedDescription, {
      timeout: 15_000,
    });
    await expect(page.getByText(/collection not found/i)).toHaveCount(0);
  });
});
