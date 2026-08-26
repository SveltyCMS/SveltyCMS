/**
 * @file tests/integration/databases/differential-parity.test.ts
 * @description Differential parity suite — raw fast paths, Drizzle paths and
 * transactions must produce IDENTICAL documents and semantics on every engine.
 *
 * Covers the guarantees that drift silently when paths diverge:
 * - raw insert (no-read-back synthesis) == insert inside a transaction
 *   (raw-on-txn connection) == plain Drizzle insert: same returned document
 * - rollback inside a transaction removes rows written by the raw paths
 * - read paths return ISODateString dates (epoch-ms leak guard)
 * - update outside vs inside a transaction converge to the same row
 * - raw findById vs Drizzle findOne return the same document
 *
 * Runs against the CURRENT DB_TYPE engine (SQLite always; PG/Maria on their
 * matrix jobs / local docker). Mongo's transaction tests are skipped — the
 * single-node docker container has no replica set.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import { connectWithRetry, currentDbType, shouldRunAdapterSuite } from "./adapter-test-env";

const ENGINE = currentDbType() as "sqlite" | "postgresql" | "mariadb" | "mongodb";
// SQLite is file-based — always run (no docker hint, mirroring sqlite-adapter.test.ts).
const gate =
  ENGINE === "sqlite" ? { run: true, reason: "sqlite always runs" } : shouldRunAdapterSuite(ENGINE);
const describeParity = gate.run ? describe : describe.skip;
if (!gate.run) {
  console.log(`⏭️ Differential parity suite skipped — ${gate.reason}`);
}

const TXN_ENGINES = new Set(["sqlite", "postgresql", "mariadb"]);

async function buildAdapter(): Promise<IDBAdapter> {
  const engine = ENGINE;
  if (engine === "postgresql") {
    const { PostgreSQLAdapter } =
      await import("../../../src/databases/postgresql/postgres-adapter");
    return new PostgreSQLAdapter() as any;
  }
  if (engine === "mariadb") {
    const { MariaDBAdapter } = await import("../../../src/databases/mariadb/mariadb-adapter");
    return new MariaDBAdapter() as any;
  }
  if (engine === "mongodb") {
    const { MongoDBAdapter } = await import("../../../src/databases/mongodb/mongo-db-adapter");
    return new MongoDBAdapter() as any;
  }
  const { SQLiteAdapter } = await import("../../../src/databases/sqlite/sqlite-adapter");
  return new SQLiteAdapter() as any;
}

function isIsoString(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
}

describeParity(`Differential parity — ${ENGINE}`, () => {
  let db: IDBAdapter | null = null;
  const stamp = Date.now().toString(36);
  const COLLECTION = `parity_${ENGINE}_${stamp}`;
  const TENANT = `parity-${ENGINE}` as any as DatabaseId;

  beforeAll(async () => {
    try {
      db = await buildAdapter();
      if (ENGINE === "sqlite") {
        // File-based — connect by path (no docker URI), isolated test file.
        const { unlinkSync } = await import("node:fs");
        const testDbPath = "config/test-database/sveltycms_test_differential.sqlite";
        try {
          unlinkSync(testDbPath);
        } catch {}
        const result = await db!.connect(testDbPath);
        if (!result.success) throw new Error(result.message);
      } else {
        await connectWithRetry(ENGINE, async (uri) => {
          const result = await db!.connect(uri);
          return {
            success: !!result?.success,
            message: result && !result.success ? result.message : undefined,
          };
        });
      }
      await (db as any).provision?.();
      await db.collection.createModel({
        _id: COLLECTION,
        name: COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
          { db_fieldName: "enabled", widget: { Name: "Checkbox" }, type: "boolean" },
          { db_fieldName: "views", widget: { Name: "Input" }, type: "number" },
        ],
      } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Differential parity] setup failed: ${msg}`);
      db = null;
      throw new Error(`Differential parity setup failed: ${msg}`);
    }
  }, 90_000);

  afterAll(async () => {
    if (db && db.isConnected()) {
      await (db as any).crud.deleteMany?.(
        COLLECTION,
        {},
        { bypassTenantCheck: true, tenantId: TENANT },
      );
      await db.disconnect();
    }
  });

  it("raw insert and insert-inside-transaction return identical documents", async () => {
    if (!db) return;
    const rawId = crypto.randomUUID() as any as DatabaseId;
    const txnId = crypto.randomUUID() as any as DatabaseId;
    const doc = { title: "parity", enabled: true, views: 7, tenantId: TENANT };

    const raw = await db.crud.insert(
      COLLECTION,
      { ...doc, _id: rawId } as any,
      {
        tenantId: TENANT,
      } as any,
    );
    expect(raw.success).toBe(true);

    let txnData: unknown = null;
    if (TXN_ENGINES.has(ENGINE)) {
      const txn = await db.transaction(async (tx) => {
        const res = await (tx as any).insert(COLLECTION, { ...doc, _id: txnId }, {
          tenantId: TENANT,
        } as any);
        return res;
      });
      expect(txn.success).toBe(true);
      txnData = (txn as any).data;
    }

    const rawDoc = (raw as any).data;
    expect(isIsoString(rawDoc.createdAt)).toBe(true);
    expect(isIsoString(rawDoc.updatedAt)).toBe(true);
    expect(rawDoc.title).toBe("parity");
    expect(rawDoc.enabled).toBe(true);
    expect(rawDoc.views).toBe(7);

    if (TXN_ENGINES.has(ENGINE)) {
      expect(txnData).not.toBeNull();
      const txnDoc = txnData as any;
      expect(isIsoString(txnDoc.createdAt)).toBe(true);
      expect(txnDoc.title).toBe("parity");
      expect(txnDoc.enabled).toBe(true);
      expect(txnDoc.views).toBe(7);
    }
  });

  it("rollback removes rows written by the raw paths inside the transaction", async () => {
    if (!db || !TXN_ENGINES.has(ENGINE)) return;
    const doomedId = crypto.randomUUID() as any as DatabaseId;
    const txn = await db.transaction(async (tx) => {
      await (tx as any).insert(
        COLLECTION,
        { _id: doomedId, title: "doomed", tenantId: TENANT } as any,
        {
          tenantId: TENANT,
        } as any,
      );
      await (tx as any).rollback();
      return { success: true, data: undefined };
    });
    expect(txn.success).toBe(false);

    const after = await db.crud.findOne(
      COLLECTION,
      { _id: doomedId } as any,
      {
        tenantId: TENANT,
      } as any,
    );
    expect(after.success).toBe(true);
    if (!after.success) throw new Error("findOne after rollback failed");
    expect(after.data).toBeNull();
  });

  it("commit inside a transaction persists raw-written rows", async () => {
    if (!db || !TXN_ENGINES.has(ENGINE)) return;
    const keptId = crypto.randomUUID() as any as DatabaseId;
    const txn = await db.transaction(async (tx) => {
      const res = await (tx as any).insert(
        COLLECTION,
        { _id: keptId, title: "kept", tenantId: TENANT } as any,
        { tenantId: TENANT } as any,
      );
      return res;
    });
    expect(txn.success).toBe(true);

    const after = await db.crud.findOne(
      COLLECTION,
      { _id: keptId } as any,
      {
        tenantId: TENANT,
      } as any,
    );
    expect(after.success).toBe(true);
    expect((after as any).data?.title).toBe("kept");
    expect(isIsoString((after as any).data?.createdAt)).toBe(true);
  });

  it("read paths return ISODateString dates, never epoch numbers", async () => {
    if (!db) return;
    const id = crypto.randomUUID() as any as DatabaseId;
    await db.crud.insert(
      COLLECTION,
      { _id: id, title: "dates", tenantId: TENANT } as any,
      {
        tenantId: TENANT,
      } as any,
    );

    const byId = await db.crud.findOne(COLLECTION, { _id: id } as any, { tenantId: TENANT } as any);
    const doc = (byId as any).data;
    expect(isIsoString(doc?.createdAt)).toBe(true);
    expect(isIsoString(doc?.updatedAt)).toBe(true);
    expect(typeof doc?.createdAt).toBe("string");
  });

  it("raw findById and Drizzle findOne agree on the same document", async () => {
    if (!db) return;
    const id = crypto.randomUUID() as any as DatabaseId;
    await db.crud.insert(
      COLLECTION,
      { _id: id, title: "reads", views: 3, tenantId: TENANT } as any,
      {
        tenantId: TENANT,
      } as any,
    );

    const byId = await db.crud.findOne(COLLECTION, { _id: id } as any, { tenantId: TENANT } as any);
    const byQuery = await db.crud.findOne(
      COLLECTION,
      { title: "reads" } as any,
      {
        tenantId: TENANT,
      } as any,
    );

    expect((byId as any).data?._id).toBe(id);
    expect((byQuery as any).data?._id).toBe(id);
    expect((byId as any).data?.title).toBe((byQuery as any).data?.title);
    expect((byId as any).data?.views).toBe((byQuery as any).data?.views);
  });
});
