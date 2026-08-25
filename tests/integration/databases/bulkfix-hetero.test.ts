import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";

const C = "bulkfix_test";
let db: any;

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb();
  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: C,
        name: C,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }
  await db.crud.deleteMany(C, {}, { bypassTenantCheck: true, permanent: true }).catch(() => {});
}, 30000);

afterAll(async () => {
  await db?.crud?.deleteMany(C, {}, { bypassTenantCheck: true, permanent: true }).catch(() => {});
}, 15000);

function uid(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("bulkUpdate heterogener N+1-Fix (echter SQLite-Pfad)", () => {
  it("gruppiert heterogene Updates nach identischem Payload und setzt korrekt", async () => {
    const ids = [uid("a"), uid("b"), uid("c"), uid("d")];
    const ins = await db.crud.insertMany(
      C,
      ids.map((id, i) => ({
        _id: id,
        title: `T${i}`,
        status: "old",
        tenantId: "tenantX",
      })),
      { tenantId: "tenantX" },
    );
    expect(ins.success).toBe(true);

    // a,b -> active ; c,d -> draft  → 2 Gruppen statt 4 Statements
    const res = await db.batch.bulkUpdate(C, [
      { id: ids[0], data: { status: "active" } },
      { id: ids[1], data: { status: "active" } },
      { id: ids[2], data: { status: "draft" } },
      { id: ids[3], data: { status: "draft" } },
    ]);
    expect(res.success).toBe(true);

    for (const [i, id] of ids.entries()) {
      const row = await db.crud.findById(C, id);
      expect(row?.data?.status).toBe(i < 2 ? "active" : "draft");
    }
  });

  it("single-item heterogene Payload (eine Gruppe) wird korrekt gesetzt", async () => {
    const id = uid("e");
    await db.crud.insertMany(C, [{ _id: id, title: "E", status: "x", tenantId: "tenantX" }], {
      tenantId: "tenantX",
    });
    const res = await db.batch.bulkUpdate(C, [{ id, data: { status: "published" } }]);
    expect(res.success).toBe(true);
    const row = await db.crud.findById(C, id);
    expect(row?.data?.status).toBe("published");
  });
}, 30000);
