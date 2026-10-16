/**
 * @file tests/unit/databases/soft-delete-clamp.test.ts
 * @description Verifies the SQL soft-delete boundary on every read path.
 *
 * A `delete()` without `permanent: true` only flips `isDeleted`; the Mongo CRUD
 * layer has always hidden those rows via `safeQuery`, but the SQL adapters only
 * clamped `findById`. This suite pins the clamp for the list/aggregate reads
 * (`findMany`, `findOne`, `count`, `exists`, `findByIds`, `findPage`) plus the
 * documented opt-ins (`includeDeleted`, `bypassSafeQuery`, explicit `isDeleted`).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { BaseEntity, DatabaseId } from "@src/databases/db-interface";
import { generateUUID } from "@src/utils/native-utils";

interface Row extends BaseEntity {
  title: string;
  status: string;
  tenantId?: DatabaseId | null;
}

const COLLECTION = "soft_delete_clamp";
const TENANT = "clamp-tenant" as DatabaseId;

const tenantOpts = () => ({ tenantId: TENANT }) as never;

describe("SQL soft-delete clamp across read paths", () => {
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

  /**
   * Insert one live + one soft-deleted row under a unique tag so every test is
   * isolated from the rows other tests left in the shared in-memory database.
   */
  async function seed() {
    const tag = generateUUID();
    const liveId = generateUUID();
    const deadId = generateUUID();
    const liveTitle = `live-${tag}`;
    const deadTitle = `dead-${tag}`;
    await adapter.crud.insert(
      COLLECTION,
      { _id: liveId, title: liveTitle, status: "published", tenantId: TENANT } as unknown as Row,
      tenantOpts(),
    );
    await adapter.crud.insert(
      COLLECTION,
      { _id: deadId, title: deadTitle, status: "published", tenantId: TENANT } as unknown as Row,
      tenantOpts(),
    );
    const del = await adapter.crud.delete(COLLECTION, deadId as DatabaseId, tenantOpts());
    expect(del.success).toBe(true);
    return { liveId, deadId, liveTitle, deadTitle };
  }

  it("hides soft-deleted rows from findMany/findByIds/findPage", async () => {
    const { liveId, deadId, liveTitle, deadTitle } = await seed();

    const many = await adapter.crud.findMany<Row>(
      COLLECTION,
      { _id: { $in: [liveId, deadId] } } as never,
      tenantOpts(),
    );
    expect(many.success).toBe(true);
    if (!many.success) return;
    expect(many.data.map((r) => r._id)).toEqual([liveId]);

    const byIds = await adapter.crud.findByIds<Row>(
      COLLECTION,
      [liveId, deadId] as DatabaseId[],
      tenantOpts(),
    );
    expect(byIds.success).toBe(true);
    if (!byIds.success) return;
    expect(byIds.data.map((r) => r._id)).toEqual([liveId]);

    const page = await adapter.crud.findPage<Row>(
      COLLECTION,
      { title: { $in: [liveTitle, deadTitle] } } as never,
      { ...(tenantOpts() as object), limit: 10, total: "exact" } as never,
    );
    expect(page.success).toBe(true);
    if (!page.success) return;
    expect(page.data.items.map((r) => r._id)).toEqual([liveId]);
    expect(page.data.total).toBe(1);
  });

  it("hides soft-deleted rows from findOne/count/exists", async () => {
    const { liveId, liveTitle, deadTitle } = await seed();
    const both = { title: { $in: [liveTitle, deadTitle] } };

    const one = await adapter.crud.findOne<Row>(COLLECTION, both as never, tenantOpts());
    expect(one.success).toBe(true);
    if (!one.success) return;
    expect(one.data?._id).toBe(liveId);

    const count = await adapter.crud.count(
      COLLECTION,
      both as never,
      {
        ...(tenantOpts() as object),
        mode: "exact",
      } as never,
    );
    expect(count.success).toBe(true);
    if (count.success) expect(count.data).toBe(1);

    // A query that only the deleted row satisfies must report absence.
    const deadOnly = await adapter.crud.exists(
      COLLECTION,
      { title: deadTitle } as never,
      tenantOpts(),
    );
    expect(deadOnly.success).toBe(true);
    if (deadOnly.success) expect(deadOnly.data).toBe(false);
  });

  it("honors includeDeleted / bypassSafeQuery opt-ins and explicit isDeleted filters", async () => {
    const { liveId, deadId, liveTitle, deadTitle } = await seed();
    const both = { title: { $in: [liveTitle, deadTitle] } };
    const idsOf = (res: { success: boolean; data?: Row[] }) =>
      (res.success ? (res.data ?? []) : []).map((r) => r._id).sort();

    const included = await adapter.crud.findMany<Row>(
      COLLECTION,
      both as never,
      {
        ...(tenantOpts() as object),
        includeDeleted: true,
      } as never,
    );
    expect(idsOf(included)).toEqual([liveId, deadId].sort());

    const bypassed = await adapter.crud.findMany<Row>(
      COLLECTION,
      both as never,
      {
        ...(tenantOpts() as object),
        bypassSafeQuery: true,
      } as never,
    );
    expect(idsOf(bypassed)).toEqual([liveId, deadId].sort());

    // The trash view queries the deleted set explicitly — the clamp must not
    // override an explicit `isDeleted` predicate.
    const trash = await adapter.crud.findMany<Row>(
      COLLECTION,
      { isDeleted: true, title: deadTitle } as never,
      { ...(tenantOpts() as object), includeDeleted: true } as never,
    );
    expect(idsOf(trash)).toEqual([deadId]);
  });
});
