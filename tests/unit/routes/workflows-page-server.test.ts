/**
 * @file tests/unit/routes/workflows-page-server.test.ts
 * @description Admin gate for /config/workflows page.server.
 */

import { describe, it, expect, vi } from "vitest";

describe("workflows +page.server admin gate", () => {
  it("allows admin", async () => {
    const { load } = await import("../../../src/routes/(app)/config/workflows/+page.server");
    const result: any = await load({
      locals: { user: { _id: "a1", role: "admin" }, isAdmin: true },
    } as any);
    // Contract: the page no longer shadows page.data.user (partial shapes broke
    // floatingNavStore.bindUser) — it only adds builder chrome for the workflow form.
    expect(result).toMatchObject({ isAdmin: true });
    expect(result).not.toHaveProperty("user");
    expect(Array.isArray(result.collections)).toBe(true);
    expect(Array.isArray(result.roles)).toBe(true);
  });

  it("still renders the builder when collections/roles lookups fail", async () => {
    // Regression: the chrome queries used to be awaited together, so a single
    // failure (demo/large/legacy install) turned the whole editor into a 500.
    vi.resetModules();
    vi.doMock("@src/content/index.server", () => ({
      contentSystem: {
        getCollections: () => {
          throw new Error("collections unavailable");
        },
      },
    }));
    vi.doMock("@src/databases/db", () => ({
      dbAdapter: {
        auth: {
          getAllRoles: async () => {
            throw new Error("roles unavailable");
          },
        },
      },
    }));

    try {
      const { load } = await import("../../../src/routes/(app)/config/workflows/+page.server");
      const result: any = await load({
        locals: { user: { _id: "a1", role: "admin" }, isAdmin: true },
      } as any);

      expect(result).toMatchObject({ isAdmin: true, collections: [], roles: [] });
    } finally {
      vi.doUnmock("@src/content/index.server");
      vi.doUnmock("@src/databases/db");
      vi.resetModules();
    }
  });

  it("rejects non-admin", async () => {
    const { load } = await import("../../../src/routes/(app)/config/workflows/+page.server");
    await expect(
      load({
        locals: { user: { _id: "e1", role: "editor" }, isAdmin: false },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
