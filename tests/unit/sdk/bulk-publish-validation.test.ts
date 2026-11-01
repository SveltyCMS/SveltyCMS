/**
 * @file tests/unit/sdk/bulk-publish-validation.test.ts
 * @description M4 — a bulk publish must pass the same per-entry validation as a
 * single save, must name the offending entries, and must not write when any
 * entry is invalid.
 *
 * Features:
 * - bulk publish of an entry whose required field is empty is rejected with
 *   400 FIELD_VALIDATION_ERROR, the entry id and the field name
 * - nothing is written when the batch is rejected (no updateMany)
 * - a valid bulk publish of 20 entries stays ONE updateMany + ONE findByIds
 *   (no per-row statement, no N+1)
 * - the pure plan helpers (missingRequiredForPublish / formatBulkRejections)
 *   follow required, requiredIf and showIf exactly like the single-write gate
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

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

/** Minimal in-memory adapter — only the CRUD lanes these tests exercise. */
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
    findByIds: vi.fn(async () => ({ success: true, data: [] })),
    insert: vi.fn(async () => ({ success: true, data: {} })),
    update: vi.fn(async () => ({ success: true, data: {} })),
    updateMany: vi.fn(async () => ({ success: true, data: { modifiedCount: 0 } })),
    delete: vi.fn(async () => ({ success: true, data: undefined })),
    count: vi.fn(async () => ({ success: true, data: 0 })),
    ...overrides,
  } as unknown as ICrudAdapter;
}

const requiredSchema = {
  _id: "Posts",
  name: "Posts",
  slug: "posts",
  fields: [{ db_fieldName: "title", name: "Title", widget: { Name: "Input" }, required: true }],
};

const ADMIN = { _id: "a1", role: "admin", isAdmin: true };

afterEach(() => {
  CollectionsNamespace.evictRequestCache();
});

describe("bulk publish parity with the single write path", () => {
  it("rejects an invalid publish, names the entry, and writes nothing", async () => {
    const findByIds = vi.fn(async () => ({
      success: true,
      data: [{ _id: "p1", title: "", status: "draft" }],
    }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } }));
    const ns = new CollectionsNamespace(
      new TestAdapter(crudWith({ findByIds, updateMany })) as any,
    );
    await ns.registerSchema("Posts", requiredSchema as any);

    await expect(
      ns.bulkUpdate("Posts", [{ id: "p1", data: { status: "publish" } }], { user: ADMIN } as any),
    ).rejects.toMatchObject({
      status: 400,
      code: "FIELD_VALIDATION_ERROR",
    });

    // The message must name the entry and the field, not just fail.
    await expect(
      ns.bulkUpdate("Posts", [{ id: "p1", data: { status: "publish" } }], { user: ADMIN } as any),
    ).rejects.toThrow(/p1: Field 'Title' is required when publishing/);

    // A rejected batch leaves no partial write behind.
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("accepts a valid publish when the stored row fills the required field", async () => {
    const findByIds = vi.fn(async () => ({
      success: true,
      data: [{ _id: "p1", title: "Filled", status: "draft" }],
    }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } }));
    const ns = new CollectionsNamespace(
      new TestAdapter(crudWith({ findByIds, updateMany })) as any,
    );
    await ns.registerSchema("Posts", requiredSchema as any);

    const result = await ns.bulkUpdate("Posts", [{ id: "p1", data: { status: "publish" } }], {
      user: ADMIN,
    } as any);
    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps a 20-entry publish at one UPDATE and one row lookup", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`);
    const findByIds = vi.fn(async () => ({
      success: true,
      data: ids.map((id) => ({ _id: id, title: `Entry ${id}`, status: "draft" })),
    }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 20 } }));
    const update = vi.fn(async () => ({ success: true, data: {} }));
    const ns = new CollectionsNamespace(
      new TestAdapter(crudWith({ findByIds, updateMany, update })) as any,
    );
    await ns.registerSchema("Posts", requiredSchema as any);

    const result = await ns.bulkUpdate(
      "Posts",
      ids.map((id) => ({ id, data: { status: "publish" } })),
      { user: ADMIN } as any,
    );

    expect(result.success).toBe(true);
    // One statement for the whole batch — no per-row write, no N+1.
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    // One row lookup carries every target of the batch.
    expect(findByIds).toHaveBeenCalledTimes(1);
    expect((findByIds.mock.calls[0] as unknown[])[1]).toHaveLength(20);
  });

  it("names every invalid entry of a batch, not just the first", async () => {
    const findByIds = vi.fn(async () => ({
      success: true,
      data: [
        { _id: "p1", title: "", status: "draft" },
        { _id: "p2", title: "Fine", status: "draft" },
        { _id: "p3", title: "", status: "draft" },
      ],
    }));
    const updateMany = vi.fn(async () => ({ success: true, data: { modifiedCount: 0 } }));
    const ns = new CollectionsNamespace(
      new TestAdapter(crudWith({ findByIds, updateMany })) as any,
    );
    await ns.registerSchema("Posts", requiredSchema as any);

    const error = await ns
      .bulkUpdate(
        "Posts",
        ["p1", "p2", "p3"].map((id) => ({ id, data: { status: "publish" } })),
        { user: ADMIN } as any,
      )
      .catch((e: Error) => e);

    expect((error as Error).message).toContain("2 of 3 entries were rejected");
    expect((error as Error).message).toContain("p1:");
    expect((error as Error).message).toContain("p3:");
    expect((error as Error).message).not.toContain("p2:");
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("bulk validation plan helpers", () => {
  it("reads required, requiredIf and showIf exactly like the single write", async () => {
    const { missingRequiredForPublish } =
      await import("@src/services/sdk/namespaces/collections/bulk-validation");

    const hot = {
      _hasRequiredFields: true,
      _hasConditionallyRequiredFields: true,
      _requiredFields: [
        { name: "Title", key: "title" },
        {
          name: "Sponsor Name",
          key: "sponsor_name",
          showIf: { field: "has_sponsor", operator: "equals", value: true },
        },
      ],
      _conditionallyRequiredFields: [
        {
          name: "License Key",
          key: "license_key",
          requiredIf: { field: "is_licensed", operator: "equals", value: true },
        },
      ],
    } as any;

    // Nothing filled, no condition met -> only Title is missing.
    expect(missingRequiredForPublish(hot, {})).toEqual(["Title"]);
    // Conditions met -> both conditional names appear.
    expect(
      missingRequiredForPublish(hot, { has_sponsor: true, is_licensed: true, title: "T" }),
    ).toEqual(["Sponsor Name", "License Key"]);
    // Empty array / empty object count as missing, like the single-write gate.
    expect(missingRequiredForPublish(hot, { title: [], has_sponsor: false })).toEqual(["Title"]);
    // No plan -> no gate.
    expect(missingRequiredForPublish(undefined, {})).toEqual([]);
  });

  it("formats a rejection list with ids and elides the tail", async () => {
    const { formatBulkRejections } =
      await import("@src/services/sdk/namespaces/collections/bulk-validation");
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`,
      message: "Field 'Title' is required when publishing",
    }));
    const message = formatBulkRejections(many, 20);
    expect(message).toContain("7 of 20 entries were rejected");
    expect(message).toContain("e0: Field 'Title' is required when publishing");
    expect(message).toContain("and 2 more");
    expect(formatBulkRejections([], 20)).toBe("");
  });
});
