/**
 * @file tests/e2e/routes/dashboard/dashboard.spec.ts
 * @description Widget-agnostic E2E for /dashboard shell + reorder.
 *
 * IMPORTANT: Dashboard widgets are install-specific (core set + plugins).
 * These tests NEVER assert a fixed list of widget types. They cover:
 * - Page shell loads for admin
 * - Empty state OR grid when widgets present
 * - Add Widget menu opens when widgets remain available
 * - Search filters menu items (if any)
 * - Reset clears layout when widgets were added
 * - Pointer drag-reorder + keyboard reorder (Ctrl+Arrow)
 * - Toolbar / AI toggle present
 * - Plugin slot exists for injectors
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;
/** Matches HEADER_HEIGHT in +page.svelte — drag only starts in top band of widget */
const DRAG_HEADER_Y = 18;

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

async function goDashboard(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/, { timeout: ACTION_TIMEOUT });
  const systemError = page.getByRole("heading", { name: /system error/i });
  if (await systemError.isVisible({ timeout: 1_200 }).catch(() => false)) {
    const detail = await page
      .locator(".font-mono, pre, code")
      .first()
      .textContent()
      .catch(() => "");
    throw new Error(`Dashboard hit System Error: ${detail?.trim() || "(no detail)"}`);
  }
  await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("page-title")).toContainText(/dashboard/i);
}

async function widgetIdsInDomOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-widget-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-widget-id") || "").filter(Boolean));
}

/** Reset layout and add up to `count` install widgets (names not asserted). */
async function ensureNWidgets(page: Page, count: number): Promise<number> {
  const reset = page.getByTestId("dashboard-reset-widgets");
  if (await reset.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await reset.click();
    await page.waitForTimeout(400);
  }

  for (let i = 0; i < count; i++) {
    const addBtn = page
      .getByTestId("dashboard-add-widget")
      .or(page.getByTestId("dashboard-add-first-widget"));
    if (
      !(await addBtn
        .first()
        .isVisible({ timeout: 4_000 })
        .catch(() => false))
    ) {
      break;
    }
    await addBtn.first().click();
    const menu = page.getByTestId("dashboard-widget-menu");
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT });
    const item = menu.getByRole("menuitem").first();
    if (!(await item.isVisible({ timeout: 2_000 }).catch(() => false))) {
      // close menu if open
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
    await item.click();
    await page.waitForTimeout(350);
  }

  const n = await page.locator("[data-widget-id]").count();
  return n;
}

/**
 * Pointer drag using product contract: drag handle = top HEADER_HEIGHT of widget.
 * Moves first widget toward the second widget center.
 */
