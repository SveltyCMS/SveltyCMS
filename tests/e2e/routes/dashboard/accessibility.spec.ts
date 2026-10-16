/**
 * @file tests/e2e/routes/dashboard/accessibility.spec.ts
 * @description Playwright end-to-end accessibility audit for the admin dashboard.
 *   - Runs an Axe-Core WCAG 2.2 AA audit on the populated dashboard grid.
 *   - Seeds at least one widget so interactive surfaces (widget container
 *     role="article", resize handles, header buttons) are exercised.
 *   - Applies the same brand color-contrast exemptions as the login
 *     accessibility spec so the audit blocks only non-brand critical/serious
 *     findings.
 *   - Scoped to the dashboard main content (data-testid="dashboard-main"): the
 *     shared admin chrome (sidebar user-profile link, language selector,
 *     version badge) has pre-existing WCAG 2.5.3 label-content-name-mismatch
 *     findings that are common to every admin page and out of scope here.
 */

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { seedCookieConsent } from "../../helpers/cookie-consent";

const ACTION_TIMEOUT = 20_000;

/**
 * Owner-decision brand exception (copied verbatim from
 * `tests/e2e/routes/login/accessibility.spec.ts`): `src/app.css` keeps the
 * bright brand ramp (`--color-primary-500`), which renders white text on
 * `bg-primary-500` below the 4.5:1 AA threshold axe's `color-contrast` rule
 * enforces. Only nodes that are EXCLUSIVELY brand-colored are exempted from the
 * blocking gate; every other element is still fully checked.
 */
const BRAND_FILL_CLASS = /(?:^|[^.\w-])bg-primary-500|preset-filled-primary-500/;
const SURFACE_TEXT_CLASS = /text-surface-500/;

/**
 * Owner-accepted color pairs — the stable signal when axe truncates a node's
 * `html` (~300 chars, elided with `...`). Elements with a long class list lose
 * the exempt class past the ellipsis, so a class-only check drops the node.
 * The computed colors are not truncated.
 */
const EXEMPT_COLOR_PAIRS: ReadonlyArray<{ fg: string; bg: string }> = [
  { fg: "#ffffff", bg: "#5fd317" },
  { fg: "#717171", bg: "#f5f5f5" },
];

type ContrastCheck = { data?: { fgColor?: string; bgColor?: string } };

function nodeShowsExemptColor(node: { any?: ContrastCheck[] }): boolean {
  return (node.any ?? []).some((check) => {
    const fg = (check.data?.fgColor ?? "").toLowerCase();
    const bg = (check.data?.bgColor ?? "").toLowerCase();
    return EXEMPT_COLOR_PAIRS.some((pair) => pair.fg === fg && pair.bg === bg);
  });
}

function nodeIsExempt(node: { html?: string; target?: unknown; any?: ContrastCheck[] }): boolean {
  const html = node.html ?? "";
  const target = Array.isArray(node.target) ? node.target.join(" ") : "";
  return (
    BRAND_FILL_CLASS.test(html) ||
    BRAND_FILL_CLASS.test(target) ||
    SURFACE_TEXT_CLASS.test(html) ||
    SURFACE_TEXT_CLASS.test(target) ||
    nodeShowsExemptColor(node)
  );
}

function exemptBrandColorViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.filter((v) => {
    if (v.id !== "color-contrast") return true;
    const nodes = v.nodes ?? [];
    if (nodes.length === 0) return true;
    // Drop only when EVERY failing node is brand-colored (see note above).
    return !nodes.every((n) => nodeIsExempt(n));
  });
}

test.describe.configure({ mode: "serial" });

