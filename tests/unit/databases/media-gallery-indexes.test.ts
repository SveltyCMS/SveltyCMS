/**
 * @file tests/unit/databases/media-gallery-indexes.test.ts
 * @description
 * Regression guard for the media gallery composite-index fix.
 *
 * The gallery query (src/routes/(app)/mediagallery/+page.server.ts →
 * `media.files.getByFolder` in src/databases/core/relational-media.ts) filters on
 * `tenantId = ? [AND folderId = ?]` and orders by `updatedAt DESC LIMIT 101`.
 * With only single-column indexes every engine had to fetch all matching rows
 * and sort them per page.
 *
 * Three layers must agree on the two new composite indexes:
 * 1. the declarative spec (SYSTEM_SCHEMA) — columns, order and DESC flags;
 * 2. the boot renderer — the DDL every fresh database receives, and (for an
 *    existing database) the pass re-run that the schema fingerprint triggers as
 *    soon as the spec changes;
 * 3. the hand-written Drizzle schemas (and the Mongo schema declaration).
 *
 * Query-plan verification (EXPLAIN on a seeded gallery) and the 4-adapter
 * integration run are NOT covered here — they belong to the CI/orchestrator
 * database matrix.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig as getMariaTableConfig } from "drizzle-orm/mysql-core";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import type mysql from "mysql2/promise";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  bootstrapSystemSchema,
  computeSchemaFingerprint,
  renderBootstrapStatements,
  renderSqliteBatch,
} from "@src/databases/core/system-schema-bootstrap";
import * as mariaSchema from "@src/databases/mariadb/schema";
import * as pgSchema from "@src/databases/postgresql/schema";
import * as sqliteSchema from "@src/databases/sqlite/schema";
import {
  SYSTEM_SCHEMA,
  type Dialect,
  type IndexSpec,
  type TableSpec,
} from "@src/databases/system-schema-spec";

const FOLDER_INDEX = {
  postgresql: "media_items_tenant_folder_updated_idx",
  mariadb: "tenant_folder_updated_idx",
  sqlite: "idx_media_items_tenant_folder_updated",
} as const;
const TENANT_INDEX = {
  postgresql: "media_items_tenant_updated_idx",
  mariadb: "tenant_updated_idx",
  sqlite: "idx_media_items_tenant_updated",
} as const;

const MEDIA_SPEC = SYSTEM_SCHEMA.find(
  (item): item is TableSpec => item.kind === "table" && item.name === "media_items",
);

/** Either gallery index declaration (folder-scoped or tenant-wide). */
type MediaIndexNames = typeof FOLDER_INDEX | typeof TENANT_INDEX;

/**
 * Resolve a `media_items` index from SYSTEM_SCHEMA by comparing the name it
 * declares for `dialect` — the folder and tenant galleries use different names
 * per engine, so a dialect-scoped lookup cannot cross-match the wrong index.
 */
function specIndex(names: MediaIndexNames, dialect: Dialect): IndexSpec | undefined {
  const expected = names[dialect];
  return MEDIA_SPEC?.indexes?.find((idx) => idx.name[dialect] === expected);
}

// ---------------------------------------------------------------------------
// 1. Declarative spec
// ---------------------------------------------------------------------------

