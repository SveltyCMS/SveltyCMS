/**
 * @file tests/unit/databases/mongo-drafts-parity.test.ts
 * @description MongoDB parity for the two `content_drafts` bugs found while
 * wiring draft/live separation:
 *
 * 1. `drafts.update(id, patch)` wrapped the whole patch into `{ data }`, so a
 *    `{ version: 2 }` bump rewrote the snapshot instead of the version column.
 * 2. `drafts.publishMany` wrote `status: "publish"`, which is not a member of the
 *    draft status enum (`draft | review | archived`) — publishing never persisted.
 *
 * The real `MongoContentModule` + `MongoCrudMethods` are used; only the Mongoose
 * model boundary is a stub.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/databases/db-interface";

vi.mock("mongoose", () => ({
  default: { mongo: {} },
  Schema: class {},
  model: vi.fn(),
  models: {},
  connection: {},
  Types: { ObjectId: class {} },
}));

vi.mock("@src/databases/mongodb/schema", () => ({
  contentStructureSchema: {},
  draftSchema: {},
  revisionSchema: {},
}));

import { MongoContentModule } from "@src/databases/mongodb/content-module";

interface DraftModelStub {
  modelName: string;
  collection: { findOneAndUpdate: ReturnType<typeof vi.fn> };
  updateMany: ReturnType<typeof vi.fn>;
}

function makeModule() {
  const findOneAndUpdate = vi.fn();
  const updateMany = vi.fn();
  const model: DraftModelStub = {
    modelName: "content_drafts",
    collection: { findOneAndUpdate },
    updateMany,
  };
  const adapter = {
    _getOrCreateModel: vi.fn().mockReturnValue(model),
    mapQuery: vi.fn((query: unknown) => query),
  };
  const module = new MongoContentModule(adapter as never);
  return { module, model, findOneAndUpdate, updateMany };
}

describe("MongoDB content_drafts parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies `update` as a field patch, not a `{ data }` wrapper", async () => {
    const { module, findOneAndUpdate } = makeModule();
    findOneAndUpdate.mockResolvedValue({
      _id: "draft-1",
      contentId: "entry-1",
      data: { title: "patched" },
      version: 3,
      status: "draft",
    });

    const result = await module.drafts.update("draft-1" as DatabaseId, {
      data: { title: "patched" },
      version: 3,
    });

    expect(result.success).toBe(true);
    const [, update] = findOneAndUpdate.mock.calls[0];
    expect(update.$set.data).toEqual({ title: "patched" });
    expect(update.$set.version).toBe(3);
    // The old wrapper turned this into `data: { data: …, version: … }`.
    expect(update.$set.data).not.toHaveProperty("version");
  });

  it("publishes drafts into the archived status (a valid enum member)", async () => {
    const { module, updateMany } = makeModule();
    updateMany.mockResolvedValue({ modifiedCount: 2 });

    const result = await module.drafts.publishMany(["draft-1", "draft-2"] as DatabaseId[]);

    expect(result.success).toBe(true);
    expect(result.success && result.data.publishedCount).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["draft-1", "draft-2"] } },
      { $set: { status: "archived" } },
    );
    const update = updateMany.mock.calls[0][1];
    expect(update.$set.status).not.toBe("publish");
    expect(update.$set).not.toHaveProperty("publishedAt");
  });
});
