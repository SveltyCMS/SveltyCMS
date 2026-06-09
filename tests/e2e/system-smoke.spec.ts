import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("System Smoke", () => {
  test("admin can reach dynamic system settings", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/config/system-settings", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/config\/system-settings/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /dynamic system settings/i })).toBeVisible({
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
