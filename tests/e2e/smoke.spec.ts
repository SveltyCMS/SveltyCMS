/**
 * @file tests/e2e/smoke.spec.ts
 * @description Pre-push E2E gate — the full Chromium contract, compressed.
 *
 * This is deliberately not a "does it render" check. Every test drives the
 * real UI, asserts the persisted outcome (create → reload → read back →
 * clean up), and fails on any uncaught page error. There are no conditional
 * assertions and no soft skips: a missing prerequisite is seeded through the
 * fail-closed `/api/testing` surface, and a failure is always a failure.
 *
 * Coverage:
 * - Admin login, sidebar + main-column hydration
 * - Media gallery toolbar layout/hit-testing, advanced-search modal
 * - Virtual folder create → API + reload persistence → delete
 * - Media metadata edit (details modal PATCH) → reload persistence → delete
 * - User profile identity fields for the signed-in admin
 * - Collection entry create → reload → API re-read → delete
 * - Health/readiness
 *
 * Features:
 * - ~30–45 s, suitable for the pre-push git hook
 * - Guaranteed cleanup in `finally` (media rows, folder, entry)
 * - `pageerror` guard: uncaught browser exceptions fail the test
 */

import { expect, test, type Page } from "@playwright/test";
import { TEST_API_HEADERS } from "./helpers/api";
import { loginAsAdmin, waitForHydration } from "./helpers/auth";
import {
  createEntryViaUi,
  openCollectionEntries,
  seedCollectionFixture,
} from "./helpers/collection-builder-flow";
import { dismissCookieConsent, seedCookieConsent } from "./helpers/cookie-consent";
import { deleteMediaRow, openMediaGallery, uploadUniqueImage } from "./helpers/media";

const ACTION_TIMEOUT = 25_000;
const API_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  // Surface the real browser exception instead of only a missing-locator timeout.
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
    // eslint-disable-next-line no-console
    console.error("[smoke] pageerror:", error.stack ?? error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      // eslint-disable-next-line no-console
      console.error("[smoke] console.error:", message.text());
    }
  });
  page.on("requestfailed", (req) => {
    // eslint-disable-next-line no-console
    console.error("[smoke] requestfailed:", req.url(), req.failure()?.errorText);
  });
  // Surface redirect chains/loops. A subresource that loops produces only the
  // browser's opaque ERR_TOO_MANY_REDIRECTS; logging the 3xx hops names the URL.
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 300 && status < 400) {
      // eslint-disable-next-line no-console
      console.error(
        `[smoke] redirect: ${status} ${res.url()} -> ${res.headers()["location"] ?? "?"}`,
      );
    }
  });
});

test.afterEach(() => {
  expect(pageErrors, `uncaught page errors:\n${pageErrors.join("\n\n")}`).toEqual([]);
});

/** Fail-closed testing API call (never a soft-skip). */
async function testingAction(page: Page, data: Record<string, unknown>): Promise<void> {
  const res = await page.request.post("/api/testing", { headers: TEST_API_HEADERS, data });
  expect(res.ok(), `testing action=${String(data.action)} failed: ${res.status()}`).toBe(true);
  const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
  expect(body?.success, `testing action=${String(data.action)} returned success=false`).not.toBe(
    false,
  );
}

