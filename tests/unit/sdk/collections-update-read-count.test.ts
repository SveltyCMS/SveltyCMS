/**
 * @file tests/unit/sdk/collections-update-read-count.test.ts
 * @description Spy-based contract for the row reads a single CollectionsNamespace
 * `update()` issues. A full pipeline (ownership + optimistic-lock check +
 * required-field validation + revision snapshot) must read the target row once
 * before the write; the post-write read-back for the response stays separate.
 *
 * Features tested:
 * - one pre-write `crud.findOne` serves ownership, expectedVersion, required
 *   fields and the revision snapshot (the snapshot keeps the previous row).
 *   Measured before the refactor: 3 pre-write reads for this pipeline
 *   (ownership, version, required fields) plus 1 post-write response read = 4;
 *   after: 1 pre-write read plus the response read = 2.
 * - ownership 404 for a foreign row and version-conflict 409 keep their codes
 *   and fail before any write
 */

import { describe, expect, it, vi } from "vitest";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type {
  DatabaseId,
  IBatchAdapter,
  ICrudAdapter,
  IDBAdapter,
} from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";

interface RevisionSpies {
  getHistory: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
}

const makeRevisionSpies = (): RevisionSpies => ({
  getHistory: vi.fn(async () => ({ success: true, data: { items: [], total: 0 } })),
  create: vi.fn(async () => ({ success: true, data: { _id: "rev-1" } })),
  cleanup: vi.fn(async () => ({ success: true, data: { deletedCount: 0 } })),
});

class ReadCountingAdapter extends BaseAdapter {
  public content: { revisions: RevisionSpies };

  constructor(
    public crud: ICrudAdapter,
    revisions: RevisionSpies = makeRevisionSpies(),
  ) {
    super();
    this.connected = true;
    this.content = { revisions };
  }

  async connect(): Promise<{ success: boolean; data: undefined }> {
    return { success: true, data: undefined };
  }

  async disconnect(): Promise<{ success: boolean; data: undefined }> {
    return { success: true, data: undefined };
  }

  get batch(): IBatchAdapter {
    return {} as IBatchAdapter;
  }
}

const schema = {
  _id: "update_reads",
  name: "update_reads",
  slug: "update-reads",
  ownership: { field: "ownerId" },
  revision: true,
  revisionLimit: 5,
  fields: [{ db_fieldName: "title", name: "Title", widget: { Name: "Input" }, required: true }],
} as unknown as Schema;

const targetRow = {
  _id: "e1",
  ownerId: "u1",
  title: "Before",
  status: "publish",
  updatedAt: UPDATED_AT,
};

const editor = { _id: "u1", role: "editor" };
const tenantId = "tenant-a" as DatabaseId;

function crudWith(overrides: Record<string, unknown>): ICrudAdapter {
  return {
    findOne: vi.fn(async () => ({ success: true, data: { ...targetRow } })),
    findMany: vi.fn(async () => ({ success: true, data: [], total: 0 })),
    insert: vi.fn(async () => ({ success: true, data: {} })),
    update: vi.fn(async () => ({ success: true, data: { ...targetRow } })),
    updateMany: vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } })),
    delete: vi.fn(async () => ({ success: true, data: undefined })),
    count: vi.fn(async () => ({ success: true, data: 0 })),
    ...overrides,
  } as unknown as ICrudAdapter;
}

function namespaceWith(crud: ICrudAdapter, revisions?: RevisionSpies) {
  const adapter = new ReadCountingAdapter(crud, revisions);
  return { adapter, ns: new CollectionsNamespace(adapter as unknown as IDBAdapter) };
}

describe("CollectionsNamespace.update row reads", () => {
  it("reads the target row once before a full ownership + version + required + revision update", async () => {
    let writeStarted = false;
    const reads: Array<{ phase: "pre" | "post"; options?: Record<string, unknown> }> = [];
    const findOne = vi.fn(
      async (
        _collection: string,
        _query: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        reads.push({ phase: writeStarted ? "post" : "pre", options });
        return { success: true, data: { ...targetRow } };
      },
    );
    const updateMany = vi.fn(async () => {
      writeStarted = true;
      return { success: true, data: { modifiedCount: 1 } };
    });
    const revisions = makeRevisionSpies();
    const crud = crudWith({ findOne, updateMany });
    const { ns } = namespaceWith(crud, revisions);
    await ns.registerSchema("update_reads", schema, tenantId);

    const result = await ns.update("update_reads", "e1", { title: "After" }, {
      user: editor,
      tenantId,
      expectedVersion: UPDATED_AT,
    } as never);

    expect(result.success).toBe(true);
    const pre = reads.filter((read) => read.phase === "pre");
    const post = reads.filter((read) => read.phase === "post");

    // One pre-write read: ownership/access, expectedVersion, required fields and
    // the revision snapshot all reuse it.
    expect(pre).toHaveLength(1);
    // It must be the fresh read the optimistic-lock comparison requires.
    expect(pre[0]?.options?.bypassCache).toBe(true);
    // The post-write read-back for the response is a genuinely different read.
    expect(post).toHaveLength(1);
    expect(findOne).toHaveBeenCalledTimes(2);

    // The revision snapshot still carries the pre-write row content.
    expect(revisions.create).toHaveBeenCalledTimes(1);
    expect(revisions.create.mock.calls[0]?.[0]).toMatchObject({
      contentId: "e1",
      version: 1,
      data: { _id: "e1", ownerId: "u1", title: "Before", status: "publish" },
    });
  });

  it("does not read the target row when no pipeline stage needs it", async () => {
    const plainSchema = {
      _id: "plain_updates",
      name: "plain_updates",
      slug: "plain-updates",
      fields: [{ db_fieldName: "title", name: "Title", widget: { Name: "Input" } }],
    } as unknown as Schema;
    const findOne = vi.fn(async () => ({ success: true, data: { ...targetRow } }));
    const update = vi.fn(async () => ({ success: true, data: { _id: "e1", title: "After" } }));
    const crud = crudWith({ findOne, update });
    const { ns } = namespaceWith(crud);
    await ns.registerSchema("plain_updates", plainSchema, tenantId);

    const result = await ns.update("plain_updates", "e1", { title: "After" }, {
      user: editor,
      tenantId,
    } as never);

    expect(result.success).toBe(true);
    // No ownership, no expectedVersion, no required field, no revision: the
    // loader stays lazy and the write returns the adapter's own row.
    expect(findOne).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps the ownership 404 and issues no write for a foreign row", async () => {
    const findOne = vi.fn(async () => ({
      success: true,
      data: { ...targetRow, ownerId: "someone-else" },
    }));
    const update = vi.fn(async () => ({ success: true, data: { ...targetRow } }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } }));
    const crud = crudWith({ findOne, update, updateMany });
    const { ns } = namespaceWith(crud);
    await ns.registerSchema("update_reads", schema, tenantId);

    await expect(
      ns.update("update_reads", "e1", { title: "After" }, {
        user: editor,
        tenantId,
      } as never),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("keeps the version-conflict 409 and issues no write for a stale token", async () => {
    const findOne = vi.fn(async () => ({
      success: true,
      data: { ...targetRow, updatedAt: "2026-02-02T00:00:00.000Z" },
    }));
    const update = vi.fn(async () => ({ success: true, data: { ...targetRow } }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } }));
    const crud = crudWith({ findOne, update, updateMany });
    const { ns } = namespaceWith(crud);
    await ns.registerSchema("update_reads", schema, tenantId);

    await expect(
      ns.update("update_reads", "e1", { title: "After" }, {
        user: editor,
        tenantId,
        expectedVersion: UPDATED_AT,
      } as never),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
