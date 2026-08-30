/**
 * @file tests/e2e/routes/system/settings.spec.ts
 * @description System Settings shell + group panels + save/export/discard/import controls.
 * Groups are catalog-driven; tests assert structure, not every field value.
 * Navigation between groups happens via the sidebar SettingsMenu.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function goSettings(page: Page, group = "cache") {
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl === "about:blank" || currentUrl === "") {
    await loginAsAdmin(page);
  }
  await page.goto(`/config/system-settings?group=${group}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, `/config/system-settings?group=${group}`);
  }
  await expect(page).toHaveURL(/\/config\/system-settings/, { timeout: ACTION_TIMEOUT });
  await expect(page).not.toHaveURL(/\/login/, { timeout: ACTION_TIMEOUT });

  await expect(
    page
      .getByTestId("page-title")
      .or(page.getByRole("heading", { name: /system settings/i }).first())
      .first(),
  ).toBeVisible({ timeout: ACTION_TIMEOUT });

  const shell = page.getByTestId("system-settings-page");
  await expect(shell).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("System Settings shell", () => {
  test.setTimeout(120_000);

  test("admin can open settings shell", async ({ page }) => {
    await goSettings(page, "cache");

    await expect(page.getByTestId("system-settings-group-count")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const countText = await page.getByTestId("system-settings-group-count").textContent();
    expect(Number(countText)).toBeGreaterThan(0);

    await expect(page.getByTestId("settings-panel-cache")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-repair-cache")).toBeVisible();
  });

  test("switching groups updates URL and panel", async ({ page }) => {
    await goSettings(page, "cache");

    await page.locator('a[href="/config/system-settings?group=email"]').first().click();
    await expect(page).toHaveURL(/group=email/, { timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("settings-panel-email")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("unknown group shows missing state with recovery", async ({ page }) => {
    await goSettings(page, "this-group-does-not-exist-xyz");
    await expect(page.getByTestId("system-settings-group-missing")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-group-missing")).toContainText(
      /not found|not available/i,
    );
  });

  test("save is disabled when no edits; field testids present", async ({ page }) => {
    await goSettings(page, "cache");
    await expect(page.getByTestId("settings-panel-cache")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Save/discard render in the layout's sticky action bar (page level)
    const groupSave = page.getByTestId("settings-group-save");
    await expect(groupSave).toBeDisabled({ timeout: ACTION_TIMEOUT });

    // At least one catalog field should render with stable testid
    const schemaField = page.getByTestId("settings-field-CACHE_TTL_SCHEMA");
    await expect(schemaField).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("editing a field enables save; discard restores clean state", async ({ page }) => {
    await goSettings(page, "cache");
    const cachePanel = page.getByTestId("settings-panel-cache");
    await expect(cachePanel).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const field = page.getByTestId("settings-field-CACHE_TTL_SCHEMA");
    await expect(field).toBeVisible({ timeout: ACTION_TIMEOUT });

    const input = field.locator("input").first();
    await expect(input).toBeVisible({ timeout: ACTION_TIMEOUT });

    const current = await input.inputValue();
    const nextValue = current === "120" ? "121" : "120";
    await input.fill(nextValue);

    // Scope group-level save/discard: buttons render in the sticky action bar
    const groupSave = page.getByTestId("settings-group-save");
    const groupDiscard = page.getByTestId("settings-group-discard");

    await expect(groupSave).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });
    await expect(groupDiscard).toBeEnabled();

    await groupDiscard.click();
    await expect(groupSave).toBeDisabled({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("happy path: edit field, save, reload asserts persistence", async ({ page }) => {
    await goSettings(page, "cache");
    await expect(page.getByTestId("settings-panel-cache")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const field = page.getByTestId("settings-field-CACHE_TTL_SCHEMA");
    await expect(field).toBeVisible({ timeout: ACTION_TIMEOUT });
    const input = field.locator("input").first();
    await expect(input).toBeVisible({ timeout: ACTION_TIMEOUT });

    const original = await input.inputValue();
    // Use a deterministic but unique value in the valid TTL range (1–86400)
    const suffix = Date.now() % 10_000;
    let target = String(2000 + (suffix % 500));
    if (target === original) {
      target = String(Number(target) + 1);
    }

    await input.fill(target);
    // Trigger native events to ensure Svelte bindings propagate through Input wrapper
    await input.blur();
    const groupSave = page.getByTestId("settings-group-save");
    // Expect auto-waits for the reactivity-driven enabled state
    await expect(groupSave).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });

    const saveRes = page
      .waitForResponse((res) => res.url().includes("/api/system/settings") && res.status() < 400, {
        timeout: ACTION_TIMEOUT,
      })
      .catch(() => null);
    await groupSave.click();
    await saveRes;

    // Wait for loadSettings refresh to complete before checking disabled state
    await expect(groupSave.getByText("Saved")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(groupSave).toBeDisabled({
      timeout: ACTION_TIMEOUT,
    });

    // Verify persistence via API call instead of UI reload.
    // CACHE_TTL_SCHEMA is category "private" — values load from config
    // files on fresh page loads, so the UI input won't reflect DB saves.
    // (saveRes above already resolved, so the DB write is committed.)
    const verifyApi = await page.request.get(
      `/api/settings/cache?bypassCache=true&_=${Date.now()}`,
    );
    expect(verifyApi.ok()).toBeTruthy();
    const verifyBody = await verifyApi.json();
    expect(verifyBody.values?.CACHE_TTL_SCHEMA).toBe(Number(target));
  });

  test("export import reset and discard controls are present", async ({ page }) => {
    await goSettings(page, "security");
    await expect(page.getByTestId("settings-panel-security")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Buttons render in the layout's sticky action bar (page level)
    await expect(page.getByTestId("settings-group-export")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("settings-group-import")).toBeVisible();
    await expect(page.getByTestId("settings-group-import-input")).toBeAttached();
    await expect(page.getByTestId("settings-group-reset")).toBeVisible();
    await expect(page.getByTestId("settings-group-discard")).toBeVisible();
  });

  test("multi-tenancy migration card check structure", async ({ page }) => {
    await goSettings(page, "cache");
    const card = page.getByTestId("system-settings-mt-migration");
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("system-settings-check-structure")).toBeVisible();

    await page.getByTestId("system-settings-check-structure").click();
    // Result may succeed or show mode text
    await expect(page.getByTestId("system-settings-structure-info")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(
      card.getByText(/multi-tenant|single-tenant|mode|check failed|warning/i).first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("gdpr group loads special panel", async ({ page }) => {
    await goSettings(page, "gdpr");
    const panel = page.getByTestId("settings-panel-gdpr");
    await expect(panel).toBeVisible({ timeout: ACTION_TIMEOUT });
    // The GDPR group renders a bespoke panel (not the generic field form) —
    // assert its two compliance cards instead of a page-wide text match that
    // can resolve to the sidebar's group name.
    await expect(
      panel.getByRole("heading", { name: /data portability|right to erasure/i }).first(),
    ).toBeVisible({ timeout: ACTION_TIMEOUT });
  });
});
