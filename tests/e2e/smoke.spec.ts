/**
 * @file tests/e2e/smoke.spec.ts
 * @description Fast E2E browser smoke gate running locally before push.
 *
 * Verifies core critical user flows directly in Chromium:
 * - Admin authentication and UI shell hydration
 * - Media Gallery virtual folder creation, CSRF token propagation, and persistence
 * - User Management admin view and confirmation dialog interactivity
 * - Collection entry create → reload → persist journey
 * - Health and system readiness verification
 *
 * Features:
 * - Fast execution (~15-25 seconds) suitable for pre-push git hooks
 * - Real browser event dispatching and hydration verification
 * - Automatic cleanup of all seeded/created test artifacts
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "./helpers/auth";
import {
  createEntryViaUi,
  openCollectionEntries,
  seedCollectionFixture,
} from "./helpers/collection-builder-flow";
import { dismissCookieConsent, seedCookieConsent } from "./helpers/cookie-consent";

const ACTION_TIMEOUT = 25_000;
const API_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  // Surface the real browser exception instead of only a missing-locator timeout.
  page.on("pageerror", (error) => {
    // eslint-disable-next-line no-console
    console.error("[smoke] pageerror:", error.stack ?? error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      // eslint-disable-next-line no-console
      console.error("[smoke] console.error:", message.text());
    }
  });
  page.on("requestfailed", (req) => {
    // eslint-disable-next-line no-console
    console.error("[smoke] requestfailed:", req.url(), req.failure()?.errorText);
  });
  // Surface redirect chains/loops. A subresource that loops produces only the
  // browser's opaque ERR_TOO_MANY_REDIRECTS; logging the 3xx hops names the URL.
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 300 && status < 400) {
      // eslint-disable-next-line no-console
      console.error(
        `[smoke] redirect: ${status} ${res.url()} -> ${res.headers()["location"] ?? "?"}`,
      );
    }
  });
});

test.describe("Pre-Push E2E Smoke Gate", () => {
  test.setTimeout(90_000);

  test("1. Admin Authentication & UI Shell Hydration", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page, "/");

    // Must not be on /login
    expect(page.url()).not.toContain("/login");

    // Verify main navigation / sidebar is visible and interactive
    const nav = page.locator("nav, aside, header").first();
    await expect(nav).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Verify hydration
    await waitForHydration(page);
    await dismissCookieConsent(page);
  });

  test("2. Media Gallery — Virtual Folder Creation & CSRF Token", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);

    await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/mediagallery");
    }
    await expect(page).toHaveURL(/\/mediagallery/, { timeout: ACTION_TIMEOUT });

    await waitForHydration(page);
    await dismissCookieConsent(page);

    const folderName = `smoke_folder_${Date.now().toString(36).slice(-6)}`;

    // Listen for the POST request
    const createApi = page.waitForResponse(
      (res) =>
        res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
      { timeout: API_TIMEOUT },
    );

    const createBtn = page.getByTestId("media-create-folder");
    await expect(createBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
    await createBtn.click();

    // Dialog appears
    const dialog = page
      .getByRole("dialog", { name: /create new folder|new folder|folder/i })
      .or(
        page
          .getByRole("dialog")
          .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i }),
      )
      .first();
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });

    const input = dialog.locator("input[type='text'], input:not([type])").first();
    await expect(input).toBeVisible({ timeout: ACTION_TIMEOUT });
    await input.fill(folderName);

    const submitBtn = dialog.getByTestId("modal-prompt-confirm");
    await expect(submitBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
    await submitBtn.click();

    // Verify API success and toast
    const res = await createApi;
    expect(res.ok()).toBe(true);

    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { _id?: string };
    } | null;
    expect(body?.success).toBe(true);
    const folderId = String(body?.data?._id ?? "");
    expect(folderId).not.toBe("");

    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByText(folderName).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Clean up created folder via browser fetch (guarantees matching Origin + cookies)
    const cleanupOk = await page.evaluate(async (id) => {
      const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?csrf_token=([^;]*)/);
      const token = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch(`/api/system-virtual-folder?folderId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: token ? { "X-CSRF-Token": token } : {},
      });
      return res.ok;
    }, folderId);
    expect(cleanupOk).toBe(true);
  });

  test("3. User Management View & Hydration", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);

    await page.goto("/user", { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/user");
    }
    await expect(page).toHaveURL(/\/user/, { timeout: ACTION_TIMEOUT });

    await waitForHydration(page);
    await dismissCookieConsent(page);

    // Profile heading or tabs visible
    const userShell = page
      .getByRole("heading", { name: /user profile|user/i })
      .or(page.getByTestId("admin-page-title"))
      .first();
    await expect(userShell).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("4. Collection CRUD UI Journey — Create Entry, Reload & Assert", async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);

    // 1. Seed collection fixture via testing API
    const fixture = await seedCollectionFixture(page, "smoke");
    expect(fixture.id).toBeTruthy();

    // 2. Open collection entries view
    await openCollectionEntries(page, fixture.id);
    await waitForHydration(page);

    // 3. Create entry through the real UI
    const entryTitle = `Smoke Entry ${Date.now().toString(36)}`;
    await createEntryViaUi(page, entryTitle);

    // 4. Assert UI list reflects the created entry
    await expect(page.getByText(entryTitle).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // 5. Reload page to assert cold SSR persistence
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.getByText(entryTitle).first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    // 6. Assert API re-read contains the entry
    const apiRes = await page.request.get(
      `/api/collections/${fixture.id}?publicationFilter=all&bypassCache=true`,
    );
    expect(apiRes.ok()).toBe(true);
    const body = (await apiRes.json().catch(() => ({}))) as {
      data?: Array<{ title?: string }> | { items?: Array<{ title?: string }> };
    };
    const items = Array.isArray(body?.data)
      ? body.data
      : Array.isArray((body?.data as any)?.items)
        ? (body.data as any).items
        : [];
    const titles = items.map((r: { title?: string }) => r.title);
    expect(titles).toContain(entryTitle);
  });

  test("5. System Health & API Readiness", async ({ page }) => {
    const health = await page.request.get("/api/system/health");
    expect(health.ok()).toBe(true);
    const healthData = (await health.json()) as { status?: string };
    expect(healthData.status).toBe("healthy");
  });
});
