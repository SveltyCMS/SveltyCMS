/**
 * @file tests/unit/databases/postgresql-pg19-features.test.ts
 * @description Unit tests for PostgreSQL 19.0 native capability helpers, version gating,
 * online `REPACK (CONCURRENTLY)`, standby `WAIT FOR LSN`, bloat detection, and collection warmup.
 */

import { describe, it, expect, vi } from "vitest";
import {
  PG19_MAJOR_VERSION,
  PG_MIN_SUPPORTED_MAJOR_VERSION,
  PG_MIN_SUPPORTED_VERSION_NUM,
  buildBloatCandidatesSql,
  buildInsertOnConflictDoSelectSql,
  buildRepackTableSql,
  buildWaitForLsnSql,
  isValidPgLsn,
  parsePgMajorVersion,
} from "@src/databases/postgresql/pg19-features";
import { PostgreSQLAdapter } from "@src/databases/postgresql/postgres-adapter";
import { warmPgCollectionStatements } from "@src/databases/postgresql/statement-warmup";

describe("PostgreSQL 19 feature helpers", () => {
  it("parses major versions from server_version_num and version() banners", () => {
    expect(PG_MIN_SUPPORTED_MAJOR_VERSION).toBe(18);
    expect(PG_MIN_SUPPORTED_VERSION_NUM).toBe(180_000);
    expect(PG19_MAJOR_VERSION).toBe(19);
    expect(parsePgMajorVersion(190000)).toBe(19);
    expect(parsePgMajorVersion(180007)).toBe(18);
    expect(parsePgMajorVersion("190001")).toBe(19);
    expect(parsePgMajorVersion("PostgreSQL 19.0 (Debian 19.0-1.pgdg13+1) on x86_64")).toBe(19);
    expect(parsePgMajorVersion("PostgreSQL 18.7 on x86_64-pc-linux-gnu")).toBe(18);
    expect(parsePgMajorVersion("17.4")).toBe(17);
    expect(parsePgMajorVersion(0)).toBe(0);
    expect(parsePgMajorVersion("")).toBe(0);
    expect(parsePgMajorVersion(null)).toBe(0);
  });

  it("validates PostgreSQL WAL LSNs strictly and builds WAIT FOR LSN SQL", () => {
    expect(isValidPgLsn("0/16B3748")).toBe(true);
    expect(isValidPgLsn("1A/FFFFFFFF")).toBe(true);
    expect(isValidPgLsn("0/16B3748; DROP TABLE users;--")).toBe(false);
    expect(isValidPgLsn("not-an-lsn")).toBe(false);
    expect(isValidPgLsn("")).toBe(false);

    expect(buildWaitForLsnSql("0/16B3748", 1500)).toBe(
      "WAIT FOR LSN '0/16B3748' WITH (TIMEOUT '1500ms', NO_THROW)",
    );
    expect(buildWaitForLsnSql("0/16B3748", 999_999)).toBe(
      "WAIT FOR LSN '0/16B3748' WITH (TIMEOUT '60000ms', NO_THROW)",
    );
    expect(buildWaitForLsnSql("0/16B3748", 1500, false)).toBe(
      "WAIT FOR LSN '0/16B3748' WITH (TIMEOUT '1500ms')",
    );
    expect(() => buildWaitForLsnSql("0/1'; DROP TABLE x;--", 500)).toThrow(
      /Invalid PostgreSQL WAL LSN/,
    );
  });

  it("selects REPACK (CONCURRENTLY, ANALYZE) on PG 19+ and VACUUM (ANALYZE) on PG <= 18", () => {
    expect(buildRepackTableSql("collection_Articles", { pgMajorVersion: 19 })).toEqual({
      sql: 'REPACK (CONCURRENTLY, ANALYZE) "collection_Articles"',
      mode: "repack",
    });

    expect(
      buildRepackTableSql("collection_Articles", {
        pgMajorVersion: 19,
        concurrently: false,
        analyze: false,
        schema: "public",
      }),
    ).toEqual({
      sql: 'REPACK "public"."collection_Articles"',
      mode: "repack",
    });

    expect(buildRepackTableSql("collection_Articles", { pgMajorVersion: 18 })).toEqual({
      sql: 'VACUUM (ANALYZE) "collection_Articles"',
      mode: "vacuum-analyze",
    });

    expect(() =>
      buildRepackTableSql('collection_Articles"; DROP TABLE x;--', { pgMajorVersion: 19 }),
    ).toThrow();
  });

  it("builds bounded pg_stat_user_tables bloat candidate SQL", () => {
    const sql = buildBloatCandidatesSql({
      schema: "public",
      minDeadTuples: 25_000,
      minDeadRatio: 0.25,
      limit: 3,
    });
    expect(sql).toContain("FROM pg_stat_user_tables AS s");
    expect(sql).toContain("s.schemaname = 'public'");
    expect(sql).toContain("s.n_dead_tup >= 25000");
    expect(sql).toContain(">= 0.25");
    expect(sql).toContain("LIMIT 3");
  });

  it("gates INSERT ... ON CONFLICT DO SELECT on PG 19+", () => {
    expect(
      buildInsertOnConflictDoSelectSql({
        pgMajorVersion: 18,
        tableName: "tenants",
        insertColumns: ["_id", "slug"],
        conflictColumns: ["slug"],
      }),
    ).toBeNull();

    expect(
      buildInsertOnConflictDoSelectSql({
        pgMajorVersion: 19,
        tableName: "tenants",
        insertColumns: ["_id", "slug"],
        conflictColumns: ["slug"],
        returningColumns: ["_id", "slug"],
      }),
    ).toBe(
      'INSERT INTO "tenants" ("_id", "slug") VALUES ($1, $2) ON CONFLICT ("slug") DO SELECT RETURNING "_id", "slug"',
    );
  });
});

