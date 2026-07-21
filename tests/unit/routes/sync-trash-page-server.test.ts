/**
 * @file tests/unit/routes/sync-trash-page-server.test.ts
 * @description Admin gates for config sync + global trash.
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

import { load as loadSync } from "../../../src/routes/(app)/config/sync/+page.server";
import { load as loadTrash } from "../../../src/routes/(app)/config/trash/+page.server";

describe("sync +page.server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admin", async () => {
    const data: any = await loadSync({
      locals: { user: { _id: "u1", email: "a@b.co" }, isAdmin: true },
    } as any);
    expect(data.user.email).toBe("a@b.co");
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      loadSync({
        locals: { user: { _id: "u2", email: "e@b.co" }, isAdmin: false },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("trash +page.server", () => {
  it("allows admin / rejects non-admin", async () => {
    await expect(
      loadTrash({ locals: { user: { _id: "u1" }, isAdmin: true } } as any),
    ).resolves.toMatchObject({ isAdmin: true });
    await expect(
      loadTrash({ locals: { user: { _id: "u2" }, isAdmin: false } } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
