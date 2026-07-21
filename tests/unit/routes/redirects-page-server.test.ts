/**
 * @file tests/unit/routes/redirects-page-server.test.ts
 * @description Admin gate for redirects load (redirectsMV primary path).
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

const findManyMock = vi.fn();
const collectionFindMock = vi.fn();

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      find: (...args: unknown[]) => collectionFindMock(...args),
    };
  },
}));

import { load } from "../../../src/routes/(app)/config/redirects/+page.server";

describe("redirects +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // MV primary: UI from/to maps from source/target
    findManyMock.mockResolvedValue({
      success: true,
      data: [{ _id: "r1", source: "/a", target: "/b", type: 301, active: true }],
    });
    collectionFindMock.mockResolvedValue({ success: true, data: [] });
  });

  it("returns redirects for admin from redirectsMV", async () => {
    const data: any = await load({
      locals: {
        user: { _id: { toString: () => "u1" }, email: "a@b.co", role: "admin" },
        isAdmin: true,
        tenantId: "t1",
      },
    } as any);

    expect(data.isAdmin).toBe(true);
    expect(findManyMock).toHaveBeenCalledWith(
      "redirectsMV",
      expect.anything(),
      expect.objectContaining({ limit: 500 }),
    );
    expect(data.redirects).toHaveLength(1);
    expect(data.redirects[0].from).toBe("/a");
    expect(data.redirects[0].to).toBe("/b");
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
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
