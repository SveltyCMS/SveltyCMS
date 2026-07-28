/**
 * @file tests/unit/routes/automations-page-server.test.ts
 * @description Admin gate for automations list page.
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

import { load } from "../../../src/routes/(app)/config/automations/+page.server";

describe("automations +page.server load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admin", async () => {
    const data: any = await load({
      locals: { user: { _id: "u1" }, isAdmin: true },
    } as any);
    expect(data.isAdmin).toBe(true);
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({ locals: { user: { _id: "u2" }, isAdmin: false } } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
