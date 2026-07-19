/**
 * @file tests/unit/routes/system-settings-page-server.test.ts
 * @description Permission gate for system-settings load (admin or config:settings).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) {
      const err = new Error("redirect") as Error & { status: number };
      err.status = 302;
      throw err;
    }
    return locals.user;
  }),
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasPermissionWithRoles: vi.fn((user: any, perm: string, roles: any[]) => {
    if (user?.isAdmin) return true;
    return (roles ?? []).some((r: any) => (r.permissions ?? []).includes(perm));
  }),
}));

// admin.remote side-effect import
vi.mock("../../../src/routes/(app)/config/system-settings/admin.remote", () => ({}));

import { load } from "../../../src/routes/(app)/config/system-settings/+page.server";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";

describe("system-settings +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admin", async () => {
    const data = await load({
      locals: {
        user: { _id: { toString: () => "u1" }, email: "a@b.co", role: "admin" },
        isAdmin: true,
        roles: [],
      },
    } as any);
    expect(data.isAdmin).toBe(true);
    expect(data.user._id).toBe("u1");
  });

  it("allows non-admin with config:settings", async () => {
    vi.mocked(hasPermissionWithRoles).mockReturnValue(true);
    const data = await load({
      locals: {
        user: { _id: { toString: () => "u2" }, email: "e@b.co", role: "editor" },
        isAdmin: false,
        roles: [{ permissions: ["config:settings"] }],
      },
    } as any);
    expect(data.isAdmin).toBe(false);
    expect(data.user._id).toBe("u2");
  });

  it("throws 403 without permission", async () => {
    vi.mocked(hasPermissionWithRoles).mockReturnValue(false);
    await expect(
      load({
        locals: {
          user: { _id: { toString: () => "u3" }, email: "v@b.co", role: "viewer" },
          isAdmin: false,
          roles: [{ permissions: ["collection:read"] }],
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
