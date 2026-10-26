/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/left-sidebar-username.test.ts
 * @description The sidebar identity block must read the layout-owned user snapshot.
 *
 * SvelteKit merges PAGE data over LAYOUT data. Several `(app)` page loads return a
 * slim `user` ({_id, email, role, permissions}) for their own permission gating, so
 * `page.data.user.username` was empty on those routes and the sidebar painted the
 * avatar without its name. Shared chrome reads `layoutUser` instead.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import LeftSidebar from "@src/components/left-sidebar.svelte";
import { renderComponent, settle, type RenderedComponent } from "./render";

vi.mock("$app/state", () => ({
  page: {
    url: new URL("http://localhost/en/collection/pages"),
    data: {
      // What a config page returns — shadows the layout key in merged page data.
      user: { _id: "u1", email: "rkroells@web.de", role: "admin", permissions: [] },
      // What the (app) layout returns.
      layoutUser: {
        _id: "u1",
        email: "rkroells@web.de",
        username: "Rar9",
        role: "admin",
        permissions: [],
      },
      collectionOrder: {},
      predictedNextPath: null,
    },
  },
}));

describe("Left sidebar identity", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    vi.unstubAllGlobals();
  });

  it("shows the layout snapshot's username when a page shadows `user`", async () => {
    // VersionCheck probes the network on mount; the sidebar test only cares about identity.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );

    rendered = renderComponent(LeftSidebar);
    await settle();

    const profileLink = rendered.target.querySelector("[data-testid='nav-user-profile']");
    expect(profileLink, "profile link not rendered").toBeTruthy();
    expect(profileLink?.textContent).toContain("Rar9");

    // The slim page payload must not win.
    expect(rendered.target.textContent).not.toContain("rkroells@web.de");
  });
});
