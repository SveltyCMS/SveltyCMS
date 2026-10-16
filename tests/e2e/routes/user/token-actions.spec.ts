/**
 * @file tests/e2e/routes/user/token-actions.spec.ts
 * @description Invitation-token edit/delete from the admin list — the reported
 * "Toast: Error — Token not found" surface.
 *
 * The list exposes the *hashed* token value; calling PUT/DELETE with it made the
 * API answer 404 ("Token not found") on edit and silently no-op on delete while
 * the UI toasted success. These tests drive the real UI paths (Multibutton →
 * Edit, row → Delete) and assert **persistence through the API**, so a silent
 * no-op can never pass again.
 *
 * | Layer | Coverage |
 * | ----- | -------- |
 * | E2E | this file (Multibutton edit + delete persistence) |
 * | Integration | `tests/integration/api/token.test.ts` — row-_id resolution + honest 404 delete |
 * | Unit | `tests/unit/routes/token-routes-handler.test.ts` — update allowlist + delete honesty |
 */

import { expect, test, type Page } from "@playwright/test";
import { resetAndSeedDatabase, seedInviteToken } from "../../helpers/api";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import { dismissCookieBannerIfPresent } from "../../helpers/stable";
import {
  goToUserPage,
  openTableSearch,
  openTokenView,
  openUserManagement,
} from "../../helpers/user-page";

test.describe.configure({ mode: "serial", timeout: 120_000 });
// Force an anonymous context — the seeded session comes from resetAndSeedDatabase.
test.use({ storageState: { cookies: [], origins: [] } });

/** Read the token row (if any) straight from the admin API. */
async function tokenRowFromApi(page: Page, email: string) {
  const res = await page.request.get("/api/token?limit=100");
  if (!res.ok()) return null;
  const body = await res.json().catch(() => ({}));
  const rows = Array.isArray(body?.data) ? body.data : [];
  return (
    (rows as Array<Record<string, unknown>>).find(
      (row) => String(row.email).toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

test.describe("Invitation tokens — edit & delete from the admin list", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await resetAndSeedDatabase(page);
    await dismissCookieConsent(page);
    await dismissCookieBannerIfPresent(page);
  });

  test("Multibutton edit saves the change (no 'Token not found')", async ({ page }) => {
    const seeded = await seedInviteToken(page, { role: "editor" });

    await goToUserPage(page);
    await openUserManagement(page);
    await openTokenView(page);

    const before = await tokenRowFromApi(page, seeded.email);
    expect(before, "seeded invite token must be listed").toBeTruthy();
    const beforeRole = String(before?.role ?? "").toLowerCase();

    // Narrow the table to the seeded row before selecting it.
    const search = await openTableSearch(page);
    await search.fill(seeded.email);
    const row = page.getByRole("row").filter({ hasText: seeded.email }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Select the row, then run the Edit action. With one row selected the main
    // action button is already "Edit" (the menu filters out the current action),
    // so click it directly instead of hunting for an "Edit" menu item.
    await row.getByRole("checkbox").first().click();
    const executeEdit = page.getByRole("button", { name: /execute edit action/i });
    if (await executeEdit.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await executeEdit.click();
    } else {
      await page.getByTestId("user-bulk-actions-menu").click();
      await page.getByRole("menuitem", { name: /edit/i }).first().click();
    }

    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: /save/i }) })
      .first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // Pick a role that differs from the seeded one (options: admin/developer/editor/guest).
    const targetChip =
      beforeRole === "developer"
        ? dialog.getByRole("button", { name: /^guest$/i })
        : dialog.getByRole("button", { name: /^developer$/i });
    await expect(targetChip.first()).toBeVisible({ timeout: 10_000 });
    await targetChip.first().click();

    // The save must reach the API — the reported failure was a 404 toast here.
    const write = page
      .waitForResponse(
        (res) => res.request().method() === "PUT" && /\/api\/token\//.test(res.url()),
        { timeout: 25_000 },
      )
      .catch(() => null);
    await dialog.getByRole("button", { name: /save/i }).click();
    const saved = await write;
    if (!saved) {
      throw new Error("Token edit never reached PUT /api/token/:id (click had no effect)");
    }
    if (!saved.ok()) {
      throw new Error(
        `Token edit rejected: HTTP ${saved.status()} ${(await saved.text().catch(() => "")).slice(0, 300)}`,
      );
    }

    // The reported failure mode: an "Error — Token not found" toast and no write.
    await expect(page.getByText(/token not found/i)).toHaveCount(0);

    // Persistence: the API row must carry the new role.
    await expect(async () => {
      const after = await tokenRowFromApi(page, seeded.email);
      expect(after, "token must still exist after edit").toBeTruthy();
      expect(
        String(after?.role).toLowerCase(),
        `role must change from ${beforeRole} (API: ${JSON.stringify(after?.role)})`,
      ).not.toBe(beforeRole);
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000] });
  });

  test("delete: the row is actually removed (no false-success toast)", async ({ page }) => {
    const seeded = await seedInviteToken(page, { role: "editor" });

    await goToUserPage(page);
    await openUserManagement(page);
    await openTokenView(page);

    const search = await openTableSearch(page);
    await search.fill(seeded.email);
    const row = page.getByRole("row").filter({ hasText: seeded.email }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Row click on a non-interactive cell (the email) opens the token edit
    // dialog — the "blocked" cell would open the block confirmation instead.
    await row.getByText(seeded.email, { exact: true }).click();
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: /delete/i }) })
      .first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: /delete/i }).click();
    await expect(page.getByText(/deleted/i).first()).toBeVisible({ timeout: 25_000 });

    // The old bug answered 200 with deletedCount 0 — the row survived the toast.
    await expect(async () => {
      const after = await tokenRowFromApi(page, seeded.email);
      expect(after, "deleted token must no longer be listed").toBeNull();
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000] });
  });
});