describe("PostgreSQLAdapter PG19 runtime integration", () => {
  it("runs REPACK (CONCURRENTLY) on PG 19 and VACUUM (ANALYZE) on PG 18", async () => {
    const executed: string[] = [];
    const mockSql: any = (_strings: TemplateStringsArray) => [
      { version: "PostgreSQL 19.0 on x86_64-pc-linux-gnu" },
    ];
    mockSql.unsafe = vi.fn(async (sqlText: string) => {
      executed.push(sqlText);
      return [];
    });

    const adapter = new PostgreSQLAdapter();
    (adapter as any).sql = mockSql;
    (adapter as any).connected = true;

    const repack19 = await adapter.repackTable("collection_Articles");
    expect(repack19.success).toBe(true);
    if (!repack19.success) throw new Error("Expected repack19 to succeed");
    expect(repack19.data?.mode).toBe("repack");
    expect(adapter.supportsPg19Features).toBe(true);
    expect(executed).toContain('REPACK (CONCURRENTLY, ANALYZE) "collection_Articles"');

    // Verify PG 18 fallback
    const executed18: string[] = [];
    const adapter18 = new PostgreSQLAdapter();
    const mockSql18: any = {
      unsafe: vi.fn(async (sqlText: string) => {
        executed18.push(sqlText);
        return [];
      }),
    };
    (adapter18 as any).sql = mockSql18;
    (adapter18 as any).connected = true;
    (adapter18 as any)._serverVersionNum = 180007;

    const repack18 = await adapter18.repackTable("collection_Articles");
    expect(repack18.success).toBe(true);
    if (!repack18.success) throw new Error("Expected repack18 to succeed");
    expect(repack18.data?.mode).toBe("vacuum-analyze");
    expect(adapter18.supportsPg19Features).toBe(false);
    expect(executed18).toContain('VACUUM (ANALYZE) "collection_Articles"');
  });

  it("issues WAIT FOR LSN on a PG 19 replica and short-circuits on PG 18 or primary", async () => {
    const primarySql: any = { unsafe: vi.fn(async () => []) };
    const replicaSql: any = { unsafe: vi.fn(async () => []) };

    const adapter = new PostgreSQLAdapter();
    (adapter as any).sql = primarySql;
    (adapter as any).connected = true;
    (adapter as any)._serverVersionNum = 190000;

    // Primary itself never waits for LSN
    expect(await adapter.waitForReplicaLsn("0/16B3748", 500, primarySql)).toBe(false);
    expect(primarySql.unsafe).not.toHaveBeenCalled();

    // Standby replica runs WAIT FOR LSN
    expect(await adapter.waitForReplicaLsn("0/16B3748", 750, replicaSql)).toBe(true);
    expect(replicaSql.unsafe).toHaveBeenCalledWith(
      "WAIT FOR LSN '0/16B3748' WITH (TIMEOUT '750ms', NO_THROW)",
    );

    // PG 18 safely skips WAIT FOR LSN
    (adapter as any)._serverVersionNum = 180007;
    replicaSql.unsafe.mockClear();
    expect(await adapter.waitForReplicaLsn("0/16B3748", 750, replicaSql)).toBe(false);
    expect(replicaSql.unsafe).not.toHaveBeenCalled();
  });

  it("warms collection table point-read probes across pooled connections", async () => {
    const exec = { unsafe: vi.fn(async () => []) };
    const warmedCount = await warmPgCollectionStatements(
      exec,
      ["collection_Articles", "collection_Authors", "collection_Articles", "bad;table"],
      2,
    );
    expect(warmedCount).toBe(2);
    // 2 connections × 6 repetitions × 2 unique safe tables = 24 calls
    expect(exec.unsafe).toHaveBeenCalledTimes(24);
  });
});