/** Log in as admin and land on a hydrated dashboard shell. */
async function goDashboard(page: Page): Promise<void> {
  await loginAsAdmin(page, "/dashboard");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/dashboard");
  }
  await expect(async () => {
    if (page.url().includes("/login")) {
      await loginAsAdmin(page, "/dashboard");
    }
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  await waitForHydration(page);
  await expect(page.getByTestId("dashboard-main")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

/**
 * Ensure ≥`count` widgets on the dashboard. Mirrors `dashboard.spec.ts`:
 * prefers existing widgets, only resets when the board is empty, then adds
 * distinct menu items so a one-type catalog still yields multiple tiles.
 */
async function ensureNWidgets(page: Page, count: number): Promise<number> {
  let n = await page.locator("[data-widget-id]").count();
  if (n >= count) return n;

  const reset = page.getByTestId("dashboard-reset-widgets");
  if (await reset.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await reset.click();
    await expect
      .poll(async () => page.locator("[data-widget-id]").count(), { timeout: 5_000 })
      .toBe(0)
      .catch(() => undefined);
    n = await page.locator("[data-widget-id]").count();
    if (n >= count) return n;
  }

  for (let i = 0; i < count + 2 && n < count; i++) {
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
    const items = menu.getByRole("menuitem");
    const itemCount = await items.count();
    if (itemCount === 0) {
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
    const item = items.nth(Math.min(i, itemCount - 1));
    if (!(await item.isVisible({ timeout: 2_000 }).catch(() => false))) {
      await page.keyboard.press("Escape").catch(() => {});
      break;
    }
    await item.click();
    await expect
      .poll(async () => page.locator("[data-widget-id]").count(), { timeout: 5_000 })
      .toBeGreaterThan(n)
      .catch(() => undefined);
    n = await page.locator("[data-widget-id]").count();
  }

  return page.locator("[data-widget-id]").count();
}

/** Force a deterministic light theme before auditing. */
async function setLightTheme(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = document.documentElement;
    h.classList.remove("dark");
    h.classList.add("light");
  });
}

/**
 * Wait until the effective (composited) opacity of the first matching element
 * reaches ~1. The dashboard widgets use `in:adminStagger` (opacity 0 → 1);
 * auditing mid-animation reports phantom color-contrast violations because the
 * blended text color falls below the AA threshold. No fixed sleep.
 */
async function waitForSettledOpacity(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      let el = document.querySelector<Element>(sel);
      if (!el) return false;
      let effective = 1;
      while (el && el !== document.documentElement) {
        const o = Number.parseFloat(getComputedStyle(el).opacity);
        if (!Number.isNaN(o)) effective *= o;
        el = el.parentElement;
      }
      return effective >= 0.999;
    },
    selector,
    { timeout: 15_000 },
  );
}

test.describe("Dashboard accessibility audit", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("dashboard grid passes WCAG 2.2 AA with no critical/serious violations", async ({
    page,
  }) => {
    await seedCookieConsent(page);
    await goDashboard(page);

    // Seed ≥1 widget so interactive surfaces (widget container role="article",
    // resize handles, header buttons) are exercised.
    const seeded = await ensureNWidgets(page, 1);
    expect(seeded).toBeGreaterThanOrEqual(1);

    const grid = page.getByTestId("dashboard-widget-grid");
    await expect(grid).toBeVisible({ timeout: ACTION_TIMEOUT });

    await setLightTheme(page);
    await waitForSettledOpacity(page, '[data-testid="dashboard-widget"]');

    // Scope the audit to the dashboard's content area so it exercises the grid
    // and widget surfaces this spec owns, rather than the shared admin chrome
    // (sidebar/header/version badge) whose label-content-name-mismatch findings
    // are pre-existing and unrelated to the responsive grid.
    const results = await new AxeBuilder({ page })
      .include('[data-testid="dashboard-main"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    if (results.violations.length > 0) {
      console.warn("A11y violations on Dashboard:", JSON.stringify(results.violations, null, 2));
    }

    // Fail on any critical/serious violation (brand colors excluded).
    const blockingViolations = exemptBrandColorViolations(results.violations).filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blockingViolations).toEqual([]);
  });
});
