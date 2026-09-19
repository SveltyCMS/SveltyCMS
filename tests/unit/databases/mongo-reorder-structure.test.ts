/**
 * @file tests/unit/databases/mongo-reorder-structure.test.ts
 * @description Mongo `reorderStructure` must persist with ONE non-transactional
 *   `bulkWrite`. The adapter owns its connection via `mongoose.createConnection`,
 *   so the default `mongoose.connection` has no client and `mongoose.startSession()`
 *   throws before any write — only the model's own `bulkWrite` can succeed.
 *
 * ### Features:
 * - Asserts a single bulkWrite with one updateOne per item and no session option
 * - Asserts the global mongoose session API is never touched
 */

import { describe, expect, it, vi } from "vitest";

// Mongoose is stubbed at the module boundary (real mongoose + bson is not
// unit-safe here); the schema object only needs `statics` and `index` to load.
vi.mock("mongoose", () => {
  class Schema {
    static Types = { Mixed: {} };
    statics: Record<string, unknown> = {};
    index = vi.fn();
  }
  const mongooseStub = {
    Schema,
    Types: { ObjectId: class ObjectId {} },
    model: vi.fn(),
    models: {},
    connection: { models: {} },
    createConnection: vi.fn(),
    startSession: vi.fn(),
  };
  return { default: mongooseStub, ...mongooseStub, Model: class Model {} };
});

import { contentStructureSchema } from "@src/databases/mongodb/content-structure";

type ReorderItem = { id: string; order: number; parentId: string | null; path: string };

describe("Mongo content-structure reorderStructure", () => {
  it("persists every item with one non-transactional bulkWrite", async () => {
    const bulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    const statics = contentStructureSchema.statics as unknown as {
      reorderStructure(
        items: ReorderItem[],
        tenantId?: string | null,
      ): Promise<{ success: boolean }>;
    };

    const result = await statics.reorderStructure.call({ bulkWrite }, [
      { id: "node-a", parentId: "parent-1", order: 7, path: "/node-a" },
      { id: "node-b", parentId: "parent-1", order: 3, path: "/node-b" },
    ]);

    expect(result.success).toBe(true);
    expect(bulkWrite).toHaveBeenCalledTimes(1);

    const [ops, options] = bulkWrite.mock.calls[0] as [
      Array<{ updateOne: { filter: { _id: string }; update: { $set: unknown } } }>,
      unknown,
    ];
    expect(ops).toHaveLength(2);
    expect(ops[0]?.updateOne.filter._id).toBe("node-a");
    expect(ops[0]?.updateOne.update.$set).toEqual({ parentId: "parent-1", order: 7 });
    expect(options).toBeUndefined();

    const mongoose = await import("mongoose");
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it("skips the write for an empty reorder", async () => {
    const bulkWrite = vi.fn();
    const statics = contentStructureSchema.statics as unknown as {
      reorderStructure(items: ReorderItem[]): Promise<{ success: boolean }>;
    };

    const result = await statics.reorderStructure.call({ bulkWrite }, []);

    expect(result.success).toBe(true);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
