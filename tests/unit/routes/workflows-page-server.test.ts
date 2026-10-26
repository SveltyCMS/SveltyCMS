/**
 * @file tests/unit/routes/workflows-page-server.test.ts
 * @description Admin gate for /config/workflows page.server.
 */

import { describe, it, expect } from "vitest";

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

  it("rejects non-admin", async () => {
    const { load } = await import("../../../src/routes/(app)/config/workflows/+page.server");
    await expect(
      load({
        locals: { user: { _id: "e1", role: "editor" }, isAdmin: false },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