describe("media gallery indexes — system schema spec", () => {
  it("declares the folder-scoped gallery index on all three SQL dialects", () => {
    const index = specIndex(FOLDER_INDEX, "postgresql");
    expect(index, "media_items folder gallery index missing from SYSTEM_SCHEMA").toBeDefined();
    expect(index?.name).toMatchObject(FOLDER_INDEX);
    expect(index?.columns.postgresql).toEqual(["tenantId", "folderId", "updatedAt"]);
    expect(index?.columns.mariadb).toEqual(["tenantId", "folderId", "updatedAt"]);
    expect(index?.columns.sqlite).toEqual(["tenantId", "folderId", "updatedAt"]);
    // DESC only where the dialect honours it (MariaDB <10.8 ignores it).
    expect(index?.descColumns).toEqual({
      postgresql: ["updatedAt"],
      sqlite: ["updatedAt"],
    });
  });

  it("declares the tenant-wide recency index on all three SQL dialects", () => {
    const index = specIndex(TENANT_INDEX, "postgresql");
    expect(index, "media_items tenant recency index missing from SYSTEM_SCHEMA").toBeDefined();
    expect(index?.name).toMatchObject(TENANT_INDEX);
    expect(index?.columns.postgresql).toEqual(["tenantId", "updatedAt"]);
    expect(index?.columns.mariadb).toEqual(["tenantId", "updatedAt"]);
    expect(index?.columns.sqlite).toEqual(["tenantId", "updatedAt"]);
    expect(index?.descColumns).toEqual({
      postgresql: ["updatedAt"],
      sqlite: ["updatedAt"],
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Boot provisioning (fresh installs from the spec, existing installs via tails)
// ---------------------------------------------------------------------------

interface PgMock {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  unsafe(statement: string): Promise<unknown>;
}

function createPgMock(): { connection: PgMock; statements: string[] } {
  const statements: string[] = [];
  const connection = (async () => [] as unknown[]) as unknown as PgMock;
  connection.unsafe = async (statement: string) => {
    statements.push(statement);
    return [];
  };
  return { connection: connection, statements };
}

function createMariaMock(): { connection: mysql.Pool; statements: string[] } {
  const statements: string[] = [];
  const connection = {
    query: async (statement: string): Promise<[unknown[], unknown]> => {
      statements.push(statement);
      return [[], []];
    },
  };
  return { connection: connection as unknown as mysql.Pool, statements };
}

function createSqliteMock(): {
  connection: { exec: (statement: string) => void };
  statements: string[];
} {
  const statements: string[] = [];
  return {
    connection: {
      exec: (statement: string) => {
        statements.push(statement);
      },
    },
    statements,
  };
}

describe("media gallery indexes — boot provisioning", () => {
  it("postgresql emits both indexes with DESC for fresh and existing databases", async () => {
    const { connection, statements } = createPgMock();
    const result = await bootstrapSystemSchema("postgresql", connection as unknown as postgres.Sql);
    expect(result.success).toBe(true);

    const folder = statements.filter((s) => s.includes(FOLDER_INDEX.postgresql));
    const tenant = statements.filter((s) => s.includes(TENANT_INDEX.postgresql));
    // A fresh database gets the indexes from the spec pass; an existing one gets
    // them because a spec change moves the fingerprint and re-runs that same pass
    // (`CREATE INDEX IF NOT EXISTS` is idempotent).
    expect(folder.length, "spec pass must cover the folder index").toBeGreaterThan(0);
    expect(tenant.length, "spec pass must cover the tenant index").toBeGreaterThan(0);
    expect(folder[0]).toContain('("tenantId", "folderId", "updatedAt" DESC)');
    expect(tenant[0]).toContain('("tenantId", "updatedAt" DESC)');
  });

  it("mariadb emits both indexes inline in CREATE TABLE", async () => {
    const { connection, statements } = createMariaMock();
    const result = await bootstrapSystemSchema("mariadb", connection);
    expect(result.success).toBe(true);

    const all = statements.join("\n");
    const folder = statements.filter((s) => s.includes(FOLDER_INDEX.mariadb));
    const tenant = statements.filter((s) => s.includes(TENANT_INDEX.mariadb));
    expect(folder.length).toBeGreaterThan(0);
    expect(tenant.length).toBeGreaterThan(0);
    // Inline in CREATE TABLE (fresh installs); an existing database receives them
    // through the fingerprint-triggered re-run of this same statement.
    expect(all).toContain("INDEX tenant_folder_updated_idx (tenantId, folderId, updatedAt)");
    expect(all).toContain("INDEX tenant_updated_idx (tenantId, updatedAt)");
    // No DESC: MariaDB <10.8 ignores index direction.
    expect(all).not.toMatch(/tenant_folder_updated_idx[^)]*updatedAt DESC/);
  });

  it("sqlite emits both indexes with DESC for fresh and existing databases", async () => {
    const { connection, statements } = createSqliteMock();
    const result = await bootstrapSystemSchema("sqlite", connection);
    expect(result.success).toBe(true);

    const all = statements.join("\n");
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_media_items_tenant_folder_updated" ON "media_items" ("tenantId", "folderId", "updatedAt" DESC)',
    );
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_media_items_tenant_updated" ON "media_items" ("tenantId", "updatedAt" DESC)',
    );
  });

  it("renders the index statements in the static DDL for all dialects", () => {
    const pgDdl = renderBootstrapStatements("postgresql").join("\n");
    const mariaDdl = renderBootstrapStatements("mariadb").join("\n");
    const sqliteDdl = renderSqliteBatch();

    expect(pgDdl).toContain(FOLDER_INDEX.postgresql);
    expect(pgDdl).toContain(TENANT_INDEX.postgresql);
    expect(mariaDdl).toContain(`INDEX ${FOLDER_INDEX.mariadb} (tenantId, folderId, updatedAt)`);
    expect(mariaDdl).toContain(`INDEX ${TENANT_INDEX.mariadb} (tenantId, updatedAt)`);
    expect(sqliteDdl).toContain(FOLDER_INDEX.sqlite);
    expect(sqliteDdl).toContain(TENANT_INDEX.sqlite);
  });

  // An existing database only receives a spec change if the fingerprint moves:
  // the pass is skipped while the fingerprint matches, so these two properties are
  // what makes "one schema path, no tails" safe.
  it("fingerprint is dialect-scoped and changes with the spec", () => {
    const baseline = computeSchemaFingerprint("mariadb");
    expect(computeSchemaFingerprint("mariadb")).toBe(baseline);
    expect(computeSchemaFingerprint("postgresql")).not.toBe(baseline);

    const mutated = SYSTEM_SCHEMA.map((item) =>
      item.kind === "table" && item.name === "media_items"
        ? {
            ...item,
            columns: [...item.columns, { name: "fingerprintProbe", type: { mariadb: "INT" } }],
          }
        : item,
    );
    expect(computeSchemaFingerprint("mariadb", mutated)).not.toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// 3. Drizzle schema declarations
// ---------------------------------------------------------------------------

interface ParsedIndexColumn {
  name: string;
  desc: boolean;
}

/**
 * Resolves a Drizzle index column to its DB name + direction. PostgreSQL keeps
 * the direction on `indexConfig.order` (`.desc()`); sqlite/mysql wrap it in an
 * `SQL` chunk (`desc(column)`), so those chunks are walked instead.
 */
function parseIndexColumn(column: unknown): ParsedIndexColumn {
  if (column && typeof column === "object") {
    const direct = column as {
      name?: unknown;
      indexConfig?: { order?: unknown };
      queryChunks?: unknown[];
    };
    if (typeof direct.name === "string") {
      return { name: direct.name, desc: direct.indexConfig?.order === "desc" };
    }
    if (Array.isArray(direct.queryChunks)) {
      let name = "<unknown>";
      let desc = false;
      for (const chunk of direct.queryChunks) {
        if (!chunk || typeof chunk !== "object") continue;
        const chunkName = (chunk as { name?: unknown }).name;
        if (typeof chunkName === "string") name = chunkName;
        const raw = (chunk as { value?: unknown }).value;
        if (Array.isArray(raw) && raw.some((v) => typeof v === "string" && /\bdesc\b/i.test(v))) {
          desc = true;
        }
      }
      return { name, desc };
    }
  }
  return { name: "<unknown>", desc: false };
}

function declaredIndex(indexes: readonly unknown[], name: string): ParsedIndexColumn[] {
  for (const entry of indexes) {
    const config = (entry as { config?: { name?: unknown; columns?: unknown } }).config;
    if (!config || config.name !== name || !Array.isArray(config.columns)) continue;
    return (config.columns as unknown[]).map(parseIndexColumn);
  }
  throw new Error(`${name} is not declared in the Drizzle schema`);
}

describe("media gallery indexes — drizzle schema declarations", () => {
  it("postgresql declares both composite indexes (updatedAt DESC)", () => {
    const { indexes } = getPgTableConfig(pgSchema.mediaItems);
    expect(declaredIndex(indexes, FOLDER_INDEX.postgresql)).toEqual([
      { name: "tenantId", desc: false },
      { name: "folderId", desc: false },
      { name: "updatedAt", desc: true },
    ]);
    expect(declaredIndex(indexes, TENANT_INDEX.postgresql)).toEqual([
      { name: "tenantId", desc: false },
      { name: "updatedAt", desc: true },
    ]);
  });

  it("mariadb declares both composite indexes (ascending, matching the inline spec)", () => {
    const { indexes } = getMariaTableConfig(mariaSchema.mediaItems);
    expect(declaredIndex(indexes, FOLDER_INDEX.mariadb)).toEqual([
      { name: "tenantId", desc: false },
      { name: "folderId", desc: false },
      { name: "updatedAt", desc: false },
    ]);
    expect(declaredIndex(indexes, TENANT_INDEX.mariadb)).toEqual([
      { name: "tenantId", desc: false },
      { name: "updatedAt", desc: false },
    ]);
  });

  it("sqlite declares both composite indexes (updatedAt DESC)", () => {
    const { indexes } = getSqliteTableConfig(sqliteSchema.mediaItems);
    expect(declaredIndex(indexes, FOLDER_INDEX.sqlite)).toEqual([
      { name: "tenantId", desc: false },
      { name: "folderId", desc: false },
      { name: "updatedAt", desc: true },
    ]);
    expect(declaredIndex(indexes, TENANT_INDEX.sqlite)).toEqual([
      { name: "tenantId", desc: false },
      { name: "updatedAt", desc: true },
    ]);
  });

  it("mongodb declares the equivalent { tenantId, folderId, updatedAt: -1 } shape", () => {
    const source = readFileSync(join(process.cwd(), "src/databases/mongodb/media.ts"), "utf8");
    expect(source).toContain("mediaSchema.index({ tenantId: 1, folderId: 1, updatedAt: -1 })");
  });
});
