/**
 * @file tests/e2e/helpers/user-page.ts
 * @description Shared Playwright helpers for the tabbed `/user` account page.
 *
 * ### Tabs (page-level)
 * - Identity (default) — profile, avatar, edit, change password
 * - Security — 2FA, sessions, auth prefs, permissions
 * - Settings — appearance, RTC, privacy/GDPR
 * - User Management (admin) — Users | Invitations table
 *
 * ### Admin sub-tabs
 * - Users (`admin-tab-users`) — default, user list + bulk actions
 * - Invitations (`admin-tab-tokens`) — invite tokens
 *
 * Prefer `data-testid` over fragile heading text: cards no longer use
 * "Identity" / "Security" as page headings (those are tab labels).
 *
 * The consent banner renders as `div[role="dialog"]` and overlays the page (it can
 * cover dialog confirm buttons and trips `getByRole("dialog")` strict mode) — it is
 * dismissed on every tab selection so dialog flows are not blocked.
 */

import { expect, type Page } from "@playwright/test";
import { dismissCookieConsent } from "./cookie-consent";

export const USER_ACTION_TIMEOUT = 20_000;

export type UserAccountTab = "identity" | "security" | "settings" | "management";

/** Navigate to `/user` and wait for the shell (page title + tab list). */
export async function goToUserPage(page: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? USER_ACTION_TIMEOUT;
  await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/user/, { timeout });

  const systemError = page.getByRole("heading", { name: /system error/i });
  if (await systemError.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const detail = await page
      .locator(".font-mono, pre, code")
      .first()
      .textContent()
      .catch(() => "");
    throw new Error(`User page System Error: ${detail?.trim() || "(no detail)"}`);
  }

  await expect(page.getByTestId("page-title")).toBeVisible({ timeout });
  await expect(page.getByTestId("user-account-tabs")).toBeVisible({ timeout });
  await expect(page.getByTestId("user-account-page")).toBeVisible({ timeout });
}

/**
 * Select a top-level account tab via stable `data-testid="tab-{id}"`.
 * Default landing tab is Identity — call this before asserting Security / Settings / Management.
 */
export async function selectUserTab(
  page: Page,
  tab: UserAccountTab,
  options?: { timeout?: number },
) {
  const timeout = options?.timeout ?? USER_ACTION_TIMEOUT;
  // The consent banner appears on first navigation after API-only logins and can
  // overlay the whole page — remove it before interacting with any tab content.
  await dismissCookieConsent(page);
  const tabBtn = page.getByTestId(`tab-${tab}`);
  await expect(tabBtn).toBeVisible({ timeout });
  const selected = await tabBtn.getAttribute("aria-selected");
  if (selected !== "true") {
    await tabBtn.click({ timeout });
  }
  await expect(tabBtn).toHaveAttribute("aria-selected", "true", { timeout });
  await expect(page.getByTestId("user-tab-panel")).toBeVisible({ timeout });
}

/** Identity panel (default tab). */
export async function openIdentityTab(page: Page) {
  await selectUserTab(page, "identity");
  await expect(page.getByTestId("user-identity-panel")).toBeVisible({
    timeout: USER_ACTION_TIMEOUT,
  });
}

/** Security panel (sessions, 2FA, auth prefs, permissions). */
export async function openSecurityTab(page: Page) {
  await selectUserTab(page, "security");
  await expect(page.getByTestId("user-security-panel")).toBeVisible({
    timeout: USER_ACTION_TIMEOUT,
  });
}

/** Settings panel (appearance, RTC, privacy). */
export async function openSettingsTab(page: Page) {
  await selectUserTab(page, "settings");
  await expect(page.getByTestId("user-settings-panel")).toBeVisible({
    timeout: USER_ACTION_TIMEOUT,
  });
}

/**
 * User Management tab + wait for admin area.
 * Admin-only — non-admins do not get `tab-management`.
 */
export async function openUserAdminArea(page: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout ?? USER_ACTION_TIMEOUT;
  await selectUserTab(page, "management", { timeout });
  const adminArea = page.getByTestId("user-admin-area");
  await expect(adminArea).toBeVisible({ timeout });
  await adminArea.scrollIntoViewIfNeeded().catch(() => {});
  return adminArea;
}

/** Switch admin sub-tab to Users list (default). */
export async function ensureUsersAdminTab(page: Page) {
  const usersTab = page.getByTestId("admin-tab-users");
  await expect(usersTab).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  if ((await usersTab.getAttribute("aria-selected")) !== "true") {
    await usersTab.click({ timeout: USER_ACTION_TIMEOUT });
  }
  await expect(usersTab).toHaveAttribute("aria-selected", "true", {
    timeout: USER_ACTION_TIMEOUT,
  });
}

