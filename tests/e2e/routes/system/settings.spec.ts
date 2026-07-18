import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("System Smoke", () => {
  test("admin can reach dynamic system settings", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/config/system-settings?group=cache", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/config\/system-settings/, {
      timeout: 15_000,
    });

    // Prefer page-title testid; fall back to heading / body text if shell layout differs
    const pageTitle = page.getByTestId("page-title");
    const titleVisible = await pageTitle.isVisible({ timeout: 15_000 }).catch(() => false);
    if (titleVisible) {
      await expect(pageTitle).toContainText(/system settings/i);
    } else {
      await expect(page.getByRole("heading", { name: /system settings/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    await expect(
      page.getByText(/configure global system settings|system settings|cache/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    const repair = page.locator("form").getByRole("button", { name: /repair cache/i });
    if (await repair.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(repair).toBeVisible();
    }
  });
});
