/**
 * @file tests/unit/databases/postgresql-index-usage.test.ts
 * @description Pure-function coverage for the PostgreSQL index-usage reporter helpers.
 *
 * Features:
 * - Provenance rules for every IndexProvenance value
 * - `pgSafeIndexName` (NAMEDATALEN=63) truncation-form classification
 * - Report SQL shape, schema validation, observation-window SQL
 * - Summarizer counts, top-N ordering, bigint/string coercion, empty input
 *
 * No mocks and no database: `index-usage.ts` is pure by design.
 */

import { describe, expect, it } from "vitest";

import { pgSafeIndexName } from "@src/databases/postgresql/postgres-utils";
import {
  buildIndexObservationWindowSql,
  buildUnusedIndexReportSql,
  classifyProvenance,
  INDEX_PROVENANCES,
  summarizeUnusedIndexes,
  type IndexUsageRow,
} from "@src/databases/postgresql/index-usage";

describe("classifyProvenance", () => {
  it("classifies PostgreSQL primary key indexes", () => {
    expect(classifyProvenance("collection_posts_pkey", "collection_posts")).toBe("primary");
    expect(classifyProvenance("collection_posts_pkey1", "collection_posts")).toBe("primary");
  });

  it("classifies unique indexes before declared and lazy patterns", () => {
    expect(classifyProvenance("content_nodes_path_tenant_unique", "content_nodes")).toBe("unique");
    expect(classifyProvenance("legacy_posts_slug_key", "legacy_posts")).toBe("unique");
    expect(classifyProvenance("legacy_posts_slug_key2", "legacy_posts")).toBe("unique");
    expect(classifyProvenance("idx_redirects_mv_lookup", "redirects_mv")).toBe("unique");
  });

  it("classifies schema-sync declared indexes", () => {
    expect(classifyProvenance("collection_posts_title_idx", "collection_posts")).toBe("declared");
    expect(
      classifyProvenance("collection_posts_tenant_status_updated_id", "collection_posts"),
    ).toBe("declared");
    expect(classifyProvenance("collection_posts_tenant_updated_id", "collection_posts")).toBe(
      "declared",
    );
    expect(classifyProvenance("plugin_pagespeed_entry_idx", "plugin_pagespeed_results")).toBe(
      "declared",
    );
    expect(classifyProvenance("media_items_tenant_folder_updated_idx", "media_items")).toBe(
      "declared",
    );
    // Declared BRIN and legacy schema-sync twins are still declared-family.
    expect(classifyProvenance("audit_logs_timestamp_brin", "audit_logs")).toBe("declared");
    expect(
      classifyProvenance(
        "collection_commerce_addresses_tenant_updated",
        "collection_commerce_addresses",
      ),
    ).toBe("declared");
    expect(
      classifyProvenance(
        "collection_commerce_addresses_tenant_status_updated",
        "collection_commerce_addresses",
      ),
    ).toBe("declared");
  });

  it("classifies lazy expression indexes", () => {
    expect(classifyProvenance("collection_posts_views_expr_idx", "collection_posts")).toBe(
      "lazy-sort",
    );
  });

  it("classifies lazy published-list indexes", () => {
    expect(
      classifyProvenance(
        "collection_BenchmarkStable_views_o_pub_list_id",
        "collection_BenchmarkStable",
      ),
    ).toBe("lazy-published-list");
    expect(
      classifyProvenance(
        "collection_benchmark_crud_createdAt_t_list_id",
        "collection_benchmark_crud",
      ),
    ).toBe("lazy-published-list");
  });

  it("classifies GIN indexes", () => {
    expect(classifyProvenance("collection_posts_data_gin", "collection_posts")).toBe("gin");
    expect(classifyProvenance("media_items_metadata_gin", "media_items")).toBe("gin");
    // The system schema's full-text GIN ends in `_idx` — the gin rule wins.
    expect(classifyProvenance("content_nodes_fts_idx", "content_nodes")).toBe("gin");
  });

  it("returns unknown for names outside the naming contract", () => {
    expect(classifyProvenance("custom_lookup", "collection_posts")).toBe("unknown");
    expect(classifyProvenance("", "collection_posts")).toBe("unknown");
  });

  it("classifies the hashed pgSafeIndexName truncation form", () => {
    // This is the real form on the benchmark DB:
    // collection_plugin_redirectmanager_404_logs_tenant_stat_c6cfbd07
    const table = "collection_plugin_redirectmanager_404_logs";
    const raw = `${table}_tenant_status_publishedAt_id`;
    const hashed = pgSafeIndexName(raw);

    expect(raw.length).toBeGreaterThan(63);
    expect(hashed).toHaveLength(63);
    expect(hashed).not.toBe(raw);
    expect(hashed).toMatch(/_tenant_stat_[0-9a-f]{8}$/);
    expect(classifyProvenance(hashed, table)).toBe("declared");
  });

  it("does not attribute a truncated lazy name to a protected family", () => {
    // The marker (`_expr_idx`) is cut off by NAMEDATALEN, so the only safe
    // answer is `unknown` — unknown indexes are never pruned.
    const table = "collection_benchmark_stable";
    const hashed = pgSafeIndexName(`${table}_field_name_that_is_really_long_expr_idx`);

    expect(hashed).toHaveLength(63);
    expect(classifyProvenance(hashed, table)).toBe("unknown");
  });
});