async function pointerDragReorderFirstPastSecond(page: Page): Promise<void> {
  const widgets = page.locator("[data-widget-id]");
  await expect(widgets).toHaveCount(await widgets.count()); // stabilize
  const first = widgets.nth(0);
  const second = widgets.nth(1);
  await first.scrollIntoViewIfNeeded();
  await second.scrollIntoViewIfNeeded();

  const box1 = await first.boundingBox();
  const box2 = await second.boundingBox();
  if (!box1 || !box2) {
    throw new Error("Could not measure widget bounding boxes for drag");
  }

  const startX = box1.x + Math.min(40, box1.width / 2);
  const startY = box1.y + DRAG_HEADER_Y;
  const endX = box2.x + Math.min(40, box2.width / 2);
  // Drop past the vertical midpoint of the second widget to trigger insertion
  const endY = box2.y + box2.height * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Multi-step path so pointermove handlers fire (passive listeners need samples)
  await page.mouse.move(startX + (endX - startX) * 0.3, startY + (endY - startY) * 0.3, {
    steps: 8,
  });
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test.describe("Dashboard shell (widget-agnostic)", () => {
  test.setTimeout(120_000);

  test("admin can open dashboard shell", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await expect(page.getByTestId("dashboard-main")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("dashboard-toolbar")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("dashboard-ai-toggle")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("dashboard-plugin-slot")).toBeAttached();
  });

  test("shows empty state or widget grid (install-dependent)", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);

    // Wait for preferences load + registry
    await page.waitForTimeout(800);

    const empty = page.getByTestId("dashboard-empty-state");
    const grid = page.getByTestId("dashboard-widget-grid");

    const emptyVisible = await empty.isVisible({ timeout: 5_000 }).catch(() => false);
    const gridVisible = await grid.isVisible({ timeout: 2_000 }).catch(() => false);

    // Exactly one of empty or grid must be true for a healthy shell
    expect(emptyVisible || gridVisible).toBe(true);

    if (gridVisible) {
      const widgets = page.locator("[data-widget-id]");
      await expect(widgets.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
      // Do not assert specific component names — install-specific
      const count = await widgets.count();
      expect(count).toBeGreaterThan(0);
    } else {
      await expect(empty).toContainText(/empty|add widgets/i);
    }
  });

  test("Add Widget menu opens and lists install widgets when any remain", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await page.waitForTimeout(800);

    // Prefer toolbar add; fall back to empty-state CTA
    const addBtn = page.getByTestId("dashboard-add-widget");
    const addFirst = page.getByTestId("dashboard-add-first-widget");

    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
    } else if (await addFirst.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addFirst.click();
    } else {
      // All registry widgets already on grid — still valid for full installs
      const grid = page.getByTestId("dashboard-widget-grid");
      await expect(grid).toBeVisible({ timeout: ACTION_TIMEOUT });
      return;
    }

    const menu = page.getByTestId("dashboard-widget-menu");
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Menu items are install-specific; only require ≥1 menuitem OR "No widgets found"
    const items = menu.getByRole("menuitem");
    const none = menu.getByText(/no widgets found/i);
    const itemCount = await items.count();
    if (itemCount === 0) {
      await expect(none).toBeVisible({ timeout: ACTION_TIMEOUT });
    } else {
      await expect(items.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    }

    // Search box always present
    await expect(page.getByTestId("dashboard-widget-search")).toBeVisible();
  });

  test("can add first available widget then reset layout", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await page.waitForTimeout(800);

    // Reset first for clean state if widgets already present
    const reset = page.getByTestId("dashboard-reset-widgets");
    if (await reset.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await reset.click();
      await page.waitForTimeout(400);
    }

    const addBtn = page
      .getByTestId("dashboard-add-widget")
      .or(page.getByTestId("dashboard-add-first-widget"));
    await expect(addBtn.first()).toBeVisible({ timeout: ACTION_TIMEOUT });
    await addBtn.first().click();

    const menu = page.getByTestId("dashboard-widget-menu");
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT });

    const firstItem = menu.getByRole("menuitem").first();
    const hasItem = await firstItem.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasItem) {
      // No addable widgets in this install — still pass shell contract
      test.info().annotations.push({
        type: "note",
        description: "Install has no remaining widgets to add; add/reset path N/A",
      });
      return;
    }

    await firstItem.click();

    // Grid should show at least one widget (component name not asserted)
    await expect(page.getByTestId("dashboard-widget-grid")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.locator("[data-widget-id]").first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Reset
    await expect(page.getByTestId("dashboard-reset-widgets")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("dashboard-reset-widgets").click();
    await page.waitForTimeout(500);

    // After reset: empty state (preferences cleared)
    await expect(page.getByTestId("dashboard-empty-state")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("widget search filters menu without assuming catalog", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await page.waitForTimeout(800);

    const addBtn = page
      .getByTestId("dashboard-add-widget")
      .or(page.getByTestId("dashboard-add-first-widget"));
    if (
      !(await addBtn
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false))
    ) {
      return; // no add path
    }
    await addBtn.first().click();
    const menu = page.getByTestId("dashboard-widget-menu");
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT });

    const search = page.getByTestId("dashboard-widget-search");
    await search.fill("zzzz-no-such-widget-xyz");
    await expect(menu.getByText(/no widgets found/i)).toBeVisible({ timeout: ACTION_TIMEOUT });

    await search.fill("");
    // After clear, either items return or still none available
    await page.waitForTimeout(200);
  });
});

// ---------------------------------------------------------------------------
// Reorder: pointer drag + keyboard (widget-agnostic — only needs ≥2 widgets)
// ---------------------------------------------------------------------------
test.describe("Dashboard widget reorder", () => {
  test.setTimeout(150_000);

  test("pointer drag reorders widgets when ≥2 are present", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await page.waitForTimeout(600);

    const count = await ensureNWidgets(page, 2);
    // Core dashboard catalog must expose ≥2 widgets — hard-fail empty catalog soft-pass
    expect(
      count,
      `Install only has ${count} addable widget(s); pointer reorder needs ≥2 (core catalog required in CI)`,
    ).toBeGreaterThanOrEqual(2);

    await expect(page.getByTestId("dashboard-widget-grid")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.locator("[data-widget-id]")).toHaveCount(count, {
      timeout: ACTION_TIMEOUT,
    });

    const before = await widgetIdsInDomOrder(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    await pointerDragReorderFirstPastSecond(page);

    const after = await widgetIdsInDomOrder(page);
    expect(after.length).toBe(before.length);
    // DOM order must change (first widget no longer first)
    expect(after[0]).not.toBe(before[0]);
    // Same set of ids (reorder, not remove)
    expect([...after].sort()).toEqual([...before].sort());
  });

  test("keyboard Ctrl+Arrow reorders focused widget", async ({ page }) => {
    await loginAsAdmin(page, "/dashboard");
    await goDashboard(page);
    await page.waitForTimeout(600);

    const count = await ensureNWidgets(page, 2);
    expect(
      count,
      `Install only has ${count} widget(s); keyboard reorder needs ≥2 (core catalog required in CI)`,
    ).toBeGreaterThanOrEqual(2);

    const widgets = page.locator("[data-widget-id]");
    await expect(widgets.first()).toBeVisible({ timeout: ACTION_TIMEOUT });

    const before = await widgetIdsInDomOrder(page);
    const first = widgets.nth(0);
    await first.focus();
    // Product: Ctrl/Meta + ArrowRight|Down moves widget later in order
    await page.keyboard.press("Control+ArrowRight");
    await page.waitForTimeout(300);

    const after = await widgetIdsInDomOrder(page);
    expect(after.length).toBe(before.length);
    expect(after[0]).not.toBe(before[0]);
    expect([...after].sort()).toEqual([...before].sort());
  });
});
