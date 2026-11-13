/**
 * @file tests/e2e/routes/config/surface-consistency.spec.ts
 * @description Pins the label ↔ page-title ↔ empty-state contract of the admin
 *   configuration surfaces.
 *
 * Contract: the label a user clicks (a `/config` hub tile, a System Settings group
 * rail item) must equal the heading of the surface it opens, and an empty state may
 * only point at actions that surface really offers. Long-form headings are tolerated
 * only through `TITLE_ALIASES`, where the reason is recorded next to the alias.
 *
 * The mismatches this spec was written against (all repaired in `src/messages/en.json`,
 * the shared owner of both strings):
 * - `config_tile_sync` "Content Sync" → the page heading "Config Sync & Backup"
 *   (the page syncs configuration/schema, not content — the tile was the stale side)
 * - `api_playground_title` "Developer & API Playground" → tile "API Playground"
 * - `automations_title` "Workflow Automations" → tile "Automations"
 * - `extensions_title` "Extension Management" → tile "Extensions"
 * - `redirects_title` "Redirect Manager" → tile "Redirects"
 * - `workflows_title` "Workflow Engine" → tile "Workflows"
 * The Trash tile intentionally keeps the one-word label while its page heading names
 * the wider scope (see `TITLE_ALIASES`).
 *
 * ### Features:
 * - iterates every hub tile and compares its visible label + accessible name to the
 *   destination's `data-testid="page-title"`
 * - requires the unconditional admin tiles to be present (a missing tile fails, it
 *   does not shrink the loop)
 * - asserts the hub search empty state's advertised action really clears the search
 * - asserts a settings rail item equals the panel heading it opens
 * - asserts the entry-list filtered empty state's remedies exist and restore the rows
 */

import { expect, test, type Locator, type Page } from "../../fixtures";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { TEST_API_HEADERS } from "../../helpers/api";
import { openCollectionEntries } from "../../helpers/collection-builder-flow";
import { seedCookieConsent } from "../../helpers/cookie-consent";

test.describe.configure({ mode: "serial", timeout: 180_000 });

interface HubTile {
  href: string;
  /** Visible label rendered inside the tile's `<p>`. */
  label: string;
  /** Accessible name (`aria-label`) — what a screen reader announces. */
  ariaLabel: string;
}

interface TitleAlias {
  heading: string;
  reason: string;
}

/**
 * A destination may deliberately use a longer heading than the hub tile. Each entry
 * must justify itself; the alias is compared instead of the tile label.
 */
const TITLE_ALIASES: Record<string, TitleAlias> = {
  "/config/trash": {
    heading: "Global Trash Bin",
    reason:
      "Deliberate wider scope: the page is the cross-collection bin (its own description: " +
      "'Browse and restore soft-deleted content from all collections'), so the heading names " +
      "the global scope while the tile/search keep the conventional one-word label 'Trash'.",
  },
};

/**
 * Destinations that render no `AdminPageShell` heading, so there is nothing to compare.
 * The tile label is still checked for the aria-label ↔ visible-label contract.
 */
const TILES_WITHOUT_PAGE_HEADING: Record<string, string> = {
  "/api/graphql":
    "The GraphQL tile opens the standalone GraphiQL console served by /api/graphql " +
    "(target=_blank); it is not an (app) route and renders no page-title.",
};

/**
 * Tiles an admin must see on `/config`. `tenants` is absent here because the tile is
 * conditionally rendered (`isMultiTenant`), and a single-tenant install legitimately
 * omits it; every rendered tile is still verified by the loop below.
 */
const REQUIRED_TILES = [
  "/config/system-settings",
  "/config/design-system",
  "/config/monitor",
  "/config/collectionbuilder",
  "/config/access-management",
  "/config/extensions",
  "/config/automations",
  "/config/workflows",
  "/config/queue",
  "/config/sync",
  "/config/api",
  "/api/graphql",
  "/dashboard",
  "/email-previews",
  "/config/webhooks",
  "/config/redirects",
  "/config/trash",
] as const;

/** Collapse the whitespace `innerText` introduces around block children. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Read an element's own text without the decorative icons (SVG, iconify hosts, and
 * emoji spans marked `aria-hidden`). Group icons are emoji for some settings groups,
 * and `innerText` would otherwise prepend `⚖️` to the heading being compared.
 */
