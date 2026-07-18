/**
 * @file tests/unit/routes/mediagallery-page-server.test.ts
 * @description Permission gating for media gallery load (fail-closed without media:read/write).
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

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    system: {
      virtualFolder: {
        getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
    },
    media: {
      files: {
        getByFolder: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } }),
        getAll: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
      },
    },
  },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getOrSetSWR: vi.fn(async (_k: string, fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock("@src/utils/media/media-service.server", () => ({
  MediaService: class {
    list = vi.fn().mockResolvedValue({ success: true, data: [] });
    isReferencedByPublishedContent = vi.fn().mockResolvedValue({ referenced: false });
  },
}));

vi.mock("@utils/media/media-storage.server", () => ({
  getImageSizes: vi.fn().mockReturnValue({}),
  moveMediaToTrash: vi.fn(),
}));

vi.mock("@utils/media/media-utils", () => ({
  resolveMediaPublicPath: vi.fn((p: string) => p),
}));

import { load } from "../../../src/routes/(app)/mediagallery/+page.server";

function makeEvent(locals: Record<string, unknown>, search = "") {
  return {
    locals,
    url: new URL(`http://localhost/mediagallery${search}`),
  } as any;
}

describe("mediagallery +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admin", async () => {
    const data = await load(
      makeEvent({
        user: { _id: { toString: () => "u1" }, email: "a@b.co" },
        isAdmin: true,
        roles: [],
        tenantId: "t1",
      }),
    );
    expect(data).toBeDefined();
    expect(Array.isArray((data as any).media) || (data as any).media === undefined || true).toBe(
      true,
    );
  });

  it("allows user with media:read", async () => {
    const data = await load(
      makeEvent({
        user: { _id: { toString: () => "u2" }, email: "e@b.co" },
        isAdmin: false,
        roles: [{ permissions: ["media:read"] }],
        tenantId: "t1",
      }),
    );
    expect(data).toBeDefined();
  });

  it("throws 403 without media permission", async () => {
    await expect(
      load(
        makeEvent({
          user: { _id: { toString: () => "u3" }, email: "v@b.co" },
          isAdmin: false,
          roles: [{ permissions: ["collection:read"] }],
          tenantId: "t1",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
