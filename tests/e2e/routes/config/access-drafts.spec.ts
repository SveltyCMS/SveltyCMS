/**
 * @file tests/e2e/routes/config/access-drafts.spec.ts
 * @description Access Management draft baseline + unsaved-changes guard E2E.
 *
 * Pins the two audit findings on /config/access-management:
 * - F03: Reset restores the LAST-SAVED role draft (not the page load captured
 *   before the save) and the Roles tab reconciles without a tab switch.
 * - F04: a confirmed unsaved-changes prompt resumes the cancelled destination on
 *   the first confirmation; Cancel keeps the page and its draft.
 *
 * Selectors are role/testid based (no CSS-class or free-text coupling), waits are
 * on URLs/testids/text — never fixed sleeps. Nothing here soft-skips: a missing
 * role list or an unpersisted save is a product failure.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { fillUntil, runAfterHydration } from "../../helpers/hydration";
import { dismissCookieBannerIfPresent, waitForAdminShell } from "../../helpers/stable";
import { TEST_API_HEADERS } from "../../helpers/api";

const ACTION_TIMEOUT = 20_000;
/** Ctrl on every CI image; Meta when the suite runs on a Mac workstation. */
const MOD_KEY = process.platform === "darwin" ? "Meta" : "Control";

// Login happens through the UI per test — never inherit another role's session.
test.use({ storageState: { cookies: [], origins: [] } });

async function goAccess(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/access-management", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/access-management");
  }
  await expect(page).toHaveURL(/\/config\/access-management/, { timeout: ACTION_TIMEOUT });
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("access-mgmt-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

/**
 * The seeded "Editor" role row. It is not a public role (`saveRole` only asks for
 * confirmation on public/anonymous/guest), has a stable non-empty description and
 * is not the admin role, so editing it cannot affect any other assertion.
 */
function roleRow(page: Page): Locator {
  return page.getByRole("listitem", { name: /role:\s*editor\b/i }).first();
}

/**
 * Read the seeded description. The modal primes its fields from the role props in
 * an effect right after mount, so poll until the field reports a real value.
 */
async function readDescription(modal: Locator): Promise<string> {
  const description = modal.getByTestId("role-description-input");
  await expect(description).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect
    .poll(() => description.inputValue(), {
      message: "the role editor never primed its description field",
      timeout: ACTION_TIMEOUT,
    })
    .not.toBe("");
  return description.inputValue();
}

/** Open the role editor and return the modal root. */
async function openRoleEditor(page: Page, row: Locator): Promise<Locator> {
  await runAfterHydration(page, () => row.getByRole("button", { name: /^edit role\b/i }).click());
  const modal = page.getByTestId("role-modal");
  await expect(modal).toBeVisible({ timeout: ACTION_TIMEOUT });
  return modal;
}

/**
 * Type the description and submit. `fillUntil` re-fills through the SSR/hydration
 * gap (the modal's own `$effect` primes the field right after mount).
 */
async function setRoleDescription(page: Page, modal: Locator, value: string) {
  const description = modal.getByTestId("role-description-input");
  await expect(description).toBeVisible({ timeout: ACTION_TIMEOUT });
  await fillUntil(page, description, value, () => expect(description).toHaveValue(value));
  await runAfterHydration(page, () => modal.getByTestId("role-modal-submit").click());
  await expect(modal).toBeHidden({ timeout: ACTION_TIMEOUT });
}

/** One complete edit cycle: open the editor, replace the description, submit. */
async function editRoleDescription(page: Page, row: Locator, value: string) {
  const modal = await openRoleEditor(page, row);
  await setRoleDescription(page, modal, value);
}

/**
 * Persist the draft through the page's own Save button and wait for the success
 * shape: the label leaves "Saving…" AND the button is disabled (the handler only
 * clears `hasModifiedChanges` on a 2xx). A failed save leaves it enabled.
 */
async function saveDraft(page: Page) {
  const save = page.getByTestId("access-mgmt-save").first();
  await expect(save).toBeEnabled({ timeout: ACTION_TIMEOUT });

  // Assert the request itself: the label already reads "Save (1)" before the click
  // lands, so a text assertion can pass instantly while nothing was submitted.
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/user/update-roles"),
    { timeout: ACTION_TIMEOUT },
  );
  await runAfterHydration(page, () => save.click());
  const response = await responsePromise;
  expect(
    response.status(),
    `update-roles answered ${response.status()} ${await response.text()}`,
  ).toBeLessThan(400);

  await expect(page.getByText(/configuration updated successfully/i)).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  await expect(save).toBeDisabled({ timeout: ACTION_TIMEOUT });
}

/** Reset with the page's own button; it is disabled until the draft is dirty. */
async function resetDraft(page: Page) {
  const reset = page.getByTestId("access-mgmt-reset").first();
  await expect(reset).toBeEnabled({ timeout: ACTION_TIMEOUT });
  await runAfterHydration(page, () => reset.click());
}

/** Best-effort cleanup: restore the seeded description through the testing API. */
async function restoreDescription(page: Page, original: string) {
  const roleId = await roleRow(page)
    .getAttribute("data-role-id")
    .catch(() => null);
  if (!roleId) return;
  await page.request
    .post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "update",
        collectionId: "roles",
        id: roleId,
        data: { description: original },
      },
    })
    .catch(() => undefined);
}

