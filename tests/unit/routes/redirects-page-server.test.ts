/**
 * @file tests/unit/routes/redirects-page-server.test.ts
 * @description Admin gate for redirects load.
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

const findMock = vi.fn();

vi.mock("@src/databases/db", () => ({
  dbAdapter: {},
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      find: findMock,
    };
  },
}));

import { load } from "../../../src/routes/(app)/config/redirects/+page.server";

describe("redirects +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMock.mockResolvedValue({
      success: true,
      data: [{ _id: "r1", from: "/a", to: "/b", type: 301, active: true }],
    });
  });

  it("returns redirects for admin", async () => {
    const data = await load({
      locals: {
        user: { _id: { toString: () => "u1" }, email: "a@b.co", role: "admin" },
        isAdmin: true,
        tenantId: "t1",
      },
    } as any);

    expect(data.isAdmin).toBe(true);
    expect(data.redirects).toHaveLength(1);
    expect(data.redirects[0].from).toBe("/a");
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({
        locals: {
          user: { _id: { toString: () => "u2" }, email: "e@b.co", role: "editor" },
          isAdmin: false,
          tenantId: "t1",
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
