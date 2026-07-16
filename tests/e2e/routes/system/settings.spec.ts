import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("System Smoke", () => {
  test("admin can reach dynamic system settings", async ({ page }) => {
    await loginAsAdmin(page);

    // Open the cache group directly — the Repair Cache control is scoped to it,
    // and the page otherwise defaults to the first available group.
    await page.goto("/config/system-settings?group=cache", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/config\/system-settings/, {
      timeout: 10_000,
    });
    // The page title (PageTitle h1) renders "System Settings"; the descriptive
    // h2 below it is asserted separately. Use testid to survive CSS refactors.
    const pageTitle = page.getByTestId("page-title");
    await pageTitle.waitFor({ state: "visible", timeout: 15_000 });
    await expect(pageTitle).toContainText(/system settings/i);
    await expect(page.getByText(/configure global system settings/i)).toBeVisible({
      timeout: 10_000,
    });
    // Scope to the form to avoid strict-mode violations if the button is ever
    // duplicated in a sticky toolbar or global action bar.
    await expect(page.locator("form").getByRole("button", { name: /repair cache/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