/**
 * Open the command palette and follow its Dashboard link. This is the only
 * client-side "choose Dashboard" control on this route (the left sidebar renders
 * the collections tree), and it is a plain `<a href="/dashboard">`, so SvelteKit's
 * router — and therefore `beforeNavigate` — handles it like any nav link.
 */
async function chooseDashboardFromPalette(page: Page) {
  await runAfterHydration(page, async () => {
    // Focus sits on <body> after the role modal closed; a focused input would
    // swallow the hotkey by design.
    await page.keyboard.press(`${MOD_KEY}+k`);
  });
  const palette = page.getByRole("dialog", { name: /global search/i });
  await expect(palette).toBeVisible({ timeout: ACTION_TIMEOUT });

  const dashboardLink = palette.locator('a[href="/dashboard"]').first();
  await fillUntil(page, palette.getByRole("combobox"), "dashboard", async () => {
    await expect(dashboardLink).toBeVisible({ timeout: 2_000 });
  });
  await runAfterHydration(page, () => dashboardLink.click());
}

test.describe("Access Management draft baseline (F03)", () => {
  test.setTimeout(180_000);

  test("Reset restores the last-saved role draft, including after reload", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const draft = `e2e-reset-${stamp}`;
    const row = roleRow(page);

    await goAccess(page);
    await runAfterHydration(page, () => page.getByTestId("access-tab-roles").click());
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Baseline comes from the editor itself — never a hardcoded string.
    const modal = await openRoleEditor(page, row);
    const original = await readDescription(modal);

    const withSuffix = (suffix: string) => `${original} ${draft}-${suffix}`;

    // ── F03 (a): edit + Reset WITHOUT changing tabs restores the row ──────
    await setRoleDescription(page, modal, withSuffix("a"));
    await expect(row).toContainText(`${draft}-a`);

    await resetDraft(page);
    await expect(row).toContainText(original);
    await expect(row).not.toContainText(`${draft}-a`);

    // ── F03 (b): a successful save moves the baseline ─────────────────────
    await editRoleDescription(page, row, withSuffix("b"));
    await expect(row).toContainText(`${draft}-b`);
    await saveDraft(page);

    // A later edit + Reset must return the SAVED value, not the page load.
    await editRoleDescription(page, row, withSuffix("c"));
    await expect(row).toContainText(`${draft}-c`);
    await resetDraft(page);
    await expect(row).toContainText(`${draft}-b`);
    await expect(row).not.toContainText(`${draft}-c`);

    // ── F03 (c): the saved value is the baseline after a reload too ───────
    await page.reload({ waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/config/access-management");
    }
    await expect(page).toHaveURL(/\/config\/access-management/, { timeout: ACTION_TIMEOUT });
    await dismissCookieBannerIfPresent(page);
    await runAfterHydration(page, () => page.getByTestId("access-tab-roles").click());

    const reloadedRow = roleRow(page);
    await expect(reloadedRow).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(reloadedRow).toContainText(`${draft}-b`);

    await editRoleDescription(page, reloadedRow, withSuffix("d"));
    await expect(reloadedRow).toContainText(`${draft}-d`);
    await resetDraft(page);
    await expect(reloadedRow).toContainText(`${draft}-b`);
    await expect(reloadedRow).not.toContainText(`${draft}-d`);

    await restoreDescription(page, original);
  });
});

test.describe("Access Management unsaved-changes guard (F04)", () => {
  test.setTimeout(180_000);

  test("confirming reaches the chosen destination first time; cancelling keeps the draft", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36);
    const draft = `e2e-guard-${stamp}`;
    const row = roleRow(page);

    await goAccess(page);
    await runAfterHydration(page, () => page.getByTestId("access-tab-roles").click());
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });

    const modal = await openRoleEditor(page, row);
    const original = await readDescription(modal);
    await setRoleDescription(page, modal, `${original} ${draft}`);
    await expect(row).toContainText(draft);
    await expect(page.getByTestId("access-mgmt-save")).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });

    const confirm = page.getByTestId("modal-confirm");
    const cancel = page.getByTestId("modal-cancel");

    // ── Cancel: stay on the page with the draft intact ───────────────────
    await chooseDashboardFromPalette(page);
    await expect(confirm).toBeVisible({ timeout: ACTION_TIMEOUT });
    await runAfterHydration(page, () => cancel.click());
    await expect(confirm).toBeHidden({ timeout: ACTION_TIMEOUT });
    await expect(page).toHaveURL(/\/config\/access-management/, { timeout: ACTION_TIMEOUT });
    await expect(row).toContainText(draft);
    await expect(page.getByTestId("access-mgmt-save")).toBeEnabled();

    // ── Confirm: the FIRST confirmation lands on the chosen destination ──
    await chooseDashboardFromPalette(page);
    await expect(confirm).toBeVisible({ timeout: ACTION_TIMEOUT });
    await runAfterHydration(page, () => confirm.click());
    await expect(page).toHaveURL(/\/dashboard/, { timeout: ACTION_TIMEOUT });

    // The draft was discarded, not persisted — the seeded value is intact.
    await page.goto("/config/access-management", { waitUntil: "domcontentloaded" });
    await dismissCookieBannerIfPresent(page);
    await runAfterHydration(page, () => page.getByTestId("access-tab-roles").click());
    await expect(roleRow(page)).toContainText(original, { timeout: ACTION_TIMEOUT });
    await expect(roleRow(page)).not.toContainText(draft);
  });
});
