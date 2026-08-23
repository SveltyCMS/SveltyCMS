/**
 * @file tests/unit/databases/mongo-upsert-one-rt.test.ts
 * @description Mongo upsert is one findOneAndUpdate (upsert:true) — not
 *   update-then-create. _id lives on the filter so $setOnInsert stays free of it
 *   (Mongoose 9 rejects `_id` in $setOnInsert).
 */

import { describe, expect, it, vi } from "vitest";
import { MongoCrudMethods } from "@src/databases/mongodb/crud-methods";
import type { DatabaseId } from "@src/content/types";

describe("MongoCrudMethods.upsert", () => {
  it("issues a single findOneAndUpdate with upsert:true and no _id in $setOnInsert", async () => {
    const exec = vi.fn().mockResolvedValue({
      _id: "doc-1",
      title: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const findOneAndUpdate = vi.fn().mockReturnValue({ lean: () => ({ exec }) });
    const create = vi.fn();
    const crud = new MongoCrudMethods(
      {
        findOneAndUpdate,
        create,
        collection: { name: "posts" },
        schema: { strict: false, paths: {} },
      } as never,
      { mapQuery: (q: unknown) => q },
    );

    const res = await crud.upsert({ _id: "doc-1" } as never, { title: "Hello" } as never, {
      tenantId: "tenant-1" as DatabaseId,
      bypassSafeQuery: true,
      bypassTenantCheck: true,
    });

    expect(res.success).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter._id).toBe("doc-1");
    expect(options.upsert).toBe(true);
    expect(update.$setOnInsert._id).toBeUndefined();
    expect(update.$setOnInsert.createdAt).toEqual(expect.any(String));
    expect(update.$set.title).toBe("Hello");
  });
});
