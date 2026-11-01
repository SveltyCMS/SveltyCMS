/**
 * @file tests/unit/components/dom/config-search-interaction.test.ts
 * @description Real DOM test for the `/config` tile search.
 *
 * The page shell is rendered for real; plugin slots and the admin-zone
 * registry are boundary mocks (they lazy-load plugin bundles that are not part
 * of this suite). RBAC is granted through the mocked `$app/state` page data.
 *
 * ### Features:
 * - the search input narrows the tile grid (alias term, not the title)
 * - the live result count matches the rendered tiles
 * - the empty state appears for a non-match and Clear restores every tile
 */

import { describe, expect, it, vi } from "vitest";
import ConfigPage from "@src/routes/(app)/config/+page.svelte";
import { click, renderPage, settle, typeText } from "./render";

vi.mock("$app/state", () => ({
  page: {
    url: new URL("http://localhost/config"),
    params: {},
    route: { id: "/config" },
    status: 200,
    error: null,
    data: { isAdmin: true, permissions: {}, isMultiTenant: false, tenantId: null },
    form: null,
  },
}));

// Plugin-provided zones lazy-load plugin bundles; inert stand-ins keep the test
// focused on the core tile grid (plugin tiles are hidden while searching).
vi.mock("@components/system/slot.svelte", () => ({ default: () => null }));
vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

function tileHrefs(target: HTMLElement): string[] {
  return [...target.querySelectorAll<HTMLAnchorElement>("a[href^='/config/']")].map(
    (a) => a.getAttribute("href") ?? "",
  );
}

describe("/config tile search (client interaction)", () => {
  it("narrows the grid by alias, shows the count, and clears back to all tiles", async () => {
    const rendered = renderPage(ConfigPage, {
      pluginStates: {},
      isAdmin: true,
      permissions: {},
    });
    try {
      const search = rendered.target.querySelector<HTMLInputElement>(
        "[data-testid='config-search']",
      );
      if (!search) throw new Error("search input not rendered");
      expect(search.getAttribute("type")).toBe("text");

      expect(tileHrefs(rendered.target)).toContain("/config/trash");

      // "cache" is only an alias (the tile title is "System Settings").
      await typeText(search, "cache");
      await settle();

      const filtered = tileHrefs(rendered.target);
      expect(filtered).toContain("/config/system-settings");
      expect(filtered).not.toContain("/config/trash");
      expect(
        rendered.target.querySelector("[data-testid='config-search-results']")?.textContent,
      ).toContain("Matching pages: 1");

      // No match → empty state + working clear button.
      await typeText(search, "zzzz no match");
      await settle();
      expect(rendered.target.querySelector("[data-testid='config-search-empty']")).toBeTruthy();

      await click(rendered.target.querySelector("[data-testid='config-search-clear']"));
      await settle();

      expect(tileHrefs(rendered.target)).toContain("/config/trash");
      expect(search.value).toBe("");
      expect(rendered.target.querySelector("[data-testid='config-search-empty']")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("shows an Editor the Design System and Dashboard tiles, never admin-only pages (retest m6)", () => {
    const rendered = renderPage(ConfigPage, {
      pluginStates: {},
      isAdmin: false,
      permissions: {
        "config:appearance": { hasPermission: true, isRateLimited: false },
        "system:dashboard": { hasPermission: true, isRateLimited: false },
      },
    });
    try {
      expect(rendered.target.querySelector("a[href='/config/design-system']")).not.toBeNull();
      expect(rendered.target.querySelector("a[href='/dashboard']")).not.toBeNull();

      for (const adminOnlyHref of [
        "/config/system-settings",
        "/config/access-management",
        "/config/automations",
        "/config/extensions",
        "/config/monitor",
        "/config/webhooks",
      ]) {
        expect(
          rendered.target.querySelector(`a[href='${adminOnlyHref}']`),
          adminOnlyHref,
        ).toBeNull();
      }

      expect(rendered.target.querySelector("[data-testid='config-no-access']")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });

  it("renders the no-access state when no tile is usable", () => {
    const rendered = renderPage(ConfigPage, {
      pluginStates: {},
      isAdmin: false,
      permissions: {},
    });
    try {
      expect(rendered.target.querySelector("[data-testid='config-no-access']")).not.toBeNull();
      expect(rendered.target.querySelector("a[href='/config/design-system']")).toBeNull();
      expect(rendered.target.querySelector("a[href='/dashboard']")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });
});
