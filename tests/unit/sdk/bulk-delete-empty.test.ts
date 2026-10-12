/**
 * @file tests/unit/sdk/bulk-delete-empty.test.ts
 * @description collections.bulkDelete refuses an empty id list before deleteMany.
 *
 * Features:
 * - empty and missing id lists return 400
 * - deleteMany is not called
 */

import { describe, expect, it, vi } from "vitest";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { AppError } from "@utils/error-handling";

describe("SDK bulkDelete empty ids", () => {
  it("refuses an empty id list before deleteMany", async () => {
    const deleteMany = vi.fn();
    const ns = new CollectionsNamespace({ crud: { deleteMany }, collection: {} } as never);

    await expect(ns.bulkDelete("posts", [], { user: { _id: "u1" } })).rejects.toMatchObject({
      status: 400,
      message: "entryIds[] is required for bulk delete",
    });
    await expect(ns.bulkDelete("posts", [], {})).rejects.toBeInstanceOf(AppError);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
