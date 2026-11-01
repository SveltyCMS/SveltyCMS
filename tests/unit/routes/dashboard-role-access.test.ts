/**
 * @file tests/unit/routes/dashboard-role-access.test.ts
 * @description Can a role that is NOT admin open `/dashboard`?
 *
 * `DEFAULT_AUTH_LANDING_PATH` is `/dashboard`, so post-auth landing is only safe
 * if the seeded non-admin roles can actually load it. The seeded sets grant
 * `system:dashboard` ("Access to the main administration dashboard", the id the
 * admin UI shows for the page) while the guard used to demand `dashboard:read`
 * ("View dashboard widgets and their metrics") — measured before this change:
 * developer, editor and guest all got `403` from the dashboard load.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@src/services/intelligence/behavioral-learner", () => ({
  getHotCollections: vi.fn().mockReturnValue([]),
}));

import { load } from "../../../src/routes/(app)/dashboard/+page.server";
import {
  DASHBOARD_ACCESS_PERMISSION_IDS,
  isDashboardAccessPermission,
  rolesGrantDashboardAccess,
} from "@src/databases/auth/dashboard-access";
import { DEFAULT_ROLE_GRANTS } from "@src/databases/auth/permission-catalog";

function localsFor(role: string, permissions: readonly string[], isAdmin = false) {
  return {
    user: { _id: { toString: () => "u1" }, email: `${role}@test.com`, role },
    isAdmin,
    roles: [{ _id: role, name: role, permissions: [...permissions] }],
    tenantId: "t1",
  };
}

describe("dashboard access for the seeded roles", () => {
  it("opens the dashboard for a seeded developer (system:dashboard only)", async () => {
    const data = (await load({
      locals: localsFor("developer", DEFAULT_ROLE_GRANTS.developer),
    } as never)) as { pageData: { isAdmin: boolean } };

    expect(data.pageData.isAdmin).toBe(false);
  });

  it("opens the dashboard for a seeded editor (system:dashboard only)", async () => {
    const data = (await load({
      locals: localsFor("editor", DEFAULT_ROLE_GRANTS.editor),
    } as never)) as { pageData: { isAdmin: boolean } };

    expect(data.pageData.isAdmin).toBe(false);
  });

  it("still opens it for the canonical dashboard:read grant", async () => {
    const data = (await load({
      locals: localsFor("custom", ["dashboard:read"]),
    } as never)) as { pageData: { user: { id: string }; isAdmin: boolean } };

    expect(data.pageData.user.id).toBe("u1");
    expect(data.pageData.isAdmin).toBe(false);
  });

  it("still refuses a role that grants neither id", async () => {
    await expect(
      load({ locals: localsFor("guest", DEFAULT_ROLE_GRANTS.guest) } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("always lets an admin in", async () => {
    const data = (await load({
      locals: localsFor("admin", [], true),
    } as never)) as { pageData: { isAdmin: boolean } };

    expect(data.pageData.isAdmin).toBe(true);
  });
});

describe("dashboard-access vocabulary", () => {
  it("treats both catalog ids as the dashboard grant", () => {
    expect(DASHBOARD_ACCESS_PERMISSION_IDS).toEqual(["dashboard:read", "system:dashboard"]);
    for (const id of DASHBOARD_ACCESS_PERMISSION_IDS) {
      expect(isDashboardAccessPermission(id), id).toBe(true);
    }
    expect(isDashboardAccessPermission("collections:read")).toBe(false);
  });

  it("finds the grant in any role and tolerates missing role data", () => {
    expect(rolesGrantDashboardAccess([{ permissions: ["system:dashboard"] }])).toBe(true);
    expect(
      rolesGrantDashboardAccess([{ permissions: ["collections:read"] }, { permissions: null }]),
    ).toBe(false);
    expect(rolesGrantDashboardAccess(undefined)).toBe(false);
    expect(rolesGrantDashboardAccess([])).toBe(false);
  });
});
