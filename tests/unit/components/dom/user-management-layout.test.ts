/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/user-management-layout.test.ts
 * @description User-management chrome matches the shared table layout.
 *
 * Two layout regressions lived here: the header rule ended with the tablist (a
 * visible gap under “Invite User”), and the status facet chips occupied their own
 * row between the toolbar and the table. The rule now spans the whole header row
 * and the facets share the toolbar band with search / views / row actions.
 */

import { afterEach, describe, expect, it } from "vitest";
import UserManagement from "@src/routes/(app)/user/components/user-management.svelte";
import { renderComponent, settle, type RenderedComponent } from "./render";

const CURRENT_USER = {
  _id: "u1",
  username: "Rar9",
  email: "rkroells@web.de",
  role: "admin",
  roleIds: ["admin"],
  isAdmin: true,
  blocked: false,
  permissions: [],
};

const INITIAL_USERS = [
  {
    _id: "u1",
    username: "Rar9",
    email: "rkroells@web.de",
    role: "admin",
    blocked: false,
    is2FAEnabled: false,
    createdAt: "2026-10-25T18:00:00.000Z",
    updatedAt: "2026-10-25T18:00:00.000Z",
  },
];

describe("User management layout", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  function mount() {
    rendered = renderComponent(UserManagement, {
      currentUser: CURRENT_USER,
      isMultiTenant: false,
      roles: [],
      initialUsers: INITIAL_USERS,
      initialTotal: INITIAL_USERS.length,
    } as never);
  }

  it("spans the header rule across tabs and the invite action", async () => {
    mount();
    await settle();

    const header = rendered!.target.querySelector<HTMLElement>('[data-testid="user-admin-header"]');
    expect(header).toBeTruthy();
    // The rule moved from the tablist to the row itself, as an inset shadow so
    // the scrollable strip cannot clip the active underline over it.
    expect(header?.className).toContain("shadow-[inset_0_-1px_0_0_var(--admin-border-default)]");
    expect(header?.querySelector('[role="tablist"]')).toBeTruthy();
    expect(header?.querySelector('[data-testid="email-registration-token-btn"]')).toBeTruthy();
    // The tablist itself must not paint a second, shorter rule.
    expect(header?.querySelector('[role="tablist"]')?.className).not.toContain("shadow-[inset");
    expect(header?.querySelector('[role="tablist"]')?.className).not.toContain("border-b");
  });

  it("keeps the status facets on the toolbar row", async () => {
    mount();
    await settle();

    const toolbar = rendered!.target.querySelector<HTMLElement>(
      '[data-testid="user-admin-toolbar"]',
    );
    const facets = rendered!.target.querySelector<HTMLElement>('[data-testid="user-facets"]');

    expect(toolbar).toBeTruthy();
    expect(facets).toBeTruthy();
    expect(toolbar?.contains(facets!)).toBe(true);
    // The table follows the toolbar directly — no chips row in between.
    expect(facets?.closest("table")).toBeNull();
    expect(toolbar?.parentElement?.querySelector("table")).toBeTruthy();
  });
});