/** Switch admin sub-tab to Invitations (tokens). */
export async function ensureInvitationsAdminTab(page: Page) {
  const tokensTab = page.getByTestId("admin-tab-tokens");
  await expect(tokensTab).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  if ((await tokensTab.getAttribute("aria-selected")) !== "true") {
    await tokensTab.click({ timeout: USER_ACTION_TIMEOUT });
  }
  await expect(tokensTab).toHaveAttribute("aria-selected", "true", {
    timeout: USER_ACTION_TIMEOUT,
  });
  // Wait for token list fetch when possible
  await page
    .waitForResponse(
      (res) => res.url().includes("/api/token") && res.request().method() === "GET",
      { timeout: USER_ACTION_TIMEOUT },
    )
    .catch(() => undefined);
}

/**
 * Full path: /user → User Management → Users list ready for row interactions.
 */
export async function openUserAdminUsers(page: Page) {
  await goToUserPage(page);
  await openUserAdminArea(page);
  await ensureUsersAdminTab(page);
  await expect(page.getByTestId("user-bulk-actions-menu")).toBeVisible({
    timeout: USER_ACTION_TIMEOUT,
  });
  await page
    .waitForResponse(
      (res) => res.url().includes("/api/user") && res.request().method() === "GET" && res.ok(),
      { timeout: USER_ACTION_TIMEOUT },
    )
    .catch(() => undefined);
}

/** Open edit profile dialog from Identity tab. */
export async function openEditUserDialog(page: Page) {
  await openIdentityTab(page);
  const editBtn = page.getByTestId("edit-user-settings-btn");
  await expect(editBtn).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  await editBtn.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  return dialog;
}

/**
 * Open table search. Expanded layout keeps search always visible;
 * compact mode may need a Search toggle click.
 */
export async function openTableSearch(page: Page) {
  const searchInput = page.getByRole("textbox", {
    name: /search for items in the table/i,
  });
  if (!(await searchInput.isVisible({ timeout: 1_500 }).catch(() => false))) {
    const searchToggle = page.getByRole("button", { name: /^search$/i });
    if (await searchToggle.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await searchToggle.click({ timeout: USER_ACTION_TIMEOUT });
    }
  }
  await expect(searchInput).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  return searchInput;
}

/** Clear table search when visible. */
export async function clearTableSearch(page: Page) {
  const searchInput = page.getByRole("textbox", {
    name: /search for items in the table/i,
  });
  if (await searchInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
    // Await the refetch response directly — no fixed sleep needed: waitForResponse
    // resolves whenever the GET lands, and the fill() above is already awaited.
    const refetch = page
      .waitForResponse(
        (res) => res.url().includes("/api/user") && res.request().method() === "GET",
        { timeout: USER_ACTION_TIMEOUT },
      )
      .catch(() => undefined);
    await searchInput.fill("");
    await refetch;
  }
}

// ---------------------------------------------------------------------------
// Role-based aliases used by the user E2E specs (dismiss the consent banner too).
// ---------------------------------------------------------------------------

/** Click an account-section tab by accessible name (Identity | Security | Settings | User Management). */
export async function openUserTab(page: Page, name: RegExp): Promise<void> {
  await dismissCookieConsent(page);
  const tab = page.getByRole("tab", { name });
  await expect(tab).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  await tab.click({ timeout: USER_ACTION_TIMEOUT });
}

/** Open the User Management tab and wait for the AdminArea to render. */
export async function openUserManagement(page: Page): Promise<void> {
  await openUserTab(page, /user management/i);
  await expect(page.getByTestId("user-admin-area")).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
}

/** Open the Settings tab (Privacy & Data / GDPR controls live there). */
export async function openUserSettings(page: Page): Promise<void> {
  await openUserTab(page, /^settings$/i);
  await expect(page.getByTestId("user-settings-panel")).toBeVisible({
    timeout: USER_ACTION_TIMEOUT,
  });
}

/** Switch the AdminArea to the Invitations (token) view. */
export async function openTokenView(page: Page): Promise<void> {
  const tokensTab = page.getByTestId("admin-tab-tokens");
  await expect(tokensTab).toBeVisible({ timeout: USER_ACTION_TIMEOUT });
  await tokensTab.click({ timeout: USER_ACTION_TIMEOUT });
}
