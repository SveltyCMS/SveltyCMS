/**
 * @file tests/unit/routes/plugin-index-page-server.test.ts
 * @description `/plugin` index redirects to the first registered plugin nav item,
 * falling back to the config workspace when the registry is empty.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/plugins/plugin-page-registry.svelte.ts", () => ({
  pluginPageRegistry: { getNavItems: vi.fn() },
}));

import { load } from "../../../src/routes/(app)/plugin/+page.server";
import { pluginPageRegistry } from "@src/plugins/plugin-page-registry.svelte.ts";

interface NavItem {
  id: string;
  path: string;
  group: string;
  label: string;
  order: number;
}

function navItem(path: string, id = "smart-importer"): NavItem {
  return {
    id,
    path,
    group: "tools",
    label: "Smart Importer",
    order: 0,
  };
}

function mockNavItems(items: NavItem[]): void {
  // The mocked module types `getNavItems` as returning an empty tuple.
  vi.mocked(pluginPageRegistry.getNavItems).mockReturnValue(items as never);
}

describe("plugin index +page.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the first registered plugin page (load-contract)", async () => {
    mockNavItems([navItem("/plugin/smart-importer")]);

    await expect(load()).rejects.toMatchObject({
      status: 302,
      location: "/plugin/smart-importer",
    });
  });

  it("falls back to /config when no plugin page is registered (failure-path)", async () => {
    mockNavItems([]);

    await expect(load()).rejects.toMatchObject({
      status: 302,
      location: "/config",
    });
  });
});
