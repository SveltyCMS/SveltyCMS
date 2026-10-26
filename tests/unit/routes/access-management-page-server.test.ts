/**
 * @file tests/unit/routes/access-management-page-server.test.ts
 * @description Admin-only gate for access-management load.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/auth/permissions", () => ({
  getAllPermissions: vi.fn().mockReturnValue([
    { _id: "user:read", name: "Read users", type: "user" },
    { _id: "media:write", name: "Write media", type: "system" },
  ]),
}));

import { load } from "../../../src/routes/(app)/config/access-management/+page.server";

describe("access-management +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns roles and permissions for admin", async () => {
    const data: any = await load({
      locals: {
        user: { _id: { toString: () => "u1" }, email: "a@b.co", role: "admin" },
        isAdmin: true,
        roles: [{ _id: "admin", name: "Administrator", permissions: [] }],
        tenantId: "t1",
      },
    } as any);

    // `user` is owned by (app)/+layout.server.ts. Returning a slim
    // { _id, email, role } here shadowed the layout snapshot in the merged
    // `page.data`, which cost the sidebar its username/avatar on this route.
    expect(data).not.toHaveProperty("user");
    expect(Array.isArray(data.roles)).toBe(true);
    expect(Array.isArray(data.permissions)).toBe(true);
    expect(data.permissions.length).toBeGreaterThan(0);
    expect(data.roles[0]).toEqual(
      expect.objectContaining({
        _id: "admin",
        name: "Administrator",
        permissions: [],
        isAdmin: false,
      }),
    );
    expect(data.roles[0]).not.toHaveProperty("__bitset");
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({
        locals: {
          user: { _id: { toString: () => "u2" }, email: "e@b.co", role: "editor" },
          isAdmin: false,
          roles: [{ _id: "editor", permissions: ["collection:read"] }],
          tenantId: "t1",
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