/** Delete a virtual folder from the browser (matching Origin + CSRF cookie). */
async function deleteVirtualFolder(page: Page, folderId: string): Promise<boolean> {
  return page
    .evaluate(async (id) => {
      const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?csrf_token=([^;]*)/);
      const token = match ? decodeURIComponent(match[1]!) : "";
      const res = await fetch(`/api/system-virtual-folder?folderId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: token ? { "X-CSRF-Token": token } : {},
      });
      return res.ok;
    }, folderId)
    .catch(() => false);
}

type CollectionRow = { _id?: string; title?: string };

/** Find a just-created entry through the same REST surface a client would use. */
async function findEntryIdByTitle(
  page: Page,
  collectionId: string,
  title: string,
): Promise<string | null> {
  const res = await page.request.get(
    `/api/collections/${encodeURIComponent(collectionId)}?publicationFilter=all&bypassCache=true`,
  );
  if (!res.ok()) return null;
  const body = (await res.json().catch(() => null)) as {
    data?: CollectionRow[] | { items?: CollectionRow[] };
  } | null;
  const data = body?.data;
  const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const match = rows.find((row) => row.title === title);
  return match?._id ? String(match._id) : null;
}

test.describe("Pre-Push E2E Smoke Gate", () => {
  test.setTimeout(90_000);

  test("1. Admin authentication and hydrated shell", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page, "/");
    await expect(page).not.toHaveURL(/\/login/);
    await waitForHydration(page);
    await dismissCookieConsent(page);

    // Both layout regions must render their real content, not just an empty box.
    const sidebar = page.locator("aside[aria-label]").first();
    await expect(sidebar).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(sidebar.getByRole("link").first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    const main = page.locator("main");
    await expect(main).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("admin-page-title").or(page.locator("h1")).first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("2. Media gallery toolbar stays usable and opens advanced search", async ({ page }) => {
    await openMediaGallery(page);

    await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("media-gallery-content")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Regression guard: at 1280px the fixed filters used to squeeze the search
    // to ~24px and push the absolutely positioned advanced-search button under
    // the left sidebar, so clicks landed on the aside. These assertions fail
    // with a real message instead of a Playwright interception retry loop.
    const advancedSearch = page.getByTestId("media-advanced-search");
    await expect(advancedSearch).toBeVisible({ timeout: ACTION_TIMEOUT });

    const sidebarBox = await page.locator("aside[aria-label]").first().boundingBox();
    const buttonBox = await advancedSearch.boundingBox();
    const searchBox = await page.locator("#media-gallery-search-desktop").boundingBox();
    expect(sidebarBox, "left sidebar must have a layout box").not.toBeNull();
    expect(buttonBox, "advanced-search must have a layout box").not.toBeNull();
    expect(searchBox, "desktop search input must have a layout box").not.toBeNull();
    expect(
      buttonBox!.x,
      "advanced-search must start inside the main column (not under the sidebar)",
    ).toBeGreaterThan(sidebarBox!.x + sidebarBox!.width);
    expect(searchBox!.width, "search input must remain usable at 1280px").toBeGreaterThan(120);

    // Real interaction: the modal opens, is named, and closes via its Cancel
    // button (the dialog only handles Escape when focus is inside it).
    await advancedSearch.click({ timeout: ACTION_TIMEOUT });
    const advancedDialog = page.getByRole("dialog", { name: /advanced search/i });
    await expect(advancedDialog).toBeVisible({ timeout: ACTION_TIMEOUT });
    await advancedDialog
      .getByRole("button", { name: /cancel/i })
      .click({ timeout: ACTION_TIMEOUT });
    await expect(advancedDialog).toBeHidden({ timeout: ACTION_TIMEOUT });
  });

  test("3. Virtual folder create persists across reload and cleans up", async ({ page }) => {
    await openMediaGallery(page);
    const folderName = `smoke_folder_${Date.now().toString(36).slice(-6)}`;
    let folderId = "";
    let cleanupOk = false;

    const createApi = page.waitForResponse(
      (res) =>
        res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
      { timeout: API_TIMEOUT },
    );

    try {
      const createBtn = page.getByTestId("media-create-folder");
      await expect(createBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
      await createBtn.click();

      const dialog = page
        .getByRole("dialog", { name: /new folder|create.*folder|folder/i })
        .first();
      await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
      await dialog.getByTestId("modal-prompt-input").fill(folderName);
      await dialog.getByTestId("modal-prompt-confirm").click();

      const res = await createApi;
      expect(res.ok(), `folder POST ${res.status()} ${res.url()}`).toBe(true);
      const body = (await res.json().catch(() => null)) as { data?: { _id?: string } } | null;
      folderId = String(body?.data?._id ?? "");
      expect(folderId, "create response must expose the folder id").not.toBe("");

      await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

      // Outcome: cold reload still lists it.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    } finally {
      if (folderId) cleanupOk = await deleteVirtualFolder(page, folderId);
    }

    expect(cleanupOk, "virtual folder cleanup must succeed").toBe(true);
  });

  test("4. Media metadata edit persists across reload", async ({ page }) => {
    await openMediaGallery(page);
    const filename = `smoke-meta-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    const renamed = `renamed-${Date.now().toString(36)}`;

    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: ACTION_TIMEOUT });
      await actions.getByLabel(`Details for ${filename}`).first().click();

      const modal = page.getByTestId("media-details-modal");
      await expect(modal).toBeVisible({ timeout: ACTION_TIMEOUT });

      const nameEdit = modal.getByRole("button", { name: /edit asset name/i }).first();
      await expect(nameEdit).toBeVisible({ timeout: ACTION_TIMEOUT });
      await nameEdit.click();

      const patch = page.waitForResponse(
        (res) => res.request().method() === "PATCH" && res.url().includes(`/api/media/${row._id}`),
        { timeout: ACTION_TIMEOUT },
      );
      await modal.getByRole("textbox").first().fill(renamed);
      const res = await patch;
      expect(res.ok(), `PATCH ${res.status()} ${res.url()}`).toBe(true);

      // Outcome: cold reload, reopen details, read the saved name back.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const reloadedItem = page.locator(`[data-media-id="${row._id}"]`);
      await expect(reloadedItem).toBeVisible({ timeout: ACTION_TIMEOUT });
      await reloadedItem.hover();
      await reloadedItem
        .getByTestId("media-grid-actions")
        .first()
        .getByLabel(`Details for ${filename}`)
        .first()
        .click();
      await expect(page.getByTestId("media-details-modal")).toContainText(renamed, {
        timeout: ACTION_TIMEOUT,
      });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("5. User profile renders the signed-in admin identity", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page, "/user");
    await expect(page).toHaveURL(/\/user/, { timeout: ACTION_TIMEOUT });
    await waitForHydration(page);
    await dismissCookieConsent(page);

    await expect(page.getByTestId("user-account-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("profile-email")).toHaveText("admin@example.com", {
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("user-role-badge")).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("6. Collection entry create → reload → API re-read → delete", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);
    const fixture = await seedCollectionFixture(page, "smoke");
    const entryTitle = `Smoke Entry ${Date.now().toString(36)}`;

    try {
      await openCollectionEntries(page, fixture.id);
      await waitForHydration(page);
      await createEntryViaUi(page, entryTitle);

      await expect(page.getByText(entryTitle).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

      // Cold SSR reload keeps the row.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(page.getByText(entryTitle).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

      // The REST surface returns it too.
      const entryId = await findEntryIdByTitle(page, fixture.id, entryTitle);
      expect(entryId, "created entry must be readable through the collections API").not.toBeNull();
    } finally {
      const entryId = await findEntryIdByTitle(page, fixture.id, entryTitle).catch(() => null);
      if (entryId) {
        await testingAction(page, { action: "delete", collectionId: fixture.id, id: entryId });
      }
    }

    expect(await findEntryIdByTitle(page, fixture.id, entryTitle)).toBeNull();
  });

  test("7. System health and API readiness", async ({ page }) => {
    const health = await page.request.get("/api/system/health");
    expect(health.ok()).toBe(true);
    const healthData = (await health.json()) as { status?: string };
    expect(healthData.status).toBe("healthy");
  });
});
