/**
 * @file tests/e2e/routes/collection-builder/content-entries.spec.ts
 * @description Entry lifecycle E2E for the collection admin route
 * (`/<lang>/collection/<slug>`) — the surface behind the reported failures:
 *
 * | Reported symptom                                   | Pinned here |
 * | -------------------------------------------------- | ----------- |
 * | `?edit=<id>` shows the 500 "System Error" boundary | edit round-trip test |
 * | edit saves are lost / list not refreshed           | edit round-trip test (reload + API) |
 * | delete shows a toast but nothing is removed        | archive round-trip (reload + absent) |
 * | entry-list search input cannot be typed into       | search typing + filtered outcome |
 * | error boundary actions should be outline           | 404 recovery-action test |
 *
 * The collection fixture is seeded through `POST /api/testing`
 * (`create-collection`) — the builder UI chrome itself is covered by
 * `builder.spec.ts`; this spec owns the entry surface only.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E | this file (entry CRUD + search + error boundary) |
 * | Integration | `tests/integration/routes/collection-page-load.test.ts` (SSR `?edit=`) |
 * | Unit | `tests/unit/utils/error-display.test.ts` (error copy rules) |
 */

import { expect, test, type Page } from "@playwright/test";
import { resetAndSeedDatabase, TEST_API_HEADERS } from "../../helpers/api";
import {
  collectionSlugCandidates,
  openCollectionEntries,
} from "../../helpers/collection-builder-flow";
import { confirmModal } from "../../helpers/confirm-modal";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";

test.describe.configure({ mode: "serial", timeout: 150_000 });

interface CollectionFixture {
  id: string;
  name: string;
}

const TITLE_INPUT = /^title$/i;

function entryTitleBox(page: Page) {
  return page
    .getByRole("textbox", { name: TITLE_INPUT })
    .or(page.locator('input[name="title"], textarea[name="title"]').first())
    .first();
}

/** Seed a real collection (physical model + content node) via the testing API. */
async function seedCollectionFixture(page: Page, prefix: string): Promise<CollectionFixture> {
  const id = `${prefix}${Date.now().toString(36)}`;
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: id,
        name: id,
        // Explicit `/collection/…` path — the reported admin URL shape.
        path: `/collection/${id}`,
        fields: [
          { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
        ],
      },
    },
  });
  expect(response.ok(), `create-collection fixture failed: ${response.status()}`).toBeTruthy();
  return { id, name: id };
}

/** Wait for the next collections write (POST create / PATCH update) and assert it succeeded. */
async function expectWriteOk(page: Page, method: "POST" | "PATCH", action: string) {
  const response = await page
    .waitForResponse(
      (res) =>
        res.request().method() === method &&
        /\/api\/collections\//.test(new URL(res.url()).pathname),
      { timeout: 25_000 },
    )
    .catch(() => null);
  if (!response) {
    throw new Error(
      `${action}: no ${method} /api/collections request was made (click had no effect)`,
    );
  }
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`${action} rejected: HTTP ${response.status()} ${body.slice(0, 400)}`);
  }
  return response;
}

/** Create an entry through the admin UI (asserts the API write) and return to the list. */
async function createEntryViaUi(page: Page, title: string): Promise<void> {
  const createBtn = page
    .getByTestId("entry-list-action-create")
    .or(page.getByRole("button", { name: /create new entry|create/i }))
    .first();
  const titleBox = entryTitleBox(page);

  await expect(async () => {
    if (!(await titleBox.isVisible().catch(() => false))) {
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click({ timeout: 2_000 }).catch(() => {});
      }
    }
    await expect(titleBox).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 25_000, intervals: [1_000, 2_000] });

  await titleBox.click();
  await titleBox.fill(title);
  await titleBox.blur();

  const saveBtn = page.getByRole("button", { name: /save/i }).first();
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 });

  const write = expectWriteOk(page, "POST", `Create "${title}"`);
  await saveBtn.click();
  await write;

  // SPA may need a frame to leave create mode; the next openCollectionEntries()
  // re-renders from SSR, so no URL race is required here.
  await expect
    .poll(async () => page.url().includes("create="), { timeout: 20_000 })
    .toBe(false)
    .catch(() => undefined);
}

