/**
 * @file tests/unit/utils/trash-item.test.ts
 * @description Pins the shared trash projection and actor label.
 *
 * `toTrashItem` is used by both `/config/trash` SSR and `GET /api/trash`, so a
 * regression here affects the SSR paint and a client refresh alike.
 *
 * ### Features tested
 * - title fallback chain (localized → name → `data` JSON → first display field)
 * - delete audit fallback (deletedAt/deletedBy → updatedAt/updatedBy)
 * - actor label: real `system` actor vs. missing legacy audit data
 */

import { describe, it, expect } from "vitest";
import { formatTrashActor, toTrashItem } from "@utils/trash-item";

describe("toTrashItem", () => {
  it("prefers a localized title object (en first), then the first translation", () => {
    expect(
      toTrashItem({ _id: "e1", title: { en: "Hello", de: "Hallo" } }, "posts", "Posts").title,
    ).toBe("Hello");
    expect(toTrashItem({ _id: "e1", title: { de: "Hallo" } }, "posts", "Posts").title).toBe(
      "Hallo",
    );
  });

  it("falls back through name, the data blob and the first display string", () => {
    expect(toTrashItem({ _id: "e1", name: "Named entry" }, "posts", "Posts").title).toBe(
      "Named entry",
    );
    expect(
      toTrashItem(
        { _id: "e2", data: JSON.stringify({ title: "From data blob" }) },
        "posts",
        "Posts",
      ).title,
    ).toBe("From data blob");
    expect(
      toTrashItem(
        { _id: "e3", data: JSON.stringify({ subtitle: "Display label", order: 3 }) },
        "posts",
        "Posts",
      ).title,
    ).toBe("Display label");
  });

  it("leaves title undefined when nothing looks like a label", () => {
    const item = toTrashItem(
      { _id: "e1", data: JSON.stringify({ status: "draft", views: 4, isDeleted: true }) },
      "posts",
      "Posts",
    );
    expect(item.title).toBeUndefined();
    expect(item._id).toBe("e1");
  });

  it("prefers the delete audit pair and falls back for legacy rows", () => {
    const stamped = toTrashItem(
      {
        _id: "e1",
        deletedAt: "2026-01-02T03:04:05.000Z",
        deletedBy: "user-42",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "user-99",
      },
      "posts",
      "Posts",
    );
    expect(stamped.deletedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(stamped.deletedBy).toBe("user-42");

    const legacy = toTrashItem(
      {
        _id: "e2",
        updatedAt: "2026-02-03T04:05:06.000Z",
        updatedBy: "user-7",
      },
      "posts",
      "Posts",
    );
    expect(legacy.deletedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(legacy.deletedBy).toBe("user-7");

    const unknown = toTrashItem({ _id: "e3" }, "posts", "Posts");
    expect(unknown.deletedAt).toBeUndefined();
    expect(unknown.deletedBy).toBeUndefined();
  });
});

describe("formatTrashActor", () => {
  it("labels only a real system actor as System", () => {
    expect(formatTrashActor("system")).toBe("System");
    expect(formatTrashActor("SYSTEM")).toBe("System");
  });

  it("renders user ids unchanged", () => {
    expect(formatTrashActor("user-42")).toBe("user-42");
  });

  it("does not attribute a missing legacy audit row to System", () => {
    expect(formatTrashActor(undefined)).toBe("—");
    expect(formatTrashActor(null)).toBe("—");
    expect(formatTrashActor("")).toBe("—");
    expect(formatTrashActor("   ")).toBe("—");
  });
});
