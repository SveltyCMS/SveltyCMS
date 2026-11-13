/**
 * @file tests/e2e/routes/collection-builder/unsaved-navigation.spec.ts
 * @description Pins what each form-heavy admin surface does when a dirty form is
 *   left through a sidebar link (never through that surface's own Cancel button).
 *
 * Three surfaces, three contracts:
 *
 * 1. Entry editor — deliberately does NOT prompt. `beforeNavigate` runs
 *    `guardNavigationAutosave` (`src/utils/entry-autosave.ts`, wired in
 *    `src/routes/(app)/[language]/[...collection]/+page.svelte`): it cancels the
 *    navigation, writes the typed edits to the drafts lane, toasts "Changes
 *    auto-saved" and then resumes the navigation. Re-opening the form offers the
 *    draft, so nothing is silently dropped. The exit used here is the sidebar's
 *    Media Gallery link — a real `<a href>` that does not pre-set
 *    `collections.mode`. (The collection-tree and profile footer links call
 *    `modeTransitionGuard.setMode('view')` in their click handler, which runs before
 *    SvelteKit's `beforeNavigate` and therefore bypasses this guard — reported as a
 *    data-loss defect in this change set, not encoded here as expected behaviour.)
 *
 * 2. System Settings — `showConfirm` ("Unsaved Changes"); cancelling keeps the user
 *    on the page with the edited value, confirming leaves.
 *
 * 3. Design System — same prompt, added here because the page derived `hasChanges`
 *    and rendered an unsaved bar but never guarded navigation. Same-path tab
 *    switches (`?tab=`) must not prompt; confirming discards the draft so the shared
 *    live theme returns to the persisted values before navigating away.
 *
 * ### Features:
 * - seeds its own collection + entry through `POST /api/testing` (no soft-skip)
 * - covers all three surfaces without forced clicks or fixed sleeps
 * - waits on testids, URLs, dialog roles and the app toast
 */

import { expect, test, type Locator, type Page } from "../../fixtures";
import { waitForHydration } from "../../helpers/auth";
import { resetAndSeedDatabase, TEST_API_HEADERS } from "../../helpers/api";
import { openCollectionEntries } from "../../helpers/collection-builder-flow";
import { seedCookieConsent } from "../../helpers/cookie-consent";
import { expectToast } from "../../helpers/stable";

test.describe.configure({ mode: "serial", timeout: 180_000 });

const SEEDED_TITLE = "Unsaved navigation fixture";

interface EntryFixture {
  id: string;
}

/**
 * Provision a two-field collection (`title` required, `summary` optional) so the
 * navigation guard's required-field gate has a field it can refuse to autosave.
 */
