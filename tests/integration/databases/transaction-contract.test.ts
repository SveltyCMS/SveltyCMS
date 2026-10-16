/**
 * @file tests/integration/databases/transaction-contract.test.ts
 * @description Cross-adapter transaction & rollback contract tests.
 *
 * Verifies that all 4 adapters handle transactions consistently:
 * - Successful commit persists data
 * - Rollback discards all changes
 * - Partial failure doesn't leave orphaned data
 * - Concurrent transaction isolation
 * - Error during transaction returns consistent error shape
 *
 * ### Run Modes
 *   DB=sqlite|mongodb|postgresql|mariadb bun test ...
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { generateUUID } from "@utils/native-utils";

// The self-healing proxy in db.ts wraps the adapter. Namespace methods
// (crud, auth, media, etc.) are proxied, but root-level methods like
// transaction(), getVersion(), queryBuilder() require direct adapter access.
// We get this through ensureFullInitialization's return value.
const TEST_COLLECTION = "txn_contract_test";
const TEST_TENANT = "txn-tenant";
const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

let db: any = null;
let adapter: any = null;

beforeAll(async () => {
  const result = await ensureFullInitialization();
  db = getDb();
  // Get the underlying adapter from the init result (bypasses proxy for root methods)
  adapter = result?.adapter || db;
  if (!db) throw new Error("Database not initialized");
  // Hard-require transaction surface — silent pass if removed is a false green
  expect(typeof adapter.transaction).toBe("function");
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
      .deleteMany(
        TEST_COLLECTION,
        {},
        withSystemScope("testing", { permanent: true, confirmWipe: true }),
      )
      .catch(() => {});
  }
});

function uid(_p: string) {
  return generateUUID();
}

describe("Transaction Contract — All Adapters", () => {
  it("transaction method exists on raw adapter", () => {
    // transaction() is on the underlying adapter, not the self-healing proxy
    expect(typeof adapter.transaction).toBe("function");
  });

  it("successful commit persists inserted data", async () => {
    expect(typeof adapter.transaction).toBe("function");

    const id = uid("txn-commit");
    await adapter.transaction(async (_txn: any) => {
      const _r = await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: id,
          title: "Txn Commit",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );
      if (!_r.success) throw new Error(_r.message);
      return { success: true, data: _r.data };
    });

    // After commit, data must be readable
    const found = await db.crud.findOne(TEST_COLLECTION, { _id: id }, tenantOpts);
    expect(found).toBeDefined();
    expect(found.success).toBe(true);
  });

  it("rollback discards inserted data", async () => {
    expect(typeof adapter.transaction).toBe("function");

    const id = uid("txn-rollback");
    try {
      await adapter.transaction(async (_txn: any) => {
        await _txn.insert(
          TEST_COLLECTION,
          {
            _id: id,
            title: "Will Rollback",
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
        throw new Error("Intentional rollback");
      });
    } catch {
      // Expected — transaction was rolled back
    }

    // After rollback, data must NOT exist
    const found = await db.crud.findOne(TEST_COLLECTION, { _id: id }, tenantOpts);
    expect(found.success).toBe(true);
    expect(found.data).toBeNull();
  });

  it("partial failure doesn't leave orphaned data", async () => {
    expect(typeof adapter.transaction).toBe("function");

    const id1 = uid("txn-orphan1");
    const id2 = uid("txn-orphan2");

    try {
      await adapter.transaction(async (_txn: any) => {
        // First insert succeeds
        await _txn.insert(
          TEST_COLLECTION,
          {
            _id: id1,
            title: "Orphan 1",
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
        // Second insert uses duplicate ID to force an adapter-level failure
        await _txn.insert(
          TEST_COLLECTION,
          {
            _id: id1,
            title: "Orphan 2",
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
        // Guarantee the abort regardless of whether the duplicate threw or upserted.
        throw new Error("Intentional partial failure");
      });
    } catch {
      // Expected
    }

    // All-or-nothing: the aborted transaction must leave nothing behind. The old
    // conditional (`if (f1.data) expect(f2.data)…`) asserted nothing when id1 was
    // absent, so a leaked id1 row passed silently.
    const f1 = await db.crud.findOne(TEST_COLLECTION, { _id: id1 }, tenantOpts);
    const f2 = await db.crud.findOne(TEST_COLLECTION, { _id: id2 }, tenantOpts);
    expect(f1.data ?? null).toBeNull();
    expect(f2.data ?? null).toBeNull();
  });

  it("returns consistent error shape on transaction failure", async () => {
    let rejected = false;
    let result: any;
    try {
      result = await adapter.transaction(async () => {
        throw new Error("TXN_FAILURE_TEST");
      });
    } catch (err: any) {
      rejected = true;
      expect(err).toBeDefined();
      expect(typeof err.message).toBe("string");
    }
    // Non-rejecting contract: the failure must surface in the envelope. The old
    // shape-only assert only ran *if* the adapter rejected, so a resolving
    // adapter passed without any failure assertion.
    if (!rejected) {
      expect(result?.success).toBe(false);
    }
  });

  it("concurrent transactions do not leave partial state on one failure", async () => {
    expect(typeof adapter.transaction).toBe("function");
    const okId = uid("txn-conc-ok");
    const failId = uid("txn-conc-fail");

    const [okRes, failRes] = await Promise.allSettled([
      adapter.transaction(async (txn: any) => {
        // Insert through the transaction handle — inserting via db.crud would run
        // outside the transaction and never roll back (the old test did exactly
        // that, which is why the leftover row had to be downgraded to a warning).
        await txn.insert(
          TEST_COLLECTION,
          { _id: okId, title: "Concurrent OK", status: "active", tenantId: TEST_TENANT },
          tenantOpts,
        );
        return { success: true };
      }),
      adapter.transaction(async (txn: any) => {
        await txn.insert(
          TEST_COLLECTION,
          { _id: failId, title: "Concurrent Fail", status: "active", tenantId: TEST_TENANT },
          tenantOpts,
        );
        throw new Error("CONCURRENT_TXN_FAIL");
      }),
    ]);

    // The failing leg must report failure (resolved envelope or rejection).
    if (failRes.status === "fulfilled" && failRes.value?.success === true) {
      throw new Error("Failed transaction reported success");
    }

    // Its insert ran inside the transaction, so the row must be rolled back.
    const leftover = await db.crud.findOne(TEST_COLLECTION, { _id: failId }, tenantOpts);
    expect(leftover.data ?? null).toBeNull();

    // A leg that reported success must be durable.
    if (okRes.status === "fulfilled" && okRes.value?.success === true) {
      const okRow = await db.crud.findOne(TEST_COLLECTION, { _id: okId }, tenantOpts);
      expect(okRow.data ?? null).not.toBeNull();
    }
  });
});
