/**
 * @file tests/e2e/routes/config/migration-screen.spec.ts
 * @description Browser contract for the Migration screen.
 *
 * The legacy route `/config/migration` 301-redirects to the Smart Importer
 * plugin workspace at `/config?plugin=smart-importer`, which renders the
 * migration wizard inside `role="dialog"` / `data-testid="plugin-workspace"`.
 *
 * Contract pinned here: the workspace card and heading render, and the
 * empty/initial state names only the actions the page actually offers before a
 * file is uploaded — "Browse Files" plus the five step indicators — and never
 * import / dry-run / rollback actions.
 */

import { test, expect, type Page } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { enablePlugin } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

async function openMigrationWorkspace(page: Page): Promise<void> {
  await seedCookieConsent(page);
  await loginAsAdmin(page);

  // Best-effort enable; hard-fail below only if the workspace never mounts.
  try {
    await enablePlugin(page, "smart-importer", true);
  } catch (err) {
    console.warn(
      `[migration-screen] enable-plugin smart-importer: ${err instanceof Error ? err.message : err}`,
    );
  }

  await page.goto("/config?plugin=smart-importer", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await dismissCookieConsent(page);

  // Control-map row: the wizard must mount — a missing UI is a regression.
  await expect(page.getByTestId("plugin-workspace")).toBeVisible({ timeout: 25_000 });
  await waitForHydration(page);
}

test.describe("Migration screen", () => {
  test.setTimeout(90_000);

  test("renders the workspace card, heading and only the actions its empty state offers", async ({
    page,
  }) => {
    await openMigrationWorkspace(page);

    // Card + heading.
    await expect(
      page.getByRole("heading", { name: /smart ai-driven migration pro/i }),
    ).toBeVisible();
    await expect(page.getByTestId("migration-how-it-works")).toBeVisible();

    // Empty-state action: browse files is the only real action before a file exists.
    await expect(page.getByRole("button", { name: /browse files/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /drop your cms export file here/i }),
    ).toBeVisible();

    // The five step indicators are the wizard's remaining surface.
    await expect(page.getByRole("button", { name: /^Step 1:/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Step 5:/i })).toBeVisible();

    // Negative contract: with no file uploaded, the page offers no import /
    // dry-run / rollback action.
    await expect(page.getByRole("button", { name: /start import/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /run dry run/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /rollback/i })).toHaveCount(0);
  });
});
