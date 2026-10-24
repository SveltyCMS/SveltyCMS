/**
 * @file tests/unit/routes/config-page-server.test.ts
 * @description Permission contract for the `/config` workspace loader.
 *
 * The cache service is a boundary (mocked). Auth guards and the real 64-bit
 * permission engine stay live so the per-tile RBAC result is genuine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { load } from "../../../src/routes/(app)/config/+page.server";
import { cacheService } from "@src/databases/cache/cache-service";

type ConfigPageData = {
  user: { _id: string; email?: string; role?: string };
  permissions: Record<string, { hasPermission: boolean; isRateLimited?: boolean }>;
  allPermissions: unknown[];
  isAdmin: boolean;
  pluginStates: Record<string, boolean>;
};

type ConfigLocals = Record<string, unknown>;

function makeEvent(
  locals: ConfigLocals,
  pluginStates: Record<string, boolean> = {},
): Parameters<typeof load>[0] {
  return {
    locals,
    parent: async () => ({ pluginStates }),
  } as unknown as Parameters<typeof load>[0];
}

describe("config +page.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cacheService.get).mockResolvedValue(null);
    vi.mocked(cacheService.set).mockResolvedValue(undefined);
  });

  it("grants every config tile to an admin and serialises the user id (load-contract)", async () => {
    const data = (await load(
      makeEvent(
        {
          user: { _id: "u-admin", email: "admin@example.com", role: "admin" },
          isAdmin: true,
          roles: [],
          tenantId: "t1",
        },
        { "smart-importer": true },
      ),
    )) as unknown as ConfigPageData;

    const contextIds = Object.keys(data.permissions);
    expect(contextIds.length).toBeGreaterThan(0);
    expect(contextIds).toContain("config:media");

    for (const contextId of contextIds) {
      expect(data.permissions[contextId].hasPermission).toBe(true);
    }

    expect(data.user).toMatchObject({ _id: "u-admin", role: "admin" });
    expect(Array.isArray(data.allPermissions)).toBe(true);
    expect(data.allPermissions.length).toBeGreaterThan(0);
    expect(data.isAdmin).toBe(true);
    expect(data.pluginStates).toEqual({ "smart-importer": true });

    // Admin bypass never touches the permission cache.
    expect(vi.mocked(cacheService.get)).not.toHaveBeenCalled();
  });

  it("gates tiles per real RBAC for a non-admin and caches the result (failure-path)", async () => {
    const data = (await load(
      makeEvent({
        user: {
          _id: "u-editor",
          email: "editor@example.com",
          role: "editor",
          permissions: [],
        },
        isAdmin: false,
        roles: [{ _id: "editor", name: "Editor", permissions: ["media:write"], isAdmin: false }],
        tenantId: "t1",
      }),
    )) as unknown as ConfigPageData;

    expect(data.permissions["config:media"].hasPermission).toBe(true);
    expect(data.permissions["config:imageeditor"].hasPermission).toBe(true);
    expect(data.permissions["config:users"].hasPermission).toBe(false);
    expect(data.permissions["config:settings"].hasPermission).toBe(false);
    expect(data.isAdmin).toBe(false);

    expect(vi.mocked(cacheService.set)).toHaveBeenCalledWith(
      "config:permissions:u-editor",
      expect.objectContaining({ "config:users": { hasPermission: false, isRateLimited: false } }),
      300_000,
    );
  });

  it("rejects a user without a role with 403 (failure-path)", async () => {
    await expect(
      load(
        makeEvent({
          user: { _id: "u-norole", email: "norole@example.com" },
          isAdmin: false,
          roles: [],
          tenantId: "t1",
        }),
      ),
    ).rejects.toMatchObject({
      status: 403,
      body: { message: "User role is missing for user norole@example.com" },
    });
  });
});
