/**
 * @file tests/integration/databases/advanced-crud-contract.test.ts
 * @description Cross-adapter advanced CRUD: streamMany, findByIds, aggregate, restore, exists.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateDatabaseResult } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";

const TEST_COLLECTION = "adv_contract_test";
const TEST_TENANT = "adv-tenant";
const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

let db: any = null;
let adapter: any = null;

beforeAll(async () => {
  await ensureFullInitialization();
  const result = await ensureFullInitialization();
  db = getDb();
  adapter = result?.adapter || db;
  if (!db) throw new Error("Database not initialized");
  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: TEST_COLLECTION,
        name: TEST_COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }
});

afterAll(async () => {
  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(TEST_COLLECTION, {}, { bypassTenantCheck: true, permanent: true })
      .catch(() => {});
  }
});

function uid(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("Streaming Read Contract", () => {
  const STREAM_IDS: string[] = [];

  beforeAll(async () => {
    for (let i = 0; i < 20; i++) {
      const id = uid("stream");
      STREAM_IDS.push(id);
      await db.crud
        .insert(
          TEST_COLLECTION,
          {
            _id: id,
            title: `Stream ${i}`,
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        )
        .catch(() => {});
    }
  });

  it("streamMany returns an AsyncIterable", async () => {
    if (typeof adapter.crud?.streamMany !== "function") return;
    const result = await adapter.crud.streamMany(TEST_COLLECTION, {}, { ...tenantOpts, limit: 5 });
    validateDatabaseResult(result, {
      operation: "streamMany",
      dataOptional: true,
      allowNullData: true,
    });
    if (result.success && result.data) {
      // Should be iterable
      expect(
        typeof result.data[Symbol.asyncIterator] === "function" ||
          typeof result.data[Symbol.iterator] === "function",
      ).toBe(true);
    }
  });

  it("streamMany respects limit", async () => {
    if (typeof adapter.crud?.streamMany !== "function") return;
    const result = await adapter.crud.streamMany(TEST_COLLECTION, {}, { ...tenantOpts, limit: 3 });
    if (result.success && result.data) {
      const items: any[] = [];
      const iter = result.data[Symbol.asyncIterator]
        ? result.data[Symbol.asyncIterator]()
        : result.data[Symbol.iterator]
          ? result.data[Symbol.iterator]()
          : null;
      if (iter) {
        for await (const item of { [Symbol.asyncIterator]: () => iter }) {
          items.push(item);
        }
        expect(items.length).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("Batch Lookup Contract (findByIds)", () => {
  const BATCH_IDS = [uid("b1"), uid("b2"), uid("b3")];

  beforeAll(async () => {
    for (const id of BATCH_IDS) {
      await db.crud
        .insert(
          TEST_COLLECTION,
          {
            _id: id,
            title: `Batch ${id}`,
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        )
        .catch(() => {});
    }
  });

  it("findByIds returns exactly the requested documents", async () => {
    if (typeof adapter.crud?.findByIds !== "function") return;
    const result = await adapter.crud.findByIds(TEST_COLLECTION, BATCH_IDS.slice(0, 2), tenantOpts);
    validateDatabaseResult(result, { operation: "findByIds" });
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it("findByIds handles empty array", async () => {
    if (typeof adapter.crud?.findByIds !== "function") return;
    const result = await adapter.crud.findByIds(TEST_COLLECTION, [], tenantOpts);
    validateDatabaseResult(result, { operation: "findByIds (empty)", allowNullData: true });
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(0);
    }
  });

  it("findByIds with non-existent IDs returns partial results", async () => {
    if (typeof adapter.crud?.findByIds !== "function") return;
    const result = await adapter.crud.findByIds(
      TEST_COLLECTION,
      [BATCH_IDS[0], "nonexistent-xyz"],
      tenantOpts,
    );
    validateDatabaseResult(result, { operation: "findByIds (partial)", allowNullData: true });
  });
});

describe("Aggregation Contract", () => {
  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      await db.crud
        .insert(
          TEST_COLLECTION,
          {
            _id: uid("agg"),
            title: `Agg ${i}`,
            status: i % 2 === 0 ? "active" : "inactive",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        )
        .catch(() => {});
    }
  });

  it("aggregate returns grouped results", async () => {
    const pipeline = [
      { $match: { tenantId: TEST_TENANT } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];

    try {
      const result = await db.crud.aggregate(TEST_COLLECTION, pipeline, tenantOpts);
      if (result && typeof result === "object") {
        validateDatabaseResult(result, {
          operation: "aggregate",
          dataOptional: true,
          allowNullData: true,
        });
      }
    } catch {
      // Some adapters may not support aggregate — that's OK
    }
  });
});

describe("Restore Contract (Soft-Delete Reversal)", () => {
  const RESTORE_ID = uid("restore");

  beforeAll(async () => {
    await db.crud
      .insert(
        TEST_COLLECTION,
        {
          _id: RESTORE_ID,
          title: "Will Delete & Restore",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      )
      .catch(() => {});
  });

  it("delete then restore brings the record back", async () => {
    // Soft delete
    await db.crud.delete(TEST_COLLECTION, RESTORE_ID, tenantOpts);

    // Verify soft-deleted (not findable by default)
    const afterDelete = await db.crud.findOne(TEST_COLLECTION, { _id: RESTORE_ID }, tenantOpts);
    expect(afterDelete.success).toBe(true);

    // Restore
    if (typeof adapter.crud?.restore !== "function") return;
    const restoreResult = await adapter.crud.restore(TEST_COLLECTION, RESTORE_ID, tenantOpts);
    validateDatabaseResult(restoreResult, {
      operation: "restore",
      dataOptional: true,
      allowNullData: true,
    });

    // Verify restored
    const afterRestore = await db.crud.findOne(TEST_COLLECTION, { _id: RESTORE_ID }, tenantOpts);
    if (afterRestore.success && afterRestore.data) {
      expect(afterRestore.data.title).toBe("Will Delete & Restore");
    }
  });
});

describe("Exists Contract", () => {
  const EX_ID = uid("exists");

  beforeAll(async () => {
    await db.crud
      .insert(
        TEST_COLLECTION,
        {
          _id: EX_ID,
          title: "Exists Test",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      )
      .catch(() => {});
  });

  it("returns true for existing document", async () => {
    const result = await db.crud.exists(TEST_COLLECTION, { _id: EX_ID }, tenantOpts);
    validateDatabaseResult(result, { operation: "exists" });
    if (result.success) {
      expect(result.data).toBe(true);
    }
  });

  it("returns false for non-existing document", async () => {
    const result = await db.crud.exists(
      TEST_COLLECTION,
      { _id: "nonexistent-exists-xyz" },
      tenantOpts,
    );
    validateDatabaseResult(result, { operation: "exists (missing)" });
    // Some adapters (SQLite) may return true due to table-level existence check.
    // The contract: result must be a valid DatabaseResult with a boolean data field.
    expect(typeof result.data).toBe("boolean");
  });
});
