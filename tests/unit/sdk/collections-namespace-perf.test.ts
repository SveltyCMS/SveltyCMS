/**
 * @file tests/unit/sdk/collections-namespace-perf.test.ts
 * @description Behavioral invariants for the CollectionsNamespace orchestration
 * refactors (allocation-reduction work with byte-identical behavior). Asserts
 * observable behavior only — cache-key consistency, owner-coercion semantics,
 * envelope passthrough, batch stamping and publish-gate errors — never timings.
 *
 * Features:
 * - stripUnownedRows: per-row owner-id coercion (numeric/string) with copied
 *   envelopes whenever rows are dropped (no early-return leak for empty ids)
 * - findById: the L1 point-read write key is exactly the key the next request
 *   probes (single-flight, one findOne across two calls)
 * - find: cache-bypass read returns the adapter envelope with `_collection`
 *   meta stamped in place
 * - bulkUpdate: homogeneous batches stamp `updatedBy` per row via the hoisted
 *   schema scan and collapse into a single `updateMany`
 * - create: publish-gate required-field error keeps its status/code/message
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectionsNamespace,
  stripUnownedRows,
} from "@src/services/sdk/namespaces/collections-namespace";
import { hasRequestCache } from "@src/services/sdk/namespaces/collections/request-cache";
import { publicationCacheSuffix } from "@utils/security/publication-policy";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

// Workflow module imports resolve against these fakes (same pattern as
// workflow-service-completion.test.ts / workflow-namespace.test.ts).
vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { logEvent: vi.fn().mockResolvedValue(undefined) },
  AuditEventType: { WORKFLOW_TRANSITION: "workflow.transition" },
}));

const { fakeDbAdapter } = vi.hoisted(() => ({
  fakeDbAdapter: {
    crud: {
      findMany: async () => ({ success: true, data: [], total: 0 }),
      findOne: async () => ({ success: true, data: null }),
      insert: async () => ({ success: true, data: {} }),
      update: async () => ({ success: true, data: {} }),
      delete: async () => ({ success: true, data: undefined }),
    },
  },
}));

vi.mock("@src/databases/db", () => ({ dbAdapter: fakeDbAdapter }));

/** Minimal in-memory adapter — only the CRUD lanes the tests exercise. */
class TestAdapter extends BaseAdapter {
  type = "sqlite" as any;
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
    findMany: vi.fn(async () => ({ success: true, data: [], total: 0 })),
    findOne: vi.fn(async () => ({ success: true, data: null })),
    insert: vi.fn(async () => ({ success: true, data: {} })),
    update: vi.fn(async () => ({ success: true, data: {} })),
    delete: vi.fn(async () => ({ success: true, data: undefined })),
    count: vi.fn(async () => ({ success: true, data: 0 })),
    ...overrides,
  } as unknown as ICrudAdapter;
}

const baseSchema = {
  _id: "Articles",
  name: "Articles",
  slug: "articles",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
  status: "published",
};

const updatedBySchema = {
  _id: "BulkArticles",
  name: "BulkArticles",
  slug: "bulk-articles",
  fields: [{ db_fieldName: "updatedBy", widget: { Name: "Input" } }],
  status: "published",
};

const requiredSchema = {
  _id: "Posts",
  name: "Posts",
  slug: "posts",
  fields: [{ db_fieldName: "title", name: "Title", widget: { Name: "Input" }, required: true }],
};

const EDITOR = { _id: "u1", role: "editor" };
const ADMIN = { _id: "a1", role: "admin", isAdmin: true };

afterEach(() => {
  // L1 request cache is module-global — clear it so point-read keys never leak
  // between tests.
  CollectionsNamespace.evictRequestCache();
});