async function readTextWithoutIcons(locator: Locator): Promise<string> {
  const text = await locator.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return clone.textContent ?? "";
  });
  return collapse(text);
}

/** Open the hub and read the tile grid from the rendered DOM. */
async function openConfigHub(page: Page): Promise<HubTile[]> {
  await page.goto("/config", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("config-search")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("page-title")).toHaveText(/system configuration/i, {
    timeout: 20_000,
  });

  // Tiles are the only anchors inside `main` that carry an accessible name and a <p>
  // label (sidebar links live in the <aside>; the PageTitle back control has no <p>).
  const anchors = await page
    .locator("main a[aria-label]")
    .filter({ has: page.locator("p") })
    .evaluateAll((elements) =>
      elements.map((anchor) => ({
        href: anchor.getAttribute("href") ?? "",
        label: (anchor.querySelector("p")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        ariaLabel: (anchor.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim(),
      })),
    );

  // Keep only real in-app tile destinations: no hash/skip links, no unlabelled hit areas.
  return anchors.filter((tile) => tile.href.startsWith("/") && tile.label.length > 0);
}

interface SettingRailItem {
  href: string;
  groupId: string;
  label: string;
}

/** Read the System Settings group rail rendered in the global left sidebar. */
async function readSettingRail(page: Page): Promise<SettingRailItem[]> {
  const links = page
    .getByTestId("app-left-sidebar")
    .locator('a[href^="/config/system-settings?group="]');
  await expect(links.first()).toBeVisible({ timeout: 20_000 });

  return links.evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      const match = /[?&]group=([^&]+)/.exec(href);
      // First non-decorative span inside the leading <div> is the group name. The
      // GroupIcon (emoji fallback) is aria-hidden, and the "needs configuration"
      // glyph lives in the trailing <div>, so neither can be mistaken for the label.
      const label = Array.from(anchor.querySelectorAll("div span")).find(
        (span) => span.getAttribute("aria-hidden") !== "true",
      )?.textContent;
      return {
        href,
        groupId: match ? decodeURIComponent(match[1]) : "",
        label: (label ?? "").replace(/\s+/g, " ").trim(),
      };
    }),
  );
}

