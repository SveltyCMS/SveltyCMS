/**
 * @file tests/unit/sdk/relation-filter.test.ts
 * @description Unit tests for relation-filter compilation ($some / $none / $every).
 *
 * Features:
 * - `$some` → `$in` of the target ids
 * - `$none` → `$nin` plus a null clause (a missing relation passes)
 * - `$every` → `$nin` of the non-matching target ids, empty relation passes
 * - cap exceeded → RELATION_FANOUT_EXCEEDED with no query beyond cap + 1
 * - tenant scoping on the target lookup
 * - non-relation / unknown fields → RELATION_FIELD_UNKNOWN (fail closed)
 * - `$and` / `$or` nesting preserved
 * - wiring: `find` / `count` compile before the parent query reaches the adapter
 */
import { describe, expect, it, vi } from "vitest";
import {
  compileRelationFilters,
  RELATION_FANOUT,
  RelationFilterError,
  type CompileRelationFiltersOptions,
} from "@src/services/sdk/namespaces/collections/relation-filter";
import { normalizeRelationshipFilter } from "@src/services/sdk/namespaces/collections/read-pipeline";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";
import type { DatabaseId, Schema } from "@src/content/types";

const schema = {
  _id: "posts",
  fields: [
    {
      db_fieldName: "author",
      label: "Author",
      type: "string",
      widget: { Name: "Relation" },
      collection: "authors",
    },
    {
      db_fieldName: "editor",
      label: "Editor",
      type: "string",
      widget: { Name: "Relation" },
      collection: "authors",
    },
    { db_fieldName: "status", label: "Status", type: "string", widget: { Name: "Input" } },
    { db_fieldName: "ghost", label: "Ghost", widget: { Name: "Relation" } },
  ],
} as unknown as Schema;

const user = { _id: "u1", role: "editor" };

function optionsWith(
  findMany: ReturnType<typeof vi.fn>,
  overrides: Partial<CompileRelationFiltersOptions> = {},
): CompileRelationFiltersOptions {
  return {
    dbAdapter: { findMany } as unknown as Pick<ICrudAdapter, "findMany">,
    getCollectionName: (id: string) => `collection_${id}`,
    tenantId: "tenant-1" as DatabaseId,
    user,
    ...overrides,
  };
}

function ok(data: unknown[]) {
  return { success: true, data };
}

