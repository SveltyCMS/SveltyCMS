/**
 * @file tests/unit/services/junction-fields.test.ts
 * @description Planning helpers that connect a `ManyToMany` field to the
 * junction store: extraction/stripping on write, hydration on read, cascade.
 */
import { describe, expect, it, vi } from "vitest";
import type { Schema } from "@src/content/types";
import type { IDBAdapter } from "@src/databases/db-interface";
import {
  collectJunctionPayload,
  deleteJunctionLinksForEntry,
  hydrateJunctionFields,
  assertBulkSupportsJunctionFields,
  junctionFieldsOf,
} from "@src/services/sdk/namespaces/collections/junction-fields";
import { relationLinkId } from "@src/services/core/relation-link-service";

const TENANT = "tenant-1";
const COLLECTION = "posts";

const schema = {
  _id: COLLECTION,
  name: "Posts",
  fields: [
    { db_fieldName: "title", widget: { Name: "Input" } },
    { db_fieldName: "tags", widget: { Name: "ManyToMany" }, collection: "tags" },
  ],
} as unknown as Schema;

function linkRow(sourceId: string, targetId: string, sort = 0, metadata: unknown = null) {
  return {
    _id: relationLinkId(TENANT, COLLECTION, "tags", sourceId, targetId),
    tenantId: TENANT,
    sourceCollection: COLLECTION,
    sourceId,
    fieldName: "tags",
    targetCollection: "tags",
    targetId,
    sortOrder: sort,
    metadata,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("junctionFieldsOf", () => {
  it("finds ManyToMany fields and ignores the rest", () => {
    expect(junctionFieldsOf(schema)).toEqual([
      { fieldName: "tags", targetCollection: "tags", through: "contentRelations" },
    ]);
  });

  it("returns an empty plan for a schema without junction fields", () => {
    const plain = { _id: "x", fields: [{ db_fieldName: "title" }] } as unknown as Schema;
    expect(junctionFieldsOf(plain)).toEqual([]);
  });
});

describe("collectJunctionPayload", () => {
  it("extracts and strips a supplied junction field", () => {
    const result = collectJunctionPayload(schema, {
      title: "Hello",
      tags: ["tag-1", { id: "tag-2", sort: 4 }],
    });
    expect(result.stripped).toEqual({ title: "Hello" });
    expect(result.present).toHaveLength(1);
    expect(result.present[0]).toMatchObject({ fieldName: "tags", targetCollection: "tags" });
    expect(result.present[0].desired).toEqual([
      { id: "tag-1", sort: 0, metadata: null },
      { id: "tag-2", sort: 4, metadata: null },
    ]);
  });

  it("leaves an omitted junction field absent (partial update)", () => {
    const payload = { title: "Renamed" };
    const result = collectJunctionPayload(schema, payload);
    expect(result.present).toEqual([]);
    expect(result.stripped).toBe(payload);
  });

  it("returns the original object when the schema has no junction fields", () => {
    const plain = { _id: "x", fields: [] } as unknown as Schema;
    const payload = { title: "Hello" };
    expect(collectJunctionPayload(plain, payload).stripped).toBe(payload);
  });
});

describe("hydrateJunctionFields", () => {
  it("attaches ordered ids to each row in one query", async () => {
    const rows = [linkRow("post-1", "tag-b", 1), linkRow("post-1", "tag-a", 0)];
    const findMany = vi.fn(async () => ({ success: true, data: rows }));
    const adapter = { crud: { findMany } } as unknown as IDBAdapter;

    const items = [{ _id: "post-1" }, { _id: "post-2" }];
    await hydrateJunctionFields(adapter, schema, items, TENANT as never);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(items[0]).toMatchObject({ tags: ["tag-a", "tag-b"] });
    expect(items[1]).toMatchObject({ tags: [] });
  });

  it("adds the per-link array only when metadata exists", async () => {
    const findMany = vi.fn(async () => ({
      success: true,
      data: [linkRow("post-1", "tag-a", 2, { label: "Pinned" })],
    }));
    const adapter = { crud: { findMany } } as unknown as IDBAdapter;

    const items = [{ _id: "post-1" }];
    await hydrateJunctionFields(adapter, schema, items, TENANT as never);

    expect(items[0]).toMatchObject({
      tags: ["tag-a"],
      _relation_tags: [{ id: "tag-a", sort: 2, metadata: { label: "Pinned" } }],
    });
  });

  it("does nothing when the schema has no junction fields", async () => {
    const findMany = vi.fn();
    const adapter = { crud: { findMany } } as unknown as IDBAdapter;
    const plain = { _id: "x", fields: [] } as unknown as Schema;
    const items = [{ _id: "a" }];
    await hydrateJunctionFields(adapter, plain, items, TENANT as never);
    expect(findMany).not.toHaveBeenCalled();
    expect(items[0]).toEqual({ _id: "a" });
  });
});

describe("assertBulkSupportsJunctionFields", () => {
  it("rejects a junction field on bulk create and bulk update", () => {
    expect(() =>
      assertBulkSupportsJunctionFields(schema, [{ title: "x", tags: ["tag-1"] }], "create"),
    ).toThrow(/does not support the many-to-many field "tags"/);

    expect(() =>
      assertBulkSupportsJunctionFields(
        schema,
        [{ id: "post-1", data: { tags: ["tag-1"] } }],
        "update",
      ),
    ).toThrow(/does not support the many-to-many field "tags"/);
  });

  it("allows bulk payloads that do not touch the junction field", () => {
    expect(() =>
      assertBulkSupportsJunctionFields(schema, [{ title: "x" }], "create"),
    ).not.toThrow();
  });

  it("is a no-op for schemas without junction fields", () => {
    const plain = { _id: "x", fields: [{ db_fieldName: "title" }] } as unknown as Schema;
    expect(() =>
      assertBulkSupportsJunctionFields(plain, [{ tags: ["tag-1"] }], "create"),
    ).not.toThrow();
  });
});

describe("deleteJunctionLinksForEntry", () => {
  it("cascades the source side for a collection that declares a junction field", async () => {
    const deleteMany = vi.fn(async (_collection: string, _filter: Record<string, unknown>) => ({
      success: true,
      data: { deletedCount: 1 },
    }));
    const adapter = { crud: { deleteMany } } as unknown as IDBAdapter;

    await deleteJunctionLinksForEntry(adapter, schema, "post-1", TENANT as never);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][1]).toMatchObject({
      sourceCollection: COLLECTION,
      sourceId: "post-1",
    });
  });

  it("cascades the target side for a registered target collection", async () => {
    // Planning the posts schema registers `tags` as a junction target.
    junctionFieldsOf(schema);
    const deleteMany = vi.fn(async (_collection: string, _filter: Record<string, unknown>) => ({
      success: true,
      data: { deletedCount: 1 },
    }));
    const adapter = { crud: { deleteMany } } as unknown as IDBAdapter;
    const tagsSchema = { _id: "tags", fields: [] } as unknown as Schema;

    await deleteJunctionLinksForEntry(adapter, tagsSchema, "tag-1", TENANT as never);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][1]).toMatchObject({
      targetCollection: "tags",
      targetId: "tag-1",
    });
  });

  it("does nothing for a collection that participates in no junction", async () => {
    const deleteMany = vi.fn(async (_collection: string, _filter: Record<string, unknown>) => ({
      success: true,
      data: { deletedCount: 0 },
    }));
    const adapter = { crud: { deleteMany } } as unknown as IDBAdapter;
    const plain = { _id: "pages", fields: [] } as unknown as Schema;

    await deleteJunctionLinksForEntry(adapter, plain, "page-1", TENANT as never);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("never throws when the cascade fails", async () => {
    const deleteMany = vi.fn(async () => {
      throw new Error("db down");
    });
    const adapter = { crud: { deleteMany } } as unknown as IDBAdapter;
    await expect(
      deleteJunctionLinksForEntry(adapter, schema, "post-1", TENANT as never),
    ).resolves.toBeUndefined();
  });
});