test.describe("Config surfaces — label, heading and empty-state consistency", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    // The wizard/auth-setup phase resets the DB, so the shared storageState can be
    // stale; every spec in this file starts from a fresh admin login.
    await loginAsAdmin(page);
  });

  test("every hub tile opens the page whose heading repeats its label", async ({ page }) => {
    const tiles = await openConfigHub(page);

    // A missing tile must fail, not silently shrink the contract.
    for (const href of REQUIRED_TILES) {
      expect(
        tiles.some((tile) => tile.href === href),
        `the /config hub does not render the ${href} tile for an admin`,
      ).toBe(true);
    }

    // The label a user reads and the name assistive tech announces must agree.
    for (const tile of tiles) {
      expect(tile.label, `${tile.href} renders an empty tile label`).not.toBe("");
      expect(
        tile.ariaLabel,
        `${tile.href}: aria-label "${tile.ariaLabel}" diverges from the visible label "${tile.label}"`,
      ).toBe(tile.label);
    }

    for (const tile of tiles) {
      if (TILES_WITHOUT_PAGE_HEADING[tile.href]) continue;

      const alias = TITLE_ALIASES[tile.href];
      const expectedHeading = alias ? alias.heading : tile.label;

      await page.goto(tile.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const heading = page.getByTestId("page-title");
      await expect(heading, `${tile.href} rendered no page title`).toBeVisible({
        timeout: 20_000,
      });

      const headingText = await readTextWithoutIcons(heading);
      expect(
        headingText,
        `${tile.href}: the tile says "${tile.label}" but the page heading says "${headingText}"` +
          (alias ? ` (alias reason: ${alias.reason})` : ""),
      ).toBe(expectedHeading);
    }
  });

  test("the hub search empty state offers the action it names", async ({ page }) => {
    await openConfigHub(page);
    await waitForHydration(page);

    const search = page.getByTestId("config-search");
    const query = "zzzz-no-config-page";
    await search.fill(query);

    const emptyState = page.getByTestId("config-search-empty");
    await expect(emptyState).toBeVisible({ timeout: 15_000 });
    await expect(emptyState).toContainText(query);

    // The empty state names "Clear search" as the remedy — the control must exist …
    const clearSearch = emptyState.getByRole("button", { name: /clear search/i });
    await expect(clearSearch).toBeVisible();

    // … and really restore the tile grid.
    await clearSearch.click();
    await expect(page.getByTestId("config-search-empty")).toHaveCount(0, { timeout: 10_000 });
    await expect(search).toHaveValue("");
    await expect(page.locator('main a[href="/config/trash"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("a settings rail item equals the panel heading it opens", async ({ page }) => {
    await page.goto("/config/system-settings?group=site", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("page-title")).toHaveText(/system settings/i, {
      timeout: 20_000,
    });
    await waitForHydration(page);

    const rail = await readSettingRail(page);
    expect(rail.length, "the settings rail rendered no groups").toBeGreaterThan(1);

    const currentGroup = new URL(page.url()).searchParams.get("group");
    const targetIndex = rail.findIndex(
      (item) => item.groupId !== currentGroup && item.groupId !== "gdpr",
    );
    expect(targetIndex, "no second settings group to navigate to").toBeGreaterThanOrEqual(0);
    const target = rail[targetIndex];
    expect(target, `the settings rail item at ${targetIndex} disappeared`).toBeDefined();
    if (!target) return; // unreachable after the assertion above; narrows the type

    const railLink = page
      .getByTestId("app-left-sidebar")
      .locator('a[href^="/config/system-settings?group="]')
      .nth(targetIndex);
    await railLink.click();

    await expect(page).toHaveURL(new RegExp(`[?&]group=${target.groupId}`), {
      timeout: 20_000,
    });

    const panel = page.getByTestId(`settings-panel-${target.groupId}`);
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const panelHeading = panel.locator("h2").first();
    await expect(panelHeading).toBeVisible({ timeout: 10_000 });

    expect(
      await readTextWithoutIcons(panelHeading),
      `the rail says "${target.label}" but the panel heading differs`,
    ).toBe(target.label);
  });

  test("the entry-list filtered empty state offers remedies that restore the rows", async ({
    page,
  }) => {
    const collectionId = `surfaces_${Date.now().toString(36)}`;
    const seededTitle = "Surface consistency row";

    const created = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "create-collection",
        schema: {
          _id: collectionId,
          name: collectionId,
          path: `/collection/${collectionId}`,
          fields: [
            {
              db_fieldName: "title",
              label: "Title",
              widget: { Name: "Input" },
              type: "string",
              required: true,
            },
          ],
        },
      },
    });
    expect(created.ok(), `create-collection failed: ${created.status()}`).toBeTruthy();
    const createdBody = (await created.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
    };
    expect(
      createdBody.success,
      `create-collection rejected: ${createdBody.message ?? "no message"}`,
    ).toBe(true);

    const inserted = await page.request.post("/api/testing", {
      headers: TEST_API_HEADERS,
      data: {
        action: "insert",
        collectionId,
        data: { title: seededTitle },
      },
    });
    expect(inserted.ok(), `insert failed: ${inserted.status()}`).toBeTruthy();

    await openCollectionEntries(page, collectionId);
    await waitForHydration(page);

    const row = page.getByRole("row").filter({ hasText: seededTitle }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Drive the empty state through the offered search control.
    await page
      .getByRole("button", { name: /^search$/i })
      .first()
      .click();
    const searchBox = page.getByRole("textbox", { name: /search for items in the table/i }).first();
    await expect(searchBox).toBeVisible({ timeout: 10_000 });
    await searchBox.fill("zzzz-no-such-entry");

    const emptyTitle = page.getByText("No entries match filters", { exact: true });
    await expect(emptyTitle).toBeVisible({ timeout: 20_000 });

    // The copy names two remedies — "clear filters" and "adjust search". Both
    // controls must exist on this surface.
    await expect(page.getByRole("button", { name: /clear all filters/i })).toBeVisible();
    await expect(searchBox).toHaveValue("zzzz-no-such-entry");

    // "Adjust search" really restores the seeded row.
    await searchBox.fill("");
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(emptyTitle).toHaveCount(0, { timeout: 10_000 });
  });
});
