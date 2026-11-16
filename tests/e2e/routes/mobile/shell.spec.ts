/**
 * @file tests/e2e/routes/mobile/shell.spec.ts
 * @description E2E for the admin shell on a **phone** viewport.
 *
 * The shell renders two different navigation branches, and which one a viewer
 * gets depends on `screen.isMobile` (the `md` breakpoint), not on CSS alone:
 *
 *   desktop → `<aside data-testid="app-left-sidebar">` inside the flex flow
 *   phone   → `<Portal>` overlay drawer with `role="dialog" aria-modal="true"`,
 *             opened from the page-title button "Open Sidebar" or from the
 *             floating nav's "Open Navigation Menu"
 *
 * Every other spec runs in the `chromium` project at 1280×720, so the phone
 * branch was never executed by CI — a `max-md:hidden` sidebar that silently
 * stops being reachable would go unnoticed. This file runs in the `mobile`
 * project (Pixel 7 profile: 412×915 CSS px, touch, mobile user agent), which is
 * the only context where `isMobile`, `hasTouch` and a phone UA are all true.
 */

import { expect, test, type Page } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { seedCookieConsent } from "../../helpers/cookie-consent";

const ACTION_TIMEOUT = 20_000;

/** Land on a hydrated dashboard as admin, tolerating a lost session. */
async function goDashboard(page: Page): Promise<void> {
  await loginAsAdmin(page, "/dashboard");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/dashboard");
  }
  await expect(page).toHaveURL(/\/dashboard/, { timeout: ACTION_TIMEOUT });
  await waitForHydration(page);
}

test.describe("mobile admin shell", () => {
  test.beforeEach(async ({ page }) => {
    // Guard the context, not just the assertions: the phone branch of the shell
    // and the Pixel 7 device profile both come from the `mobile` project. Run in
    // `chromium` and the desktop aside renders — a green run would prove nothing.
    expect(test.info().project.name).toBe("mobile");
    expect(page.viewportSize()?.width ?? 0).toBeLessThan(768);

    // The GDPR dialog mounts after hydration and swallows the first click.
    await seedCookieConsent(page);
  });

  test("renders the phone navigation branch instead of the desktop sidebar", async ({ page }) => {
    await goDashboard(page);

    // The desktop aside must not exist in the DOM at all: on a phone
    // `screen.isMobile` is already true on first render, so nothing is painted
    // and then hidden by CSS.
    await expect(page.getByTestId("app-left-sidebar")).toHaveCount(0);

    // The phone branch offers the floating navigation entry point.
    await expect(page.getByRole("button", { name: "Open Navigation Menu" })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("opens and closes the sidebar drawer from the page title", async ({ page }) => {
    await goDashboard(page);

    const drawer = page.getByRole("dialog", { name: /sidebar/i });
    // The layout sets `leftSidebar = 'hidden'` for phones after every navigation,
    // so the drawer is closed on arrival.
    await expect(drawer).toHaveCount(0);

    const openButton = page.getByRole("button", { name: "Open Sidebar" });
    await expect(openButton).toBeVisible({ timeout: ACTION_TIMEOUT });
    await openButton.click();

    await expect(drawer).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    // The drawer is a modal overlay: a click outside its 240 px column must land
    // on the backdrop and close it. 400 px is outside the drawer in a 412 px
    // viewport and inside the backdrop's `inset-0` area.
    await page.mouse.click(400, 300);
    await expect(drawer).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });

  test("closes the sidebar drawer when pressing Escape", async ({ page }) => {
    await goDashboard(page);

    const drawer = page.getByRole("dialog", { name: /sidebar/i });
    await expect(drawer).toHaveCount(0);

    const openButton = page.getByRole("button", { name: "Open Sidebar" });
    await expect(openButton).toBeVisible({ timeout: ACTION_TIMEOUT });
    await openButton.click();

    await expect(drawer).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(drawer).toHaveAttribute("aria-modal", "true");

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });

  test("opens and closes the floating navigation overlay", async ({ page }) => {
    await goDashboard(page);

    const open = page.getByRole("button", { name: "Open Navigation Menu" });
    await expect(open).toBeVisible({ timeout: ACTION_TIMEOUT });
    await open.click();

    const close = page.getByRole("button", { name: "Close navigation overlay" });
    await expect(close).toBeVisible({ timeout: ACTION_TIMEOUT });

    await close.click();
    await expect(close).toHaveCount(0, { timeout: ACTION_TIMEOUT });
  });

  test("stays on the same route after the drawer closes", async ({ page }) => {
    // Regression guard for the mobile navigation reset: a navigation must not
    // bounce the viewer back to the dashboard or to /login.
    await goDashboard(page);
    await page.getByRole("button", { name: "Open Sidebar" }).click();
    await expect(page.getByRole("dialog", { name: /sidebar/i })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.mouse.click(400, 300);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: ACTION_TIMEOUT });
  });
});
