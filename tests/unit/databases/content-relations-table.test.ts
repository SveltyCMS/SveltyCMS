/**
 * @file tests/unit/databases/content-relations-table.test.ts
 * @description The `content_relations` junction table actually provisions on
 * SQLite from the shared `SYSTEM_SCHEMA` spec, with the unique edge constraint
 * and both lookup indexes the relation-link service depends on.
 *
 * PostgreSQL/MariaDB/MongoDB share the same spec (Drizzle parity is pinned by
 * `schema-spec-parity.test.ts`); this test proves the SQLite DDL end to end.
 */
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { bootstrapSystemSchema } from "@src/databases/core/system-schema-bootstrap";

function columns(db: DatabaseSync): string[] {
  return (
    db.prepare(`PRAGMA table_info("content_relations")`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function indexes(db: DatabaseSync): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='content_relations'`)
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function insertEdge(
  db: DatabaseSync,
  id: string,
  sourceId: string,
  targetId: string,
  sortOrder = 0,
): void {
  db.prepare(
    `INSERT INTO "content_relations"
       ("_id", "tenantId", "sourceCollection", "sourceId", "fieldName", "targetCollection", "targetId", "sortOrder", "metadata")
     VALUES (?, 'tenant-1', 'posts', ?, 'tags', 'tags', ?, ?, NULL)`,
  ).run(id, sourceId, targetId, sortOrder);
}

describe("content_relations junction table (SQLite)", () => {
  it("provisions every column, the unique edge index and both lookup indexes", async () => {
    const db = new DatabaseSync(":memory:");
    const boot = await bootstrapSystemSchema("sqlite", db);
    expect(boot.success).toBe(true);
    expect(boot.failures ?? 0).toBe(0);

    expect(columns(db)).toEqual(
      expect.arrayContaining([
        "_id",
        "tenantId",
        "sourceCollection",
        "sourceId",
        "fieldName",
        "targetCollection",
        "targetId",
        "sortOrder",
        "metadata",
        "createdAt",
        "updatedAt",
      ]),
    );

    const names = indexes(db);
    expect(names).toContain("content_relations_unique");
    expect(names).toContain("idx_content_relations_source");
    expect(names).toContain("idx_content_relations_target");
  });

  it("stores edges, enforces the unique edge, and serves both lookup directions", async () => {
    const db = new DatabaseSync(":memory:");
    await bootstrapSystemSchema("sqlite", db);

    insertEdge(db, "edge-1", "post-1", "tag-a", 0);
    insertEdge(db, "edge-2", "post-1", "tag-b", 1);
    insertEdge(db, "edge-3", "post-2", "tag-a", 0);

    // Defaults: sortOrder = 0, timestamps populated.
    const defaults = db
      .prepare(
        `SELECT "sortOrder", "createdAt", "updatedAt" FROM "content_relations" WHERE "_id" = 'edge-3'`,
      )
      .get() as { sortOrder: number; createdAt: string; updatedAt: string };
    expect(defaults.sortOrder).toBe(0);
    expect(defaults.createdAt).toBeTruthy();
    expect(defaults.updatedAt).toBeTruthy();

    // Forward read: every edge of one source, ordered.
    const forward = (
      db
        .prepare(
          `SELECT "targetId" FROM "content_relations" WHERE "sourceId" = 'post-1' ORDER BY "sortOrder"`,
        )
        .all() as Array<{ targetId: string }>
    ).map((row) => row.targetId);
    expect(forward).toEqual(["tag-a", "tag-b"]);

    // Reverse read: every source that links to one target.
    const reverse = (
      db
        .prepare(
          `SELECT "sourceId" FROM "content_relations" WHERE "targetId" = 'tag-a' ORDER BY "sourceId"`,
        )
        .all() as Array<{ sourceId: string }>
    ).map((row) => row.sourceId);
    expect(reverse).toEqual(["post-1", "post-2"]);

    // The unique edge constraint rejects the same (tenant, source, field, target).
    expect(() => insertEdge(db, "edge-dup", "post-1", "tag-a")).toThrow();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM "content_relations"`).get() as { n: number }).n,
    ).toBe(3);
  });

  it("cascades rows on delete (source and target sides)", async () => {
    const db = new DatabaseSync(":memory:");
    await bootstrapSystemSchema("sqlite", db);
    insertEdge(db, "edge-1", "post-1", "tag-a");
    insertEdge(db, "edge-2", "post-2", "tag-a");

    db.prepare(`DELETE FROM "content_relations" WHERE "sourceId" = 'post-1'`).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM "content_relations"`).get() as { n: number }).n,
    ).toBe(1);

    db.prepare(`DELETE FROM "content_relations" WHERE "targetId" = 'tag-a'`).run();
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM "content_relations"`).get() as { n: number }).n,
    ).toBe(0);
  });
});
