/**
 * @file tests/unit/api/trash-utility.test.ts
 * @description `GET /api/trash` projection contract (N3 residual).
 *
 * The SSR trash page and the API handler must return the same row shape: a
 * client refresh used to replace the projected SSR rows with raw adapter rows,
 * so legacy soft-deleted entries lost their title and audit fallbacks. The
 * shared `toTrashItem` projection now drives both paths.
 *
 * ### Features tested
 * - empty shape (`{ success: true, data: [] }`)
 * - success shape with collection attribution
 * - title fallback: localized title → `name` → `data` JSON → first display string (page renders `_id`)
 * - delete audit fallback: `deletedAt`/`deletedBy` → `updatedAt`/`updatedBy`
 * - tenant scoping + `includeDeleted` on every `findMany` call
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { handleUtilityRoutes } from "@src/routes/api/[...path]/handlers/utility";

const { mockGetCollections, mockFindMany } = vi.hoisted(() => ({
  mockGetCollections: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: { getCollections: mockGetCollections },
}));

function makeEvent(path = "/api/trash"): RequestEvent {
  return {
    locals: { user: { _id: "admin-1", role: "admin", isAdmin: true } },
    url: new URL(`http://localhost${path}`),
    request: { method: "GET", headers: new Headers() },
  } as unknown as RequestEvent;
}

async function getTrash(path = "/api/trash") {
  const cms = { db: { crud: { findMany: mockFindMany } } } as never;
  const response = await handleUtilityRoutes(makeEvent(path), cms, "tenant-1" as never, ["trash"]);
  return { status: response.status, body: await response.json() };
}

describe("GET /api/trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty successful envelope when no collection has deleted rows", async () => {
    mockGetCollections.mockResolvedValue([{ _id: "posts", name: "Posts" }]);
    mockFindMany.mockResolvedValue({ success: true, data: [] });

    const { status, body } = await getTrash();

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: [] });
  });

  it("projects rows with collection attribution and the shared title fallback", async () => {
    mockGetCollections.mockResolvedValue([{ _id: "posts", name: "Posts" }]);
    mockFindMany.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "entry-1",
          title: { de: "Hallo" },
          data: JSON.stringify({ subtitle: "Unused because title wins" }),
          deletedAt: "2026-01-02T03:04:05.000Z",
          deletedBy: "user-42",
        },
        {
          _id: "entry-2",
          data: JSON.stringify({ title: "From data blob" }),
          updatedAt: "2026-01-01T00:00:00.000Z",
          updatedBy: "user-7",
        },
        {
          _id: "entry-3",
          name: "Named entry",
          deletedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
    });

    const { status, body } = await getTrash();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((item: { _id: string }) => item._id)).toEqual([
      "entry-3",
      "entry-1",
      "entry-2",
    ]);
    expect(body.data[1]).toMatchObject({
      _id: "entry-1",
      title: "Hallo",
      collectionId: "posts",
      collectionName: "Posts",
      deletedAt: "2026-01-02T03:04:05.000Z",
      deletedBy: "user-42",
    });
    // Legacy row: title from the `data` blob, audit pair from updatedAt/updatedBy.
    expect(body.data[2]).toMatchObject({
      _id: "entry-2",
      title: "From data blob",
      deletedAt: "2026-01-01T00:00:00.000Z",
      deletedBy: "user-7",
    });
    // No display field at all — the page renders `_id`, not a fabricated title.
    expect(body.data[0].title).toBe("Named entry");
  });

  it("scopes every collection read to the tenant and opts into deleted rows", async () => {
    mockGetCollections.mockResolvedValue([
      { _id: "posts", name: "Posts" },
      { _id: "pages", name: "Pages" },
      { name: "No id — skipped" },
    ]);
    mockFindMany.mockResolvedValue({ success: true, data: [] });

    await getTrash("/api/trash?limit=10");

    expect(mockFindMany).toHaveBeenCalledTimes(2);
    for (const [collection, query, options] of mockFindMany.mock.calls) {
      expect(typeof collection).toBe("string");
      expect(query).toEqual({ isDeleted: true });
      expect(options).toMatchObject({
        tenantId: "tenant-1",
        includeDeleted: true,
        limit: 20,
      });
    }
  });

  it("keeps the API rows to the projection (no raw adapter fields leak)", async () => {
    mockGetCollections.mockResolvedValue([{ _id: "posts", name: "Posts" }]);
    mockFindMany.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "entry-1",
          title: "Entry",
          secretColumn: "should not leak",
          data: JSON.stringify({ title: "Entry" }),
        },
      ],
    });

    const { body } = await getTrash();

    expect(body.data[0]).not.toHaveProperty("secretColumn");
    expect(body.data[0]).not.toHaveProperty("data");
    expect(Object.keys(body.data[0]).sort()).toEqual([
      "_id",
      "collectionId",
      "collectionName",
      "title",
    ]);
  });
});
