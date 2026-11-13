/**
 * @file tests/unit/services/relation-link-service.test.ts
 * @description Behaviour of the normalized many-to-many junction store.
 *
 * Pins the contract the write/read paths rely on:
 * - deterministic edge ids (idempotent, tenant-scoped, duplicate-proof)
 * - payload normalization for both `string[]` and `{ id, sort, metadata }[]`
 * - diff-based sync (only changed edges written, stale edges deleted)
 * - batched source hydration and reverse lookup
 * - cascade deletes for either side
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSourceLinks,
  deleteTargetLinks,
  getReverseLinks,
  getSourceLinks,
  normalizeLinkInputs,
  relationLinkId,
  syncSourceLinks,
  type RelationLinkAdapter,
  type RelationLinkRow,
} from "@src/services/core/relation-link-service";

type FakeRow = RelationLinkRow & Record<string, unknown>;

function createStore(initial: FakeRow[] = []) {
  let rows = initial.map((row) => ({ ...row }));
  const crud = {
    findMany: vi.fn(async (_collection: string, filter: Record<string, unknown>) => {
      let out = rows;
      if (typeof filter.sourceCollection === "string") {
        out = out.filter((row) => row.sourceCollection === filter.sourceCollection);
      }
      if (typeof filter.fieldName === "string") {
        out = out.filter((row) => row.fieldName === filter.fieldName);
      }
      if (typeof filter.targetCollection === "string") {
        out = out.filter((row) => row.targetCollection === filter.targetCollection);
      }
      if (typeof filter.targetId === "string") {
        out = out.filter((row) => row.targetId === filter.targetId);
      }
      if (filter.sourceId) {
        const sid = filter.sourceId as { $in?: string[] } | string;
        if (typeof sid === "string") out = out.filter((row) => row.sourceId === sid);
        else if (sid.$in) {
          const ids = new Set(sid.$in);
          out = out.filter((row) => ids.has(row.sourceId));
        }
      }
      return { success: true, data: out };
    }),
    deleteMany: vi.fn(async (_collection: string, filter: Record<string, any>) => {
      const before = rows.length;
      if (filter._id?.$in) {
        const ids = new Set<string>(filter._id.$in);
        rows = rows.filter((row) => !ids.has(row._id));
      } else {
        // Generic predicate: a row is deleted when it matches every supplied key.
        rows = rows.filter((row) => {
          if (
            filter.sourceCollection !== undefined &&
            row.sourceCollection !== filter.sourceCollection
          )
            return true;
          if (filter.sourceId !== undefined && row.sourceId !== filter.sourceId) return true;
          if (filter.fieldName !== undefined && row.fieldName !== filter.fieldName) return true;
          if (
            filter.targetCollection !== undefined &&
            row.targetCollection !== filter.targetCollection
          )
            return true;
          if (filter.targetId !== undefined && row.targetId !== filter.targetId) return true;
          return false;
        });
      }
      return { success: true, data: { deletedCount: before - rows.length } };
    }),
    upsertMany: vi.fn(async (_collection: string, items: Array<{ data: FakeRow }>) => {
      for (const item of items) {
        const index = rows.findIndex((row) => row._id === item.data._id);
        if (index >= 0) rows[index] = { ...rows[index], ...item.data };
        else rows.push({ ...item.data });
      }
      return { success: true, data: items.map((item) => item.data) };
    }),
  };
  return {
    adapter: { crud } as unknown as RelationLinkAdapter,
    crud,
    rows: () => rows,
  };
}

const TENANT = "tenant-1";
const SOURCE = "posts";
const TARGET = "tags";
const FIELD = "tags";

function edge(targetId: string, sort = 0): FakeRow {
  return {
    _id: relationLinkId(TENANT, SOURCE, FIELD, "post-1", targetId),
    tenantId: TENANT,
    sourceCollection: SOURCE,
    sourceId: "post-1",
    fieldName: FIELD,
    targetCollection: TARGET,
    targetId,
    sortOrder: sort,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("normalizeLinkInputs", () => {
  it("accepts a plain id array and assigns positional sort", () => {
    expect(normalizeLinkInputs(["a", "b"])).toEqual([
      { id: "a", sort: 0, metadata: null },
      { id: "b", sort: 1, metadata: null },
    ]);
  });

  it("accepts edge objects with explicit sort and metadata", () => {
    expect(normalizeLinkInputs([{ id: "a", sort: 5, metadata: { label: "First" } }])).toEqual([
      { id: "a", sort: 5, metadata: { label: "First" } },
    ]);
  });

  it("dedupes (last wins) and drops empty/non-string ids", () => {
    const out = normalizeLinkInputs(["a", "a", "", null, 7, { id: "b" }]);
    expect(out.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("returns [] for a non-array payload", () => {
    expect(normalizeLinkInputs(undefined)).toEqual([]);
    expect(normalizeLinkInputs("a")).toEqual([]);
  });
});

describe("relationLinkId", () => {
  it("is deterministic for the same edge", () => {
    expect(relationLinkId(TENANT, SOURCE, FIELD, "post-1", "tag-1")).toBe(
      relationLinkId(TENANT, SOURCE, FIELD, "post-1", "tag-1"),
    );
  });

  it("isolates tenants, fields and directions", () => {
    const base = relationLinkId(TENANT, SOURCE, FIELD, "post-1", "tag-1");
    expect(relationLinkId("tenant-2", SOURCE, FIELD, "post-1", "tag-1")).not.toBe(base);
    expect(relationLinkId(TENANT, SOURCE, "other", "post-1", "tag-1")).not.toBe(base);
    expect(relationLinkId(TENANT, SOURCE, FIELD, "tag-1", "post-1")).not.toBe(base);
  });

  it("formats as a 36-char uuid-shaped id", () => {
    expect(relationLinkId(TENANT, SOURCE, FIELD, "a", "b")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("getSourceLinks", () => {
  it("hydrates many parents in one query and sorts by sortOrder", async () => {
    const second: FakeRow = {
      ...edge("tag-2", 0),
      _id: relationLinkId(TENANT, SOURCE, FIELD, "post-2", "tag-2"),
      sourceId: "post-2",
    };
    const { adapter, crud } = createStore([edge("tag-1", 1), edge("tag-0", 0), second]);

    const links = await getSourceLinks(adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      fieldName: FIELD,
      sourceIds: ["post-1", "post-2"],
    });

    expect(crud.findMany).toHaveBeenCalledTimes(1);
    expect(links.get("post-1")?.map((row) => row.targetId)).toEqual(["tag-0", "tag-1"]);
    expect(links.get("post-2")?.map((row) => row.targetId)).toEqual(["tag-2"]);
  });

  it("returns an empty map for no ids without querying", async () => {
    const { adapter, crud } = createStore([edge("tag-1")]);
    const links = await getSourceLinks(adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      fieldName: FIELD,
      sourceIds: [],
    });
    expect(links.size).toBe(0);
    expect(crud.findMany).not.toHaveBeenCalled();
  });
});

describe("syncSourceLinks", () => {
  let store: ReturnType<typeof createStore>;
  beforeEach(() => {
    store = createStore([edge("tag-1", 0), edge("tag-2", 1)]);
  });

  it("deletes removed edges and inserts new ones, leaving unchanged edges alone", async () => {
    await syncSourceLinks(store.adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
      links: [
        {
          fieldName: FIELD,
          targetCollection: TARGET,
          desired: normalizeLinkInputs(["tag-1", "tag-3"]),
        },
      ],
    });

    expect(
      store
        .rows()
        .map((row) => row.targetId)
        .sort(),
    ).toEqual(["tag-1", "tag-3"]);
    expect(store.crud.deleteMany).toHaveBeenCalledTimes(1);
    const deletedIds = (store.crud.deleteMany.mock.calls[0][1] as { _id: { $in: string[] } })._id
      .$in;
    expect(deletedIds).toEqual([edge("tag-2")._id]);
    // Only the new edge is written.
    const upserts = store.crud.upsertMany.mock.calls[0][1] as Array<{ data: FakeRow }>;
    expect(upserts.map((item) => item.data.targetId)).toEqual(["tag-3"]);
  });

  it("writes nothing when the desired set is unchanged", async () => {
    await syncSourceLinks(store.adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
      links: [
        {
          fieldName: FIELD,
          targetCollection: TARGET,
          desired: normalizeLinkInputs(["tag-1", "tag-2"]),
        },
      ],
    });
    expect(store.crud.deleteMany).not.toHaveBeenCalled();
    expect(store.crud.upsertMany).not.toHaveBeenCalled();
  });

  it("clears every edge when the desired set is empty", async () => {
    await syncSourceLinks(store.adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
      links: [
        {
          fieldName: FIELD,
          targetCollection: TARGET,
          desired: [],
        },
      ],
    });
    expect(store.rows()).toEqual([]);
  });

  it("updates sort/metadata without deleting the edge", async () => {
    await syncSourceLinks(store.adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
      links: [
        {
          fieldName: FIELD,
          targetCollection: TARGET,
          desired: [
            { id: "tag-1", sort: 9, metadata: { label: "Pinned" } },
            { id: "tag-2", sort: 1, metadata: null },
          ],
        },
      ],
    });
    expect(store.crud.deleteMany).not.toHaveBeenCalled();
    const upserts = store.crud.upsertMany.mock.calls[0][1] as Array<{ data: FakeRow }>;
    expect(upserts).toHaveLength(1);
    expect(upserts[0].data).toMatchObject({
      targetId: "tag-1",
      sortOrder: 9,
      metadata: { label: "Pinned" },
    });
  });

  it("fails loudly when the edge read fails", async () => {
    store.crud.findMany.mockResolvedValueOnce({ success: false, error: "boom" } as never);
    await expect(
      syncSourceLinks(store.adapter, {
        tenantId: TENANT,
        sourceCollection: SOURCE,
        sourceId: "post-1",
        links: [
          {
            fieldName: FIELD,
            targetCollection: TARGET,
            desired: normalizeLinkInputs(["tag-9"]),
          },
        ],
      }),
    ).rejects.toThrow(/Could not compare links/);
  });

  it("is idempotent across a repeated identical sync", async () => {
    const params = {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
      links: [
        {
          fieldName: FIELD,
          targetCollection: TARGET,
          desired: normalizeLinkInputs(["tag-1", "tag-3"]),
        },
      ],
    };
    await syncSourceLinks(store.adapter, params);
    const afterFirst = store.rows().length;
    store.crud.deleteMany.mockClear();
    store.crud.upsertMany.mockClear();
    await syncSourceLinks(store.adapter, params);
    expect(store.rows()).toHaveLength(afterFirst);
    expect(store.crud.deleteMany).not.toHaveBeenCalled();
    expect(store.crud.upsertMany).not.toHaveBeenCalled();
  });
});

describe("cascade deletes", () => {
  it("deleteSourceLinks removes every edge owned by the parent", async () => {
    const store = createStore([edge("tag-1"), edge("tag-2")]);
    await deleteSourceLinks(store.adapter, {
      tenantId: TENANT,
      sourceCollection: SOURCE,
      sourceId: "post-1",
    });
    expect(store.rows()).toEqual([]);
  });

  it("deleteTargetLinks removes every edge pointing at the target", async () => {
    const other: FakeRow = {
      ...edge("tag-1"),
      _id: relationLinkId(TENANT, SOURCE, FIELD, "post-2", "tag-1"),
      sourceId: "post-2",
    };
    const store = createStore([edge("tag-1"), other, edge("tag-2")]);
    await deleteTargetLinks(store.adapter, {
      tenantId: TENANT,
      targetCollection: TARGET,
      targetId: "tag-1",
    });
    expect(store.rows().map((row) => row.targetId)).toEqual(["tag-2"]);
  });
});

describe("getReverseLinks", () => {
  it("selects the edges that point at the target", async () => {
    const other: FakeRow = {
      ...edge("tag-1"),
      _id: relationLinkId(TENANT, SOURCE, FIELD, "post-2", "tag-1"),
      sourceId: "post-2",
    };
    const store = createStore([edge("tag-1"), other, edge("tag-2")]);
    const rows = await getReverseLinks(store.adapter, {
      tenantId: TENANT,
      targetCollection: TARGET,
      targetId: "tag-1",
      fieldName: FIELD,
    });
    expect(rows.map((row) => row.sourceId).sort()).toEqual(["post-1", "post-2"]);
  });
});