/** API truth for a collection fixture (never asserts against the UI cache). */
async function fetchEntries(page: Page, fixture: CollectionFixture) {
  for (const id of collectionSlugCandidates(fixture.id)) {
    const res = await page.request.get(
      `/api/collections/${id}?publicationFilter=all&bypassCache=true&limit=100`,
    );
    if (!res.ok()) continue;
    const body = await res.json().catch(() => ({}));
    const rows = Array.isArray(body?.data)
      ? body.data
      : Array.isArray(body?.data?.items)
        ? body.data.items
        : [];
    return rows as Array<Record<string, unknown>>;
  }
  return [] as Array<Record<string, unknown>>;
}

function titlesIn(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((row) => {
    const value = row.title ?? (row.data as Record<string, unknown> | undefined)?.title;
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return String(Object.values(value as Record<string, unknown>)[0] ?? "");
    }
    return "";
  });
}

test.describe("Collection entries (edit / delete / search / error boundary)", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test("edit: row click loads ?edit= without the error boundary and the save persists", async ({
    page,
  }) => {
    const fixture = await seedCollectionFixture(page, "entryedit");
    await openCollectionEntries(page, fixture.id);
    await createEntryViaUi(page, "Edit Me");

    // --- Enter edit mode through the row (the reported ?edit= URL) ---
    await expect(async () => {
      await openCollectionEntries(page, fixture.id);
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: /edit me/i })
          .first(),
      ).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });

    await page
      .getByRole("row")
      .filter({ hasText: /edit me/i })
      .first()
      .click();
    await expect(page).toHaveURL(/[?&]edit=/, { timeout: 10_000 });

    // The error boundary must not take over the reported edit URL.
    await expect(page.getByRole("heading", { name: /system error|access denied/i })).toHaveCount(0);
    await expect(page.getByText(/HTTP 500/)).toHaveCount(0);

    const titleBox = entryTitleBox(page);
    await expect(titleBox).toBeVisible({ timeout: 15_000 });
    await expect(titleBox).toHaveValue("Edit Me", { timeout: 15_000 });

    // Regression: a full document reload while in ?edit= must rehydrate the
    // collection store from SSR data. Before this guard the page fell back to
    // the "Collection Not Loaded" error block on reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/collection not loaded/i)).toHaveCount(0, { timeout: 10_000 });
    await expect(entryTitleBox(page)).toBeVisible({ timeout: 15_000 });
    await expect(entryTitleBox(page)).toHaveValue("Edit Me", { timeout: 15_000 });

    await titleBox.click();
    await titleBox.fill("Edited Entry");
    await titleBox.blur();

    const saveBtn = page.getByRole("button", { name: /save/i }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
    const write = expectWriteOk(page, "PATCH", "Edit save");
    await saveBtn.click();
    await write;

    // --- Persistence: reload the list AND read the API ---
    await expect(async () => {
      await openCollectionEntries(page, fixture.id);
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: /edited entry/i })
          .first(),
      ).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });

    await expect(async () => {
      const titles = titlesIn(await fetchEntries(page, fixture));
      expect(titles, `API titles: ${JSON.stringify(titles)}`).toContain("Edited Entry");
      expect(titles).not.toContain("Edit Me");
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });
  });

  test("delete: bulk delete removes the row for real (no false-success toast)", async ({
    page,
  }) => {
    const fixture = await seedCollectionFixture(page, "entrydel");
    await openCollectionEntries(page, fixture.id);
    await createEntryViaUi(page, "Delete Me");

    await expect(async () => {
      await openCollectionEntries(page, fixture.id);
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: /delete me/i })
          .first(),
      ).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });

    // Select the row, then run the destructive action from the actions menu.
    const row = page
      .getByRole("row")
      .filter({ hasText: /delete me/i })
      .first();
    await row.getByRole("checkbox").first().click();

    await page.getByRole("button", { name: "Toggle actions menu" }).click();
    await page
      .getByRole("menuitem", { name: /delete/i })
      .first()
      .click();
    // The menu item only ARMS the action — the main split button executes it
    // (which opens the confirm dialog).
    await page.getByTestId("entry-list-action-delete").first().click();
    await confirmModal(page);

    await expect(page.getByText(/deleted|archived/i).first()).toBeVisible({ timeout: 25_000 });

    // Persistence: a fresh render must not show the row again (the old bug
    // toasted success while the write never happened).
    await expect(async () => {
      await openCollectionEntries(page, fixture.id);
      await expect(page.getByRole("row").filter({ hasText: /delete me/i })).toHaveCount(0, {
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });
  });

  test("search: the toolbar input keeps typed characters and filters the list", async ({
    page,
  }) => {
    const fixture = await seedCollectionFixture(page, "entrysearch");
    await openCollectionEntries(page, fixture.id);
    await createEntryViaUi(page, "Search Me");

    await expect(async () => {
      await openCollectionEntries(page, fixture.id);
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: /search me/i })
          .first(),
      ).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000, intervals: [1_500, 2_500, 4_000] });

    // Open the search field (desktop toolbar; may already be expanded).
    const searchInput = page
      .getByRole("textbox", { name: /search for items in the table/i })
      .first();
    if (!(await searchInput.isVisible({ timeout: 1_500 }).catch(() => false))) {
      await page.getByRole("button", { name: "Search", exact: true }).first().click();
    }
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.click();

    // Regression: the URL→input sync effect used to reset the field on every
    // keystroke (URL debounce is 400 ms), so nothing could be typed.
    await searchInput.pressSequentially("Search Me", { delay: 40 });
    await expect(searchInput, "typed value must survive the URL sync effect").toHaveValue(
      "Search Me",
      { timeout: 5_000 },
    );

    // Debounced commit → URL carries the search param, server returns the row.
    await expect(page).toHaveURL(/[?&]search=Search(\+|%20)Me/, { timeout: 15_000 });
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: /search me/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // A term that matches nothing must actually reach the server (empty state).
    await searchInput.click();
    await searchInput.fill("no-such-entry-xyz");
    await expect(page).toHaveURL(/[?&]search=no-such-entry-xyz/, { timeout: 15_000 });
    await expect(page.getByText(/no entries match filters/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("error boundary: 404 recovery actions render and navigate", async ({ page }) => {
    const missing = `missing${Date.now().toString(36)}`;
    const response = await page.goto(`/en/collection/${missing}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), "missing collection must answer 404").toBe(404);

    // Admin error shell, not a bare SvelteKit error page.
    await expect(page.getByText(/HTTP 404/)).toBeVisible({ timeout: 15_000 });

    const dashboard = page.getByRole("button", { name: /go to dashboard/i }).first();
    const reload = page.getByRole("button", { name: /reload view/i }).first();
    const back = page.getByRole("button", { name: /go back/i }).first();

    // The dashboard action is the page's primary recovery action; Reload/Back
    // stay outline. (A filled dashboard action was an intentional UX change.)
    await expect(dashboard, "Go to Dashboard action").toBeVisible({ timeout: 10_000 });
    await expect(dashboard, "Go to Dashboard must be primary").toHaveClass(
      /preset-filled-tertiary-600/,
    );
    for (const [label, button] of [
      ["Reload View", reload],
      ["Go Back", back],
    ] as const) {
      await expect(button, `${label} action`).toBeVisible({ timeout: 10_000 });
      await expect(button, `${label} must be outline`).toHaveClass(/preset-outlined-surface-500/);
    }

    // 404 keeps the "page moved" helper; the copy is hidden for other statuses
    // (unit-covered in tests/unit/utils/error-display.test.ts).
    await expect(page.getByText(/doesn't exist or has been moved/i)).toBeVisible({
      timeout: 10_000,
    });

    await dashboard.click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
