/**
 * @file tests/unit/databases/system-schema-sqlite-bootstrap.test.ts
 * @description Bootstraps the SQLite system schema against `node:sqlite` and
 * exercises the content_nodes FTS5 mirror end to end: provisioning, the
 * insert/update/delete trigger sync, and the rowid keying that keeps trigger
 * deletes an index probe instead of a scan over the UNINDEXED `_id` column.
 *
 * ### Features:
 * - full bootstrap into an in-memory database (fresh DB runs the DDL pass)
 * - FTS mirror content asserted against the live content_nodes rows
 * - trigger DDL asserted to key on rowid, never on the UNINDEXED `_id`
 */

import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { bootstrapSystemSchema } from "@src/databases/core/system-schema-bootstrap";
import { SYSTEM_SCHEMA, type RawSqlSpec } from "@src/databases/system-schema-spec";

type IdRow = { _id: string };
type RowidRow = { ftsRowid: number; sourceRowid: number };

function insertNode(db: DatabaseSync, id: string, path: string, name: string, data: string): void {
  db.prepare(
    `INSERT INTO "content_nodes" ("_id", "path", "nodeType", "name", "description", "data")
     VALUES (?, ?, 'page', ?, '', ?)`,
  ).run(id, path, name, data);
}

function sourceIds(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT "_id" FROM "content_nodes" ORDER BY "_id"`).all() as IdRow[]).map(
    (row) => row._id,
  );
}

function ftsIds(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT "_id" FROM "content_nodes_fts" ORDER BY "_id"`).all() as IdRow[]).map(
    (row) => row._id,
  );
}

function ftsMatches(db: DatabaseSync, token: string): string[] {
  return (
    db
      .prepare(`SELECT "_id" FROM "content_nodes_fts" WHERE "content_nodes_fts" MATCH ?`)
      .all(token) as IdRow[]
  ).map((row) => row._id);
}

/** The raw SQLite block that owns the FTS5 mirror, straight from the schema spec. */
function ftsDdl(): string {
  const entry = SYSTEM_SCHEMA.find(
    (item): item is RawSqlSpec =>
      item.kind === "raw" &&
      (item.sql?.sqlite ?? []).some((statement) => statement.includes(`"content_nodes_fts"`)),
  );
  if (!entry) throw new Error("SQLite FTS5 raw spec block not found in SYSTEM_SCHEMA");
  return (entry.sql?.sqlite ?? []).join("\n");
}

describe("node:sqlite bootstrap", () => {
  it("adds collectionId to an existing content_drafts table", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE content_drafts (
      _id TEXT PRIMARY KEY,
      contentId TEXT NOT NULL,
      data TEXT NOT NULL,
      version INTEGER,
      status TEXT,
      authorId TEXT NOT NULL,
      tenantId TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`);

    await bootstrapSystemSchema("sqlite", db);

    const cols = (
      db.prepare("PRAGMA table_info(content_drafts)").all() as Array<{ name: string }>
    ).map((r) => r.name);
    expect(cols).toContain("collectionId");
    const indexes = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='content_drafts'")
        .all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(indexes).toContain("content_drafts_tenant_collection_author_idx");
  });
});

describe("SQLite content_nodes FTS mirror", () => {
  it("keys trigger deletes on rowid and follows insert/update/delete", async () => {
    const db = new DatabaseSync(":memory:");

    // Fresh database: the fingerprint has no marker yet, so the DDL pass runs
    // (including the FTS table + triggers + backfill).
    const boot = await bootstrapSystemSchema("sqlite", db);
    expect(boot.success).toBe(true);
    expect(boot.skipped ?? false).toBe(false);
    expect(boot.failures ?? 0).toBe(0);

    insertNode(db, "node-a", "/blog/a", "alpha page", JSON.stringify({ body: "alpha payload" }));
    insertNode(
      db,
      "node-b",
      "/blog/b",
      "stale token page",
      JSON.stringify({ body: "stale payload" }),
    );
    insertNode(
      db,
      "node-c",
      "/blog/c",
      "charlie page",
      JSON.stringify({ body: "charlie payload" }),
    );

    // The insert trigger mirrored every row.
    expect(ftsIds(db)).toEqual(["node-a", "node-b", "node-c"]);

    // Update: the mirror must show the new tokens, not the old ones.
    db.prepare(`UPDATE "content_nodes" SET "name" = ?, "data" = ? WHERE "_id" = ?`).run(
      "fresh token page",
      JSON.stringify({ body: "fresh payload" }),
      "node-b",
    );
    // Delete: the mirror row must go with the source row.
    db.prepare(`DELETE FROM "content_nodes" WHERE "_id" = ?`).run("node-c");

    // Exactly the live _ids remain, keyed by the source row's rowid.
    expect(ftsIds(db)).toEqual(sourceIds(db));
    expect(ftsIds(db)).toEqual(["node-a", "node-b"]);
    const rowids = db
      .prepare(
        `SELECT f."rowid" AS ftsRowid, c."rowid" AS sourceRowid
         FROM "content_nodes_fts" f
         JOIN "content_nodes" c ON c."_id" = f."_id"`,
      )
      .all() as RowidRow[];
    expect(rowids).toHaveLength(2);
    for (const row of rowids) {
      expect(Number(row.ftsRowid)).toBe(Number(row.sourceRowid));
    }

    expect(ftsMatches(db, "fresh")).toEqual(["node-b"]);
    expect(ftsMatches(db, "stale")).toEqual([]);
    expect(ftsMatches(db, "charlie")).toEqual([]);
  });

  it("renders trigger deletes against rowid, never the UNINDEXED _id column", () => {
    const ddl = ftsDdl();

    expect(ddl).toContain(`"_id" UNINDEXED`);
    expect(ddl).toMatch(/"_id" UNINDEXED,\s*"name",\s*"description",\s*"data"\s*\);/);
    expect(ddl).toContain(
      `INSERT INTO "content_nodes_fts"("rowid", "_id", "name", "description", "data")`,
    );
    expect(ddl).toContain(
      `SELECT rowid, "_id", COALESCE("name", ''), COALESCE("description", ''), COALESCE("data", '')`,
    );
    expect(ddl).toContain(`WHERE "rowid" = old.rowid`);
    expect(ddl).not.toContain(`WHERE "_id" = old._id`);
    // One delete for AFTER DELETE, one for the delete half of AFTER UPDATE.
    expect((ddl.match(/WHERE "rowid" = old\.rowid/g) ?? []).length).toBe(2);
  });
});
