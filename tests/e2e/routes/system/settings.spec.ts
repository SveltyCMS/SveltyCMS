/**
 * @file tests/e2e/routes/system/settings.spec.ts
 * @description System Settings shell + group navigation + save/export/discard/import controls.
 * Groups are catalog-driven; tests assert structure, not every field value.
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function goSettings(page: Page, group = "cache") {
  await loginAsAdmin(page);
  await page.goto(`/config/system-settings?group=${group}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, `/config/system-settings?group=${group}`);
  }
  await expect(page).toHaveURL(/\/config\/system-settings/, { timeout: ACTION_TIMEOUT });
  await expect(page).not.toHaveURL(/\/login/);

  const title = page.getByTestId("page-title");
  if (await title.isVisible({ timeout: ACTION_TIMEOUT }).catch(() => false)) {
    await expect(title).toContainText(/system settings/i);
  } else {
    await expect(page.getByRole("heading", { name: /system settings/i }).first()).toBeVisible({
      timeout: 8_000,
    });
  }

  const shell = page.getByTestId("system-settings-page");
  if (!(await shell.isVisible({ timeout: ACTION_TIMEOUT }).catch(() => false))) {
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    throw new Error(`System settings shell missing at ${page.url()} body=${body.slice(0, 400)}`);
  }
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("System Settings shell", () => {
  test.setTimeout(120_000);

  test("admin can open settings with group navigator", async ({ page }) => {
    await goSettings(page, "cache");

    await expect(page.getByTestId("system-settings-group-nav")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-group-search")).toBeVisible();
    await expect(page.getByTestId("system-settings-group-count")).toBeVisible();

    const countText = await page.getByTestId("system-settings-group-count").textContent();
    expect(Number(countText)).toBeGreaterThan(0);

    await expect(page.getByTestId("settings-group-cache")).toBeVisible();
    await expect(page.getByTestId("settings-panel-cache")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-repair-cache")).toBeVisible();
  });

  test("group search filters chips", async ({ page }) => {
    await goSettings(page, "cache");

    const search = page.getByTestId("system-settings-group-search");
    await search.fill("zzzz-no-group-xyz");
    await expect(page.getByTestId("system-settings-group-empty")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    await search.fill("security");
    await expect(page.getByTestId("settings-group-security")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("settings-group-cache")).toHaveCount(0);
  });

  test("switching groups updates URL and panel", async ({ page }) => {
    await goSettings(page, "cache");

    await page.getByTestId("settings-group-email").click();
    await expect(page).toHaveURL(/group=email/, { timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("settings-panel-email")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("settings-group-email")).toHaveAttribute("aria-current", "true");
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
    // Wait for group load
    await page.waitForTimeout(800);

    const shellSave = page.getByTestId("system-settings-save");
    await expect(shellSave).toBeDisabled({ timeout: ACTION_TIMEOUT });

    const cachePanel = page.getByTestId("settings-panel-cache");
    const groupSave = cachePanel.getByTestId("settings-group-save");
    if (await groupSave.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(groupSave).toBeDisabled();
    }

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

    // Scope group-level save/discard to the cache panel to avoid strict-mode
    // violations when the global toolbar also renders the same testids.
    const groupSave = cachePanel.getByTestId("settings-group-save");
    const groupDiscard = cachePanel.getByTestId("settings-group-discard");

    await expect(groupSave).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-save")).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });
    await expect(groupDiscard).toBeEnabled();
    await expect(page.getByTestId("system-settings-discard")).toBeVisible();

    await groupDiscard.click();
    await expect(groupSave).toBeDisabled({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("system-settings-save")).toBeDisabled({
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
    await input.dispatchEvent("input");
    await input.dispatchEvent("change");
    await input.dispatchEvent("blur");
    const cachePanel = page.getByTestId("settings-panel-cache");
    const groupSave = cachePanel.getByTestId("settings-group-save");
    await expect(groupSave).toBeEnabled({
      timeout: ACTION_TIMEOUT,
    });

    await groupSave.click();
    // Save reloads group and clears dirty state
    await expect(groupSave).toBeDisabled({
      timeout: ACTION_TIMEOUT,
    });
    await expect(input).toHaveValue(target, { timeout: ACTION_TIMEOUT });

    // Hard reload — value must come from API, not client state
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("settings-panel-cache")).toBeVisible({
        timeout: 10_000,
      });
    }).toPass({ timeout: 25_000 });
    const afterReload = page
      .getByTestId("settings-field-CACHE_TTL_SCHEMA")
      .locator("input")
      .first();
    await expect(afterReload).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(afterReload).toHaveValue(target, { timeout: ACTION_TIMEOUT });

    // Restore original to avoid leaving noisy E2E mutations
    if (original !== target) {
      await afterReload.fill(original);
      const restoreSave = page
        .getByTestId("settings-panel-cache")
        .getByTestId("settings-group-save");
      await expect(restoreSave).toBeEnabled({
        timeout: ACTION_TIMEOUT,
      });
      await restoreSave.click();
      await expect(restoreSave).toBeDisabled({
        timeout: ACTION_TIMEOUT,
      });
    }
  });

  test("export import reset and discard controls are present", async ({ page }) => {
    await goSettings(page, "security");
    await expect(page.getByTestId("settings-panel-security")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.waitForTimeout(600);

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
    await expect(page.getByTestId("settings-panel-gdpr")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByText(/gdpr|privacy|export|anonymiz/i).first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
