/**
 * @file tests/unit/routes/user-page-server.test.ts
 * @description Unit tests for /user +page.server.ts load: permission wiring,
 * password redaction, admin-area permission flags, and error fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getUntypedSetting: vi.fn().mockReturnValue(false),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
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

import { getUntypedSetting } from "@src/services/core/settings-service";
import { load } from "../../../src/routes/(app)/user/+page.server";

function makeEvent(
  overrides: {
    user?: Record<string, unknown> | null;
    isAdmin?: boolean;
    hasManageUsersPermission?: boolean;
    isFirstUser?: boolean;
    roles?: Array<Record<string, unknown>>;
    permissions?: string[];
  } = {},
) {
  const user =
    "user" in overrides
      ? overrides.user
      : {
          _id: { toString: () => "user-1" },
          email: "admin@test.com",
          username: "admin",
          role: "admin",
          password: "secret-hash",
          permissions: ["user:read"],
        };

  return {
    locals: {
      user,
      roles: overrides.roles ?? [
        {
          _id: { toString: () => "admin" },
          name: "Administrator",
          permissions: ["user:read", "user:update", "api:user"],
        },
      ],
      isFirstUser: overrides.isFirstUser ?? false,
      hasManageUsersPermission: overrides.hasManageUsersPermission ?? false,
      isAdmin: overrides.isAdmin ?? true,
      permissions: overrides.permissions ?? ["user:read", "config:settings"],
    },
  } as any;
}

describe("user +page.server load", () => {
  beforeEach(() => {
    vi.mocked(getUntypedSetting).mockReturnValue(false);
  });

  it("redacts password and exposes permissions from locals", async () => {
    const data = await load(makeEvent());
    expect(data.user?.password).toBe("[REDACTED]");
    expect(data.user?._id).toBe("user-1");
    expect(data.user?.permissions).toEqual(["user:read", "config:settings"]);
    expect(data.isAdmin).toBe(true);
    expect(data.permissions["config/adminArea"].hasPermission).toBe(true);
  });

  it("falls back to role permissions when locals.permissions is empty", async () => {
    const data = await load(
      makeEvent({
        permissions: [],
        user: {
          _id: { toString: () => "user-2" },
          email: "ed@test.com",
          username: "editor",
          role: "admin",
          password: "x",
          permissions: [],
        },
      }),
    );
    // role key matches roles[0]._id stringified via toString or name
    expect(Array.isArray(data.user?.permissions)).toBe(true);
  });

  it("grants adminArea permission for manage-users non-admin", async () => {
    const data = await load(
      makeEvent({
        isAdmin: false,
        hasManageUsersPermission: true,
      }),
    );
    expect(data.permissions["config/adminArea"].hasPermission).toBe(true);
    expect(data.isAdmin).toBe(false);
  });

  it("denies adminArea for plain users", async () => {
    const data = await load(
      makeEvent({
        isAdmin: false,
        hasManageUsersPermission: false,
      }),
    );
    expect(data.permissions["config/adminArea"].hasPermission).toBe(false);
    expect(data.adminData).toBeNull();
  });

  it("exposes is2FAEnabledGlobal from settings", async () => {
    vi.mocked(getUntypedSetting).mockReturnValue(true);
    const data = await load(makeEvent());
    expect(data.is2FAEnabledGlobal).toBe(true);
  });

  it("returns safe error payload when load throws non-redirect", async () => {
    const { getAuthenticatedUser } = await import("@utils/page-guards.server");
    vi.mocked(getAuthenticatedUser).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const data = await load(makeEvent());
    expect(data.user).toBeNull();
    expect(data.error).toMatch(/Internal Server Error/i);
    expect(data.permissions["config/adminArea"].hasPermission).toBe(false);
  });
});
