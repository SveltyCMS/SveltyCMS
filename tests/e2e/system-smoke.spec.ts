import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("System Smoke", () => {
  test("admin can reach dynamic system settings", async ({ page }) => {
    await loginAsAdmin(page);

    // Open the cache group directly — the Repair Cache control is scoped to it,
    // and the page otherwise defaults to the first available group.
    await page.goto("/config/system-settings?group=cache", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/config\/system-settings/, { timeout: 10_000 });
    // The page title (PageTitle h1) renders "System Settings"; the descriptive
    // h2 below it is asserted separately. Scope to level 1 to avoid matching the h2.
    await expect(page.getByRole("heading", { level: 1, name: /system settings/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/configure global system settings/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /repair cache/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