describe("compileRelationFilters", () => {
  it("compiles $some to an $in of the resolved target ids", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a1" }, { _id: "a2" }]));

    const result = await compileRelationFilters(
      { author: { $some: { featured: true } } } as never,
      schema,
      optionsWith(findMany),
    );

    expect(result).toEqual({ author: { $in: ["a1", "a2"] } });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      "collection_authors",
      { featured: true },
      expect.objectContaining({
        tenantId: "tenant-1",
        limit: RELATION_FANOUT + 1,
        fields: ["_id"],
      }),
    );
  });

  it("accepts the unprefixed `some` spelling and a scalar id condition", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a1" }]));

    const result = await compileRelationFilters(
      { author: { some: "a1" } } as never,
      schema,
      optionsWith(findMany),
    );

    expect(result).toEqual({ author: { $in: ["a1"] } });
    expect(findMany.mock.calls[0][1]).toEqual({ _id: "a1" });
  });

  it("normalizes arrays inside the target condition", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a1" }]));

    await compileRelationFilters(
      { author: { $some: { slug: ["one", "two"] } } } as never,
      schema,
      optionsWith(findMany),
    );

    expect(findMany.mock.calls[0][1]).toEqual({ slug: { $in: ["one", "two"] } });
  });

  it("compiles $none to $nin with a null clause so a missing relation passes", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a1" }]));

    const result = await compileRelationFilters(
      { author: { $none: { featured: true } } } as never,
      schema,
      optionsWith(findMany),
    );

    expect(result).toEqual({
      $or: [{ author: { $nin: ["a1"] } }, { author: null }],
    });
  });

  it("compiles $every to $nin of the rows that do not satisfy the condition", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a3" }]));

    const result = await compileRelationFilters(
      { author: { $every: { status: "published" } } } as never,
      schema,
      optionsWith(findMany),
    );

    // The target lookup is the complement of the operator's condition.
    expect(findMany.mock.calls[0][1]).toEqual({
      $or: [{ status: { $ne: "published" } }, { status: null }],
    });
    expect(result).toEqual({
      $or: [{ author: { $nin: ["a3"] } }, { author: null }],
    });
  });

  it("passes $every vacuously when no target row fails the condition", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([]));

    const result = await compileRelationFilters(
      { author: { $every: { status: "published" } } } as never,
      schema,
      optionsWith(findMany),
    );

    expect(result).toEqual({});
  });

  it("throws RELATION_FANOUT_EXCEEDED at cap + 1 without truncating", async () => {
    const rows = Array.from({ length: RELATION_FANOUT + 1 }, (_, index) => ({
      _id: `id-${index}`,
    }));
    const findMany = vi.fn().mockResolvedValueOnce(ok(rows));

    await expect(
      compileRelationFilters({ author: { $some: {} } } as never, schema, optionsWith(findMany)),
    ).rejects.toMatchObject({
      code: "RELATION_FANOUT_EXCEEDED",
    });
    // Exactly one lookup, already bounded by the hard cap.
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][2]).toMatchObject({ limit: RELATION_FANOUT + 1 });
  });

  it("scopes the target lookup to the caller's tenant", async () => {
    const findMany = vi.fn().mockResolvedValueOnce(ok([{ _id: "a1" }]));

    await compileRelationFilters(
      { author: { $some: "a1" } } as never,
      schema,
      optionsWith(findMany, { tenantId: "tenant-42" as never }),
    );

    expect(findMany.mock.calls[0][2]).toMatchObject({ tenantId: "tenant-42" });
  });

  it("fails closed for a non-relation field", async () => {
    const findMany = vi.fn();

    await expect(
      compileRelationFilters(
        { status: { $some: { title: "x" } } } as never,
        schema,
        optionsWith(findMany),
      ),
    ).rejects.toBeInstanceOf(RelationFilterError);

    expect(findMany).not.toHaveBeenCalled();
  });

  it("fails closed for a relation field without a target collection", async () => {
    const findMany = vi.fn();

    await expect(
      compileRelationFilters({ ghost: { $some: "a1" } } as never, schema, optionsWith(findMany)),
    ).rejects.toMatchObject({ code: "RELATION_FIELD_UNKNOWN" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown field", async () => {
    const findMany = vi.fn();

    await expect(
      compileRelationFilters({ missing: { $none: "a1" } } as never, schema, optionsWith(findMany)),
    ).rejects.toMatchObject({ code: "RELATION_FIELD_UNKNOWN" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("preserves $and / $or nesting without flattening", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(ok([{ _id: "a1" }]))
      .mockResolvedValueOnce(ok([{ _id: "u1" }]));

    const result = await compileRelationFilters(
      {
        $or: [
          { author: { $some: "a1" } },
          { $and: [{ status: "draft" }, { editor: { $none: "u1" } }] },
        ],
      } as never,
      schema,
      optionsWith(findMany),
    );

    expect(result).toEqual({
      $or: [
        { author: { $in: ["a1"] } },
        {
          $and: [{ status: "draft" }, { $or: [{ editor: { $nin: ["u1"] } }, { editor: null }] }],
        },
      ],
    });
  });

  it("returns the same filter reference when no relation operator is present", async () => {
    const findMany = vi.fn();
    const filter = { status: "published", tags: ["a", "b"] };

    const result = await compileRelationFilters(filter, schema, optionsWith(findMany));

    expect(result).toBe(filter);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("fails closed when the target condition uses a guarded field", async () => {
    const findMany = vi.fn();
    const guardedTarget = {
      _id: "authors",
      _hasActiveWidgets: false,
      _hasGuardedFields: true,
      _guardedFieldNames: ["secret"],
      fields: [
        {
          db_fieldName: "secret",
          label: "Secret",
          visibility: "hidden",
          widget: { Name: "Input" },
        },
      ],
    } as unknown as Schema;

    await expect(
      compileRelationFilters(
        { author: { $some: { secret: "x" } } } as never,
        schema,
        optionsWith(findMany, { resolveTargetSchema: async () => guardedTarget }),
      ),
    ).rejects.toMatchObject({ code: "RELATION_FIELD_UNKNOWN" });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("normalizeRelationshipFilter logical preservation", () => {
  it("keeps a $or branch list intact", () => {
    const filter = { $or: [{ rel: ["a"] }, { status: "draft" }] };

    expect(normalizeRelationshipFilter(filter)).toEqual({
      $or: [{ rel: { $in: ["a"] } }, { status: "draft" }],
    });
  });

  it("keeps $and branches and rewrites only their relation arrays", () => {
    const filter = { $and: [{ author: { $eq: ["a", "b"] } }, { status: "draft" }] };

    expect(normalizeRelationshipFilter(filter)).toEqual({
      $and: [{ author: { $in: ["a", "b"] } }, { status: "draft" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Wiring: the namespace must compile before the parent query reaches the adapter
// ---------------------------------------------------------------------------

class TestAdapter extends BaseAdapter {
  type = "sqlite" as never;
  constructor(public crud: ICrudAdapter) {
    super();
    this.connected = true;
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

function crudWith(overrides: Record<string, unknown>): ICrudAdapter {
  return {
    findMany: vi.fn(async () => ({ success: true, data: [] })),
    findOne: vi.fn(async () => ({ success: true, data: null })),
    insert: vi.fn(async () => ({ success: true, data: {} })),
    update: vi.fn(async () => ({ success: true, data: {} })),
    delete: vi.fn(async () => ({ success: true, data: undefined })),
    count: vi.fn(async () => ({ success: true, data: 0 })),
    ...overrides,
  } as unknown as ICrudAdapter;
}

// `_hasActiveWidgets` short-circuits the schema-store widget warm-up in tests.
const postsSchema = {
  _id: "Posts",
  name: "Posts",
  fields: [
    {
      db_fieldName: "author",
      label: "Author",
      type: "string",
      widget: { Name: "Relation" },
      collection: "authors",
    },
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" } },
  ],
  _hasActiveWidgets: false,
} as unknown as Schema;

const authorsSchema = {
  _id: "authors",
  name: "authors",
  fields: [{ db_fieldName: "name", label: "Name", widget: { Name: "Input" } }],
  _hasActiveWidgets: false,
} as unknown as Schema;

describe("CollectionsNamespace relation-filter wiring", () => {
  it("resolves relation ids before the list query is built", async () => {
    const findMany = vi.fn(async (collection: string) => {
      if (collection === "collection_authors") {
        return ok([{ _id: "a1" }, { _id: "a2" }]);
      }
      return ok([{ _id: "post-1", author: "a1" }]);
    });
    const ns = new CollectionsNamespace(new TestAdapter(crudWith({ findMany })) as never);
    await ns.registerSchema("Posts", postsSchema);
    await ns.registerSchema("authors", authorsSchema);

    const result = await ns.find("Posts", {
      bypassCache: true,
      bypassRequestCache: true,
      user,
      filter: { author: { $some: { name: "Ada" } } },
    } as never);

    expect(findMany).toHaveBeenCalledTimes(2);
    const targetCall = findMany.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(targetCall[0]).toBe("collection_authors");
    expect(targetCall[1]).toEqual({ name: "Ada" });

    const [parentCollection, parentQuery] = findMany.mock.calls[1] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(parentCollection).toBe("collection_Posts");
    expect(parentQuery).toMatchObject({ author: { $in: ["a1", "a2"] } });
    expect(result.success).toBe(true);
  });

  it("resolves relation ids before the count query is built", async () => {
    const findMany = vi.fn(async () => ok([{ _id: "a1" }]));
    const count = vi.fn(async () => ({ success: true, data: 3 }));
    const ns = new CollectionsNamespace(new TestAdapter(crudWith({ findMany, count })) as never);
    await ns.registerSchema("Posts", postsSchema);
    await ns.registerSchema("authors", authorsSchema);

    const result = await ns.count("Posts", {
      user,
      filter: { author: { $none: "a1" } },
    });

    expect(result).toEqual({ success: true, data: 3 });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect((count.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]).toMatchObject({
      $or: [{ author: { $nin: ["a1"] } }, { author: null }],
    });
  });
});
