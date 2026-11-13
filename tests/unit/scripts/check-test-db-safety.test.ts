/**
 * @file tests/unit/scripts/check-test-db-safety.test.ts
 * @description Pins the pre-commit live-config debris filters.
 *
 * These filters decide what may never appear inside the developer's live
 * `config/collections`, `.compiledCollections` and `config/database` roots. The
 * DB-name classifier itself is covered by `tests/unit/utils/test-db-safety`;
 * here we prove the three directory scans use it against the right file shapes
 * (including `-wal` / `-shm` sidecars and non-database journals).
 */

import { describe, expect, it } from "vitest";
import {
  findLeakedCollectionArtifacts,
  findLeakedCompiledArtifacts,
  findLeakedDatabaseArtifacts,
} from "../../../scripts/check/check-test-db-safety";

describe("findLeakedCollectionArtifacts", () => {
  it("accepts live collection schemas", () => {
    expect(findLeakedCollectionArtifacts(["pages.ts", "posts.ts", "index.ts"])).toEqual([]);
  });

  it("flags test and benchmark prefixes, case-insensitively", () => {
    const leaked = findLeakedCollectionArtifacts([
      "mock_collection_users.ts",
      "bench_pages.ts",
      "benchmark_posts.ts",
      "BENCHMARK_Orders.ts",
      "pages.ts",
    ]);

    expect(leaked).toEqual([
      "mock_collection_users.ts",
      "bench_pages.ts",
      "benchmark_posts.ts",
      "BENCHMARK_Orders.ts",
    ]);
  });

  it("requires the underscore separator", () => {
    expect(findLeakedCollectionArtifacts(["benchmarkish.ts", "benches.ts"])).toEqual([]);
  });
});

describe("findLeakedCompiledArtifacts", () => {
  it("flags compiled test artifacts including the loader-test probe", () => {
    const leaked = findLeakedCompiledArtifacts([
      "pages.json",
      "bench_pages.json",
      "mock_collection_posts.json",
      ".loader-test-abc123",
    ]);

    expect(leaked).toEqual([
      "bench_pages.json",
      "mock_collection_posts.json",
      ".loader-test-abc123",
    ]);
  });
});

describe("findLeakedDatabaseArtifacts", () => {
  it("flags isolated test DB files and their WAL/SHM sidecars", () => {
    const leaked = findLeakedDatabaseArtifacts([
      "sveltycms.db",
      "benchmark_shared.sqlite",
      "sveltycms_test.db-wal",
      "benchmark_shared.sqlite-shm",
      "e2e_auth_test.sqlite",
      "pages.txt",
    ]);

    expect(leaked).toEqual([
      "benchmark_shared.sqlite",
      "sveltycms_test.db-wal",
      "benchmark_shared.sqlite-shm",
    ]);
  });

  it("is case-insensitive about the extension", () => {
    expect(findLeakedDatabaseArtifacts(["sveltycms_test.SQLITE"])).toEqual([
      "sveltycms_test.SQLITE",
    ]);
  });

  it("ignores non-database sidecars such as a rollback journal", () => {
    expect(findLeakedDatabaseArtifacts(["benchmark_shared.sqlite-journal"])).toEqual([]);
  });

  it("ignores isolated names that are safe for a live developer config", () => {
    expect(findLeakedDatabaseArtifacts(["e2e_auth_test.db", "mydb.sqlite"])).toEqual([]);
  });
});
