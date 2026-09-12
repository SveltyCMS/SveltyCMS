/**
 * @file tests/benchmarks/ale-smoke.test.ts
 * @description Smoke test: verify the dbAdapter layer initializes under bun
 * and that field-level AES-256-GCM encryption round-trips. Validates the ALE
 * benchmark harness before the real run.
 */
import { sql } from "drizzle-orm";
import { test, describe, expect } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { encryptFieldValue, decryptFieldValue } from "@utils/security/field-encryption";

const COLLECTION_ID = "ale_smoke";
const TEST_TENANT = "global";
const STABLE_ID = "30000000-0000-4000-8000-000000000001";

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

describe("ALE smoke — dbAdapter + AES-256-GCM", () => {
  test("ecb: field encryption round-trips", async () => {
    const ctx = { collectionId: COLLECTION_ID, tenantId: TEST_TENANT };
    const secret = "my-secret-email@example.com";
    const enc = await encryptFieldValue(secret, ctx, "email");
    expect(typeof enc).toBe("string");
    expect(enc.startsWith("v1:")).toBe(true);
    const dec = await decryptFieldValue(enc, ctx, "email");
    expect(dec).toBe(secret);
  });

  test("db: initialize adapter + collection + crud insert", async () => {
    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");
    expect(typeof db.crud?.insert).toBe("function");

    if (db.collection?.createModel) {
      const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
      try {
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${q}collection_${COLLECTION_ID}${q}`));
      } catch {}
      await db.collection
        .createModel({
          _id: COLLECTION_ID,
          name: COLLECTION_ID,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" }, required: true },
            { db_fieldName: "email", widget: { Name: "Input" }, encrypt: true },
            { db_fieldName: "tenantId", widget: { Name: "Input" } },
          ],
        })
        .catch(() => {});
    }

    const opts = { bypassCache: true, tenantId: TEST_TENANT };
    const res = await db.crud.insert(
      COLLECTION_ID,
      {
        _id: STABLE_ID as any,
        title: "ALE smoke entry",
        email: "via-write@example.com",
        tenantId: TEST_TENANT,
      },
      opts,
    );
    console.log("[ale-smoke] insert result:", JSON.stringify(res));
  }, 600_000);
});