describe("buildUnusedIndexReportSql", () => {
  const sql = buildUnusedIndexReportSql("public");

  it("reads pg_stat_user_indexes through pg_class and pg_index", () => {
    expect(sql).toContain("FROM pg_stat_user_indexes AS s");
    expect(sql).toContain("JOIN pg_class AS c");
    expect(sql).toContain("JOIN pg_index AS i");
    expect(sql).toContain("pg_relation_size(s.indexrelid) AS index_size_bytes");
    expect(sql).toContain("s.idx_scan");
  });

  it("restricts to the requested non-system schema", () => {
    expect(sql).toContain("s.schemaname = 'public'");
    expect(sql).toContain("s.schemaname NOT IN ('pg_catalog', 'information_schema')");
    expect(buildUnusedIndexReportSql("tenant_a")).toContain("s.schemaname = 'tenant_a'");
  });

  it("excludes primary and unique indexes structurally", () => {
    expect(sql).toContain("i.indisprimary = false");
    expect(sql).toContain("i.indisunique = false");
  });

  it("orders largest first deterministically", () => {
    expect(sql).toContain("ORDER BY pg_relation_size(s.indexrelid) DESC, s.indexrelname ASC");
  });

  it("rejects unsafe schema identifiers", () => {
    expect(() => buildUnusedIndexReportSql("public; DROP TABLE x")).toThrow(
      /Invalid SQL identifier for schema/,
    );
  });
});

describe("buildIndexObservationWindowSql", () => {
  const sql = buildIndexObservationWindowSql();

  it("derives the window from stats_reset with a postmaster-start fallback", () => {
    expect(sql).toContain("FROM pg_stat_database AS d");
    expect(sql).toContain("COALESCE(d.stats_reset, pg_postmaster_start_time())");
    expect(sql).toContain("AS observation_seconds");
    expect(sql).toContain("WHERE d.datname = current_database()");
  });
});

describe("summarizeUnusedIndexes", () => {
  it("returns zeroed counts and an empty top list for empty input", () => {
    const summary = summarizeUnusedIndexes([]);

    expect(summary.totalIndexes).toBe(0);
    expect(summary.unusedIndexes).toBe(0);
    expect(summary.unusedBytes).toBe(0);
    expect(summary.topUnusedBySize).toEqual([]);
    expect(summary.prunable).toEqual([]);
    expect(summary.prunableIndexes).toBe(0);
    expect(summary.prunableBytes).toBe(0);
    for (const provenance of INDEX_PROVENANCES) {
      expect(summary.countsByProvenance[provenance]).toEqual({
        total: 0,
        unused: 0,
        unusedBytes: 0,
      });
    }
  });

  it("counts by provenance and orders the top N by size", () => {
    const rows: IndexUsageRow[] = [
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_title_idx",
        idx_scan: 0,
        index_size_bytes: 4096,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_views_expr_idx",
        idx_scan: "0",
        index_size_bytes: "8192",
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_slug_t_pub_list_id",
        idx_scan: 0,
        index_size_bytes: 16_384n,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_data_gin",
        idx_scan: 0,
        index_size_bytes: 32_768,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_views_idx",
        idx_scan: "42",
        index_size_bytes: 65_536,
      },
    ];

    const summary = summarizeUnusedIndexes(rows, { topN: 2 });

    expect(summary.totalIndexes).toBe(5);
    expect(summary.unusedIndexes).toBe(4);
    expect(summary.unusedBytes).toBe(4096 + 8192 + 16_384 + 32_768);
    expect(summary.topUnusedBySize.map((entry) => entry.index)).toEqual([
      "collection_posts_data_gin",
      "collection_posts_slug_t_pub_list_id",
    ]);
    expect(summary.topUnusedBySize.map((entry) => entry.provenance)).toEqual([
      "gin",
      "lazy-published-list",
    ]);
    expect(summary.countsByProvenance.declared).toEqual({
      total: 2,
      unused: 1,
      unusedBytes: 4096,
    });
    expect(summary.countsByProvenance.gin).toEqual({
      total: 1,
      unused: 1,
      unusedBytes: 32_768,
    });
    expect(summary.countsByProvenance["lazy-sort"]).toEqual({
      total: 1,
      unused: 1,
      unusedBytes: 8192,
    });
  });

  it("marks only lazy provenances prunable, largest first", () => {
    const rows: IndexUsageRow[] = [
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_title_idx",
        idx_scan: 0,
        index_size_bytes: 100,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_data_gin",
        idx_scan: 0,
        index_size_bytes: 200,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_views_expr_idx",
        idx_scan: 0,
        index_size_bytes: 300,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_slug_o_pub_list_id",
        idx_scan: 0,
        index_size_bytes: 400,
      },
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_pkey",
        idx_scan: 0,
        index_size_bytes: 500,
      },
    ];

    const summary = summarizeUnusedIndexes(rows);

    expect(summary.prunable.map((entry) => entry.index)).toEqual([
      "collection_posts_slug_o_pub_list_id",
      "collection_posts_views_expr_idx",
    ]);
    expect(summary.prunableIndexes).toBe(2);
    expect(summary.prunableBytes).toBe(700);
  });

  it("clamps topN and treats null counters as unused/zero-size", () => {
    const rows: IndexUsageRow[] = [
      {
        schemaname: "public",
        relname: "collection_posts",
        indexrelname: "collection_posts_title_idx",
        idx_scan: null,
        index_size_bytes: null,
      },
    ];

    const summary = summarizeUnusedIndexes(rows, { topN: 0 });

    expect(summary.unusedIndexes).toBe(1);
    expect(summary.topUnusedBySize).toEqual([]);
    expect(summary.countsByProvenance.declared).toEqual({
      total: 1,
      unused: 1,
      unusedBytes: 0,
    });
  });
});
