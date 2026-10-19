/**
 * @file tests/unit/media/folder-tree-cycle.test.ts
 * @description Unit tests for virtual-folder move cycle guards.
 */

import { describe, it, expect } from "vitest";
import { buildFolderParentMap, folderMoveCreatesCycle } from "../../../src/utils/media/folder-tree";

describe("folder-tree - move cycle guard", () => {
  const folders = [
    { _id: "root", parentId: null },
    { _id: "a", parentId: "root" },
    { _id: "b", parentId: "a" },
    { _id: "c", parentId: "b" },
    { _id: "sibling", parentId: "root" },
  ];
  const parentById = buildFolderParentMap(folders);

  it("builds a normalized id to parent map", () => {
    expect(parentById.get("root")).toBeNull();
    expect(parentById.get("b")).toBe("a");
  });

  it("rejects moving a folder into itself", () => {
    expect(folderMoveCreatesCycle(parentById, "a", "a")).toBe(true);
  });

  it("rejects moving a folder under one of its descendants", () => {
    expect(folderMoveCreatesCycle(parentById, "a", "c")).toBe(true);
    expect(folderMoveCreatesCycle(parentById, "b", "c")).toBe(true);
  });

  it("allows moving under a sibling or to the root", () => {
    expect(folderMoveCreatesCycle(parentById, "a", "sibling")).toBe(false);
    expect(folderMoveCreatesCycle(parentById, "c", "root")).toBe(false);
    expect(folderMoveCreatesCycle(parentById, "a", null)).toBe(false);
  });

  it("terminates on a pre-existing corrupt cycle", () => {
    const corrupt = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(folderMoveCreatesCycle(corrupt, "other", "a")).toBe(false);
  });
});
