/**
 * @file tests/unit/content/gui-save-file-ownership.test.ts
 * @description Unit tests for C1: the board (gui-save) must not create or rename
 *              collections without a source file. Existence + schema live in the
 *              `.ts` file; only the collection editor writes it.
 */

import { describe, expect, it } from "vitest";
import { syncContentState } from "@src/content/sync-content-state.server";

describe("gui-save file ownership (C1)", () => {
  it("rejects creating a collection without a source file", async () => {
    await expect(
      syncContentState({
        reason: "gui-save",
        tenantId: "global",
        operations: [
          {
            type: "create",
            node: {
              _id: "col-create",
              name: "Posts",
              path: "/collection/posts",
              nodeType: "collection",
            },
          },
        ],
      }),
    ).rejects.toThrow(/must be created or renamed in the collection editor/);
  });

  it("rejects renaming a collection", async () => {
    await expect(
      syncContentState({
        reason: "gui-save",
        tenantId: "global",
        operations: [
          {
            type: "rename",
            node: {
              _id: "col-rename",
              name: "Posts Renamed",
              path: "/collection/posts",
              nodeType: "collection",
            },
          },
        ],
      }),
    ).rejects.toThrow(/must be created or renamed in the collection editor/);
  });
});