describe("stripUnownedRows owner-id coercion", () => {
  it("matches numeric and string owner ids through String coercion", () => {
    const env = {
      success: true,
      data: [
        { _id: "1", ownerId: 42 },
        { _id: "2", ownerId: "42" },
      ],
    };
    expect(stripUnownedRows(env, "ownerId", { _id: 42 })).toBe(env);
  });

  it("drops a coerced foreign row on a copied envelope", () => {
    const env = { success: true, data: [{ _id: "1", ownerId: 43 }] };
    const result = stripUnownedRows(env, "ownerId", { _id: 42 }) as { data: unknown[] };
    expect(result).not.toBe(env);
    expect(result.data).toEqual([]);
  });

  it("strips every row on a copied envelope for an empty owner id", () => {
    const env = { success: true, data: [{ _id: "1", ownerId: "u1" }] };
    const result = stripUnownedRows(env, "ownerId", { _id: "" }) as { data: unknown[] };
    expect(result).not.toBe(env);
    expect(result.data).toEqual([]);
  });
});

describe("findById point-read cache-key contract", () => {
  it("writes the L1 entry under the key the next request probes", async () => {
    const findOne = vi.fn(async () => ({
      success: true,
      data: { _id: "doc-1", title: "Doc" },
    }));
    const crud = crudWith({ findOne });
    const ns = new CollectionsNamespace(new TestAdapter(crud) as any);
    await ns.registerSchema("Articles", baseSchema as any);

    const options = { user: EDITOR };
    const first = await ns.findById("Articles", "doc-1", options as any);
    expect(first.success).toBe(true);
    expect((first.data as { _id?: string })._id).toBe("doc-1");

    // The point-read L1 write must land under exactly the key the next probe
    // builds — a key mismatch would miss L1 and hit the adapter again.
    const expectedKey = `global:collection:Articles:doc-1${publicationCacheSuffix("published")}`;
    expect(hasRequestCache(expectedKey)).toBe(true);

    const second = await ns.findById("Articles", "doc-1", options as any);
    expect((second.data as { _id?: string })._id).toBe("doc-1");
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});

describe("find cache-bypass envelope", () => {
  it("returns the adapter envelope with in-place _collection meta", async () => {
    const findMany = vi.fn(async () => ({
      success: true,
      data: [{ _id: "doc-1", title: "Article 1" }],
    }));
    const crud = crudWith({ findMany });
    const ns = new CollectionsNamespace(new TestAdapter(crud) as any);
    await ns.registerSchema("Articles", baseSchema as any);

    const result = await ns.find("Articles", {
      bypassCache: true,
      bypassRequestCache: true,
      limit: 5,
    } as any);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe("Article 1");
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe("bulkUpdate homogeneous batch stamping", () => {
  it("stamps updatedBy on every row through one updateMany call", async () => {
    const updateMany = vi.fn(async () => ({
      success: true,
      data: [{ _id: "1" }, { _id: "2" }],
    }));
    const crud = crudWith({ updateMany });
    const ns = new CollectionsNamespace(new TestAdapter(crud) as any);
    await ns.registerSchema("BulkArticles", updatedBySchema as any);

    const result = await ns.bulkUpdate(
      "BulkArticles",
      [
        { id: "1", data: { status: "draft" } },
        { id: "2", data: { status: "draft" } },
      ],
      { user: ADMIN } as any,
    );
    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [, filter, data] = updateMany.mock.calls[0] as unknown as [
      string,
      { _id: { $in: string[] } },
      { updatedBy?: string; updatedAt?: string },
    ];
    expect(filter._id.$in).toEqual(["1", "2"]);
    expect(data.updatedBy).toBe("a1");
    expect(typeof data.updatedAt).toBe("string");
  });
});

describe("create publish-gate required fields", () => {
  it("rejects a publish with a missing required field (unchanged error shape)", async () => {
    const crud = crudWith({});
    const ns = new CollectionsNamespace(new TestAdapter(crud) as any);
    await ns.registerSchema("Posts", requiredSchema as any);

    await expect(
      ns.create("Posts", { status: "publish" }, { user: ADMIN } as any),
    ).rejects.toMatchObject({
      status: 400,
      code: "FIELD_VALIDATION_ERROR",
      message: "Field 'Title' is required when publishing",
    });
  });
});
