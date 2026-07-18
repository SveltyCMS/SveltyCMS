/**
 * @file tests/unit/routes/workflows-page-server.test.ts
 * @description Admin gate for /config/workflows page.server.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals.user) {
      const err: any = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }
    return locals.user;
  }),
}));

describe("workflows +page.server admin gate", () => {
  it("allows admin", async () => {
    const { load } = await import("../../../src/routes/(app)/config/workflows/+page.server");
    const result = await load({
      locals: { user: { _id: "a1", role: "admin" }, isAdmin: true },
    } as any);
    expect(result).toEqual({ isAdmin: true });
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
