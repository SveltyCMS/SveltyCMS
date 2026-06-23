import { describe, expect, it } from "vitest";

const isBun = typeof Bun !== "undefined";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  collectionTableToId,
  isStaleCollectionContentNode,
  purgeBenchmarkDatabaseArtifacts,
  resolveBenchmarkDbScope,
  shouldPurgeDatabaseCollection,
} from "@utils/benchmark-db-purge";

describe("benchmark-db-purge", () => {
  it("resolves database purge scopes", () => {
    expect(resolveBenchmarkDbScope("sveltycms.db")).toBe("user");
    expect(resolveBenchmarkDbScope("benchmark_shared.sqlite")).toBe(
      "benchmark-shared",
    );
    expect(resolveBenchmarkDbScope("bench_tmp_sqlite_123.sqlite")).toBe(
      "test-ephemeral",
    );
    expect(
      resolveBenchmarkDbScope("SveltyCMS_healing_test_sqlite.sqlite"),
    ).toBe("test-ephemeral");
  });

  it("detects stale collection tables by scope", () => {
    expect(shouldPurgeDatabaseCollection("mockcollection42", "user")).toBe(
      true,
    );
    expect(shouldPurgeDatabaseCollection("mock_collection_1", "user")).toBe(
      true,
    );
    expect(shouldPurgeDatabaseCollection("BenchmarkStable", "user")).toBe(true);
    expect(shouldPurgeDatabaseCollection("posts", "user")).toBe(false);

    expect(
      shouldPurgeDatabaseCollection("mockcollection42", "benchmark-shared"),
    ).toBe(true);
    expect(
      shouldPurgeDatabaseCollection("BenchmarkStable", "benchmark-shared"),
    ).toBe(false);
    expect(shouldPurgeDatabaseCollection("benchacid", "benchmark-shared")).toBe(
      true,
    );
    expect(shouldPurgeDatabaseCollection("benchacid", "test-ephemeral")).toBe(
      true,
    );
  });

  it("maps collection table names to ids", () => {
    expect(collectionTableToId("collection_mockcollection0")).toBe(
      "mockcollection0",
    );
    expect(collectionTableToId("collection_posts")).toBe("posts");
  });

  it("detects stale content_nodes paths", () => {
    expect(
      isStaleCollectionContentNode(
        "/collection/mock collection 0",
        "mock collection 0",
        "user",
      ),
    ).toBe(true);
    expect(
      isStaleCollectionContentNode("/collection/posts", "posts", "user"),
    ).toBe(false);
  });

  it("purges mock tables and nodes from a temp sqlite database", async () => {
    if (!isBun) return; // bun:sqlite is Bun-only
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-db-purge-"));
    const dbPath = path.join(tmpDir, "sveltycms.db");

    const { Database } = await import("bun:sqlite");
    db.exec(`CREATE TABLE collection_posts (data TEXT)`);
    db.exec(`CREATE TABLE collection_mockcollection0 (data TEXT)`);
    db.exec(`CREATE TABLE collection_BenchmarkStable (data TEXT)`);
    db.exec(`CREATE TABLE content_nodes (path TEXT, slug TEXT, nodeType TEXT)`);
    db.exec(
      `INSERT INTO content_nodes VALUES ('/collection/posts', 'posts', 'collection'), ('/collection/mock collection 0', 'mock collection 0', 'collection'), ('/collection/benchmarkstable', 'benchmarkstable', 'collection')`,
    );
    db.close();

    const result = await purgeBenchmarkDatabaseArtifacts({ dbPaths: [dbPath] });
    expect(result.tablesDropped).toBe(2);
    expect(result.nodesDeleted).toBe(2);

    const verify = new Database(dbPath, { readonly: true });
    const tables = verify
      .query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'`,
      )
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(["collection_posts"]);
    const nodes = verify
      .query(`SELECT path FROM content_nodes WHERE nodeType='collection'`)
      .all() as { path: string }[];
    expect(nodes.map((n) => n.path)).toEqual(["/collection/posts"]);
    verify.close();

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
});
