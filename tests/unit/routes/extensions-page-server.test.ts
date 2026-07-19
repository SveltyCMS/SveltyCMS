/**
 * @file tests/unit/routes/extensions-page-server.test.ts
 * @description Admin gate for extensions load.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) throw Object.assign(new Error("redirect"), { status: 302 });
    return locals.user;
  }),
}));

vi.mock("@src/plugins", () => ({
  pluginRegistry: {
    getAll: vi.fn(() => [
      {
        metadata: {
          id: "demo-plugin",
          name: "Demo",
          version: "1.0.0",
          description: "d",
          author: "a",
          icon: "mdi:puzzle",
          enabled: true,
        },
      },
    ]),
    getPluginState: vi.fn(async () => ({ enabled: true })),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => null),
}));

import { load } from "../../../src/routes/(app)/config/extensions/+page.server";

describe("extensions +page.server load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns plugins for admin", async () => {
    const data = await load({
      locals: { user: { _id: "u1", role: "admin" }, isAdmin: true, tenantId: "t1" },
    } as any);
    expect(data.isAdmin).toBe(true);
    expect(data.plugins).toHaveLength(1);
    expect(data.plugins[0].name).toBe("demo-plugin");
  });

  it("throws 403 for non-admin even if role string is admin-like", async () => {
    await expect(
      load({
        locals: { user: { _id: "u2", role: "editor" }, isAdmin: false, tenantId: "t1" },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
