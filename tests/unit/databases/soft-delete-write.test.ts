/**
 * @file tests/unit/databases/soft-delete-write.test.ts
 * @description Verifies the SQL soft delete persists the delete audit pair.
 *
 * Regression (N3): `crud.delete`/`crud.deleteMany` only flipped `isDeleted` and
 * stamped `updatedAt`, so the trash showed "Deleted by: System". Mongo has always
 * written `deletedAt`/`deletedBy`; this suite pins the relational parity on a real
 * in-memory SQLite adapter (the same harness as soft-delete-clamp.test.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { BaseEntity, DatabaseId, ISODateString } from "@src/databases/db-interface";
import { generateUUID } from "@src/utils/native-utils";

type Row = BaseEntity & {
  title: string;
  status: string;
  tenantId?: DatabaseId | null;
  deletedAt?: ISODateString | null;
  deletedBy?: DatabaseId | null;
};

const COLLECTION = "soft_delete_audit";
const TENANT = "audit-tenant" as DatabaseId;
const ACTOR = "user-42" as DatabaseId;

const tenantOpts = () => ({ tenantId: TENANT }) as never;

describe("SQL soft delete persists deletedAt/deletedBy", () => {
  let adapter: SQLiteAdapter;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    await adapter.createModel({
      _id: COLLECTION,
      name: COLLECTION,
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, required: true },
        { db_fieldName: "status", widget: { Name: "Input" } },
      ],
    });
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  async function insert(title: string): Promise<DatabaseId> {
    const id = generateUUID();
    const res = await adapter.crud.insert(
      COLLECTION,
      { _id: id, title, status: "published", tenantId: TENANT } as unknown as Row,
      tenantOpts(),
    );
    expect(res.success).toBe(true);
    return id as DatabaseId;
  }

  /** The trash read path: `{ isDeleted: true }` + `includeDeleted`. */
  async function readDeleted(title: string): Promise<Row | undefined> {
    const res = await adapter.crud.findMany<Row>(
      COLLECTION,
      { isDeleted: true, title } as never,
      { ...(tenantOpts() as object), includeDeleted: true } as never,
    );
    expect(res.success).toBe(true);
    return res.success ? res.data[0] : undefined;
  }

  it("writes the acting user and an ISO timestamp on a single soft delete", async () => {
    const title = `single-${generateUUID()}`;
    const id = await insert(title);

    const del = await adapter.crud.delete(COLLECTION, id, {
      tenantId: TENANT,
      userId: ACTOR,
    } as never);
    expect(del.success).toBe(true);

    const row = await readDeleted(title);
    expect(row?._id).toBe(id);
    expect(row?.deletedBy).toBe(ACTOR);
    // `nowISODateString()` → ISO string after the adapter's date conversion.
    expect(row?.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("writes the acting user and an ISO timestamp on a bulk soft delete", async () => {
    const tag = generateUUID();
    const titles = [`bulk-a-${tag}`, `bulk-b-${tag}`];
    await insert(titles[0]);
    await insert(titles[1]);

    const del = await adapter.crud.deleteMany(
      COLLECTION,
      { title: { $in: titles } } as never,
      { tenantId: TENANT, userId: ACTOR } as never,
    );
    expect(del.success).toBe(true);

    for (const title of titles) {
      const row = await readDeleted(title);
      expect(row?.deletedBy).toBe(ACTOR);
      expect(row?.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("omits deletedBy when the caller has no actor but still stamps deletedAt", async () => {
    const title = `system-${generateUUID()}`;
    const id = await insert(title);

    const del = await adapter.crud.delete(COLLECTION, id, { tenantId: TENANT } as never);
    expect(del.success).toBe(true);

    const row = await readDeleted(title);
    expect(row?.deletedAt).toBeTruthy();
    expect(row?.deletedBy ?? null).toBeNull();
  });

  it("clears the audit pair on restore so a later delete cannot report the old actor", async () => {
    const title = `restore-${generateUUID()}`;
    const id = await insert(title);
    await adapter.crud.delete(COLLECTION, id, { tenantId: TENANT, userId: ACTOR } as never);

    const restored = await adapter.crud.restore(COLLECTION, id, { tenantId: TENANT } as never);
    expect(restored.success).toBe(true);

    const live = await adapter.crud.findMany<Row>(COLLECTION, { title } as never, tenantOpts());
    expect(live.success).toBe(true);
    if (!live.success) return;
    expect(live.data[0]?._id).toBe(id);
    expect(live.data[0]?.deletedAt ?? null).toBeNull();
    expect(live.data[0]?.deletedBy ?? null).toBeNull();
  });
});