async function seedEntryCollection(page: Page): Promise<EntryFixture> {
  const id = `unsavednav_${Date.now().toString(36)}`;
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
        ],
      },
    },
  });

  expect(response.ok(), `create-collection failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
  };
  expect(
    body.success,
    `create-collection rejected: ${body.message ?? JSON.stringify(body).slice(0, 300)}`,
  ).toBe(true);
  return { id };
}

async function seedEntry(page: Page, collectionId: string): Promise<void> {
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "insert", collectionId, data: { title: SEEDED_TITLE } },
  });
  expect(response.ok(), `insert failed: ${response.status()}`).toBeTruthy();
}

/** The app-level confirm dialog raised by `showConfirm`. */
function unsavedDialog(page: Page): Locator {
  return page
    .getByRole("dialog")
    .filter({ hasText: /unsaved/i })
    .first();
}

/** The global sidebar link every admin page shares (plain `<a>`, no mode reset). */
function profileLink(page: Page): Locator {
  return page.getByTestId("nav-user-profile");
}

/**
 * Select an option and verify the *state* accepted it — `selectOption` can land
 * before Svelte hydration attached the binding (see `design-system.spec.ts`).
 */
async function selectOptionVerified(select: Locator, value: string): Promise<void> {
  await expect(async () => {
    await select.selectOption({ value });
    await expect(select).toHaveValue(value, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe("Leaving a dirty form through a sidebar link", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
  });

  test("entry editor autosaves a draft, navigates away and offers the draft on return", async ({
    page,
  }) => {
    const fixture = await seedEntryCollection(page);
    await seedEntry(page, fixture.id);

    await openCollectionEntries(page, fixture.id);
    const row = page.getByRole("row").filter({ hasText: SEEDED_TITLE }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page).toHaveURL(/\?.*edit=/i, { timeout: 15_000 });

    const titleInput = page
      .getByRole("textbox", { name: /^title$/i })
      .or(page.locator('input[name="title"]').first());
    await expect(titleInput).toHaveValue(SEEDED_TITLE, { timeout: 15_000 });

    // Dirty the form the way an author would, and let the status panel confirm it.
    const editedTitle = `${SEEDED_TITLE} (edited)`;
    await titleInput.fill(editedTitle);
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Remember the form's URL so the return trip opens the same entry, not the list.
    const editUrl = page.url();
    expect(editUrl, "the editor URL should carry the entry id").toMatch(/[?&]edit=/);

    // Navigate away through a real sidebar link — not the editor's Cancel control.
    const mediaGalleryLink = page
      .getByTestId("app-left-sidebar")
      .getByRole("button", { name: /go to media gallery/i });
    await expect(mediaGalleryLink).toBeVisible({ timeout: 20_000 });
    await mediaGalleryLink.click();

    // The editor autosaves instead of prompting: it announces the draft, then leaves.
    await expectToast(page, /changes auto-saved/i);
    await expect(page).toHaveURL(/\/mediagallery/, { timeout: 20_000 });

    // Persistence: reopening the form offers the draft, and restoring it refills the form.
    await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/[?&]edit=/, { timeout: 20_000 });
    await waitForHydration(page);

    const banner = page.getByTestId("draft-resume-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText(/unsaved changes from a previous session/i);

    await page.getByTestId("draft-resume-restore").click();
    await expect(titleInput).toHaveValue(editedTitle, { timeout: 15_000 });
  });

  test("System Settings asks before leaving and keeps the edit when cancelled", async ({
    page,
  }) => {
    await page.goto("/config/system-settings?group=site", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("page-title")).toHaveText(/system settings/i, {
      timeout: 20_000,
    });
    await waitForHydration(page);

    const slogan = page.getByTestId("settings-field-SITE_SLOGAN").locator("input").first();
    await expect(slogan).toBeVisible({ timeout: 20_000 });
    const edited = `Unsaved nav ${Date.now().toString(36)}`;
    await slogan.fill(edited);

    // The group's Discard control only enables while the form is dirty — the dirty signal.
    const discard = page.getByTestId("settings-group-discard");
    await expect(discard).toBeEnabled({ timeout: 15_000 });

    await profileLink(page).click();
    const dialog = unsavedDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Cancelling the prompt keeps the user on the page with the edit intact.
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/config\/system-settings/, { timeout: 10_000 });
    await expect(slogan).toHaveValue(edited);
    await expect(discard).toBeEnabled();

    // Confirming the prompt really leaves the page.
    await profileLink(page).click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /^confirm$/i }).click();
    await expect(page).toHaveURL(/\/user/, { timeout: 20_000 });
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  });

  test("Design System asks before leaving, ignores tab switches and keeps the edit when cancelled", async ({
    page,
  }) => {
    await page.goto("/config/design-system?tab=customizer", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("page-title")).toHaveText(/design system/i, {
      timeout: 20_000,
    });
    await waitForHydration(page);

    const densitySelect = page.getByLabel("Admin Density", { exact: true });
    await expect(densitySelect).toBeVisible({ timeout: 20_000 });
    const savedDensity = await densitySelect.inputValue();
    expect(["compact", "cozy", "spacious"]).toContain(savedDensity);
    const targetDensity = savedDensity === "compact" ? "spacious" : "compact";
    await selectOptionVerified(densitySelect, targetDensity);

    // The unsaved bar and the shared live theme both reflect the draft.
    const discard = page.getByTestId("appearance-theme-discard");
    await expect(discard).toBeVisible({ timeout: 15_000 });
    const shell = page.locator("div[data-admin-theme]").first();
    await expect(shell).toHaveAttribute("data-density", targetDensity);

    // Same-path tab switches are not a leave: no prompt, draft survives.
    // NOTE: the shell's `data-density` is deliberately NOT asserted after a tab
    // switch. A `?tab=` navigation re-seeds the shared theme from persisted
    // data, so the preview drops back to the saved density while the form keeps
    // the draft — a real inconsistency (reported), not the contract under test.
    await page.getByTestId("appearance-tab-preview").click();
    await expect(page).toHaveURL(/[?&]tab=preview/, { timeout: 15_000 });
    await expect(unsavedDialog(page)).toHaveCount(0, { timeout: 5_000 });

    await page.getByTestId("appearance-tab-customizer").click();
    await expect(page).toHaveURL(/[?&]tab=customizer/, { timeout: 15_000 });
    await expect(discard).toBeVisible({ timeout: 15_000 });
    await expect(densitySelect).toHaveValue(targetDensity);

    // Leaving prompts; cancelling keeps the edit.
    await profileLink(page).click();
    const dialog = unsavedDialog(page);
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/config\/design-system/, { timeout: 10_000 });
    await expect(discard).toBeVisible();
    await expect(densitySelect).toHaveValue(targetDensity);

    // Confirming discards the draft before navigating: the shell returns to the
    // persisted density instead of leaking the unsaved preview into every page.
    await profileLink(page).click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /^confirm$/i }).click();
    await expect(page).toHaveURL(/\/user/, { timeout: 20_000 });
    await expect(shell).toHaveAttribute("data-density", savedDensity);
  });
});
