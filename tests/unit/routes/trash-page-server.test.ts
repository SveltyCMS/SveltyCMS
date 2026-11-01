/**
 * @file tests/unit/routes/trash-page-server.test.ts
 * @description Pins the trash row coercion (`_toTrashItem`) for the global trash bin.
 *
 * Regression (N3): SQL soft deletes only stamped `isDeleted`/`updatedAt`, and the
 * trash page rendered "Deleted by: System" whenever `deletedBy` was absent. The
 * fallback chain must find a label (localized title → name → `data` blob → first
 * display field) and the delete audit pair (deletedAt/deletedBy → updatedAt/updatedBy).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@src/content/index.server", () => ({
  contentSystem: { getCollections: vi.fn(async () => []) },
}));
vi.mock("@src/databases/db", () => ({ dbAdapter: { crud: { findMany: vi.fn() } } }));
vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(() => ({ _id: "user-1" })),
}));

import { _toTrashItem } from "../../../src/routes/(app)/config/trash/+page.server";

describe("trash _toTrashItem — title fallback", () => {
  it("prefers a localized title object (en first)", () => {
    const item = _toTrashItem({ _id: "e1", title: { en: "Hello", de: "Hallo" } }, "posts", "Posts");
    expect(item.title).toBe("Hello");
  });

  it("falls back to the first available translation", () => {
    const item = _toTrashItem({ _id: "e1", title: { de: "Hallo" } }, "posts", "Posts");
    expect(item.title).toBe("Hallo");
  });

  it("reads a title out of the JSON `data` column", () => {
    const item = _toTrashItem(
      { _id: "e1", data: JSON.stringify({ title: "From data blob" }) },
      "posts",
      "Posts",
    );
    expect(item.title).toBe("From data blob");
  });

  it("falls back to `name`, then `data.name`, when title is missing", () => {
    const byName = _toTrashItem({ _id: "e1", name: "Named entry" }, "posts", "Posts");
    expect(byName.title).toBe("Named entry");

    const byDataName = _toTrashItem(
      { _id: "e2", data: JSON.stringify({ name: "Named in data" }) },
      "posts",
      "Posts",
    );
    expect(byDataName.title).toBe("Named in data");
  });

  it("uses the first string display field as a last resort", () => {
    const item = _toTrashItem(
      { _id: "e1", data: JSON.stringify({ subtitle: "Display label", order: 3 }) },
      "posts",
      "Posts",
    );
    expect(item.title).toBe("Display label");
  });

  it("leaves title undefined when nothing looks like a label (page shows _id)", () => {
    const item = _toTrashItem(
      { _id: "e1", data: JSON.stringify({ status: "draft", views: 4, isDeleted: true }) },
      "posts",
      "Posts",
    );
    expect(item.title).toBeUndefined();
    expect(item._id).toBe("e1");
  });
});

describe("trash _toTrashItem — delete audit fallbacks", () => {
  it("prefers deletedAt/deletedBy when the adapter wrote them", () => {
    const item = _toTrashItem(
      {
        _id: "e1",
        title: "Entry",
        deletedAt: "2026-01-02T03:04:05.000Z",
        deletedBy: "user-42",
        updatedAt: "2026-01-02T03:04:05.000Z",
        updatedBy: "user-99",
      },
      "posts",
      "Posts",
    );
    expect(item.deletedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(item.deletedBy).toBe("user-42");
  });

  it("falls back to updatedAt/updatedBy for legacy soft-deleted rows", () => {
    const item = _toTrashItem(
      {
        _id: "e1",
        title: "Entry",
        updatedAt: "2026-02-03T04:05:06.000Z",
        updatedBy: "user-7",
      },
      "posts",
      "Posts",
    );
    expect(item.deletedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(item.deletedBy).toBe("user-7");
  });

  it("leaves both fields undefined when the row carries no audit data", () => {
    const item = _toTrashItem({ _id: "e1", title: "Entry" }, "posts", "Posts");
    expect(item.deletedAt).toBeUndefined();
    expect(item.deletedBy).toBeUndefined();
  });
});
