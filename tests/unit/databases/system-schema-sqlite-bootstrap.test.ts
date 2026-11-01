/**
 * @file tests/unit/databases/zz-bootstrap-sqlite.test.ts
 * @description Temporary node:sqlite bootstrap probe.
 */

import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { bootstrapSystemSchema } from "@src/databases/core/system-schema-bootstrap";

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
