/**
 * @file tests/unit/databases/schema-spec-parity.test.ts
 * @description
 * Drift guard between the declarative system schema spec
 * (src/databases/system-schema-spec.ts), the hand-written Drizzle schemas
 * (src/databases/{postgresql,mariadb,sqlite}/schema.ts) and the boot-time
 * schema renderer (src/databases/core/system-schema-bootstrap.ts).
 *
 * Why this exists: the three hand-maintained migration files used to be ~90%
 * structural copies that drifted apart — `auth_api_keys` existed in the
 * SQLite migrations but was silently missing from PostgreSQL and MariaDB,
 * breaking API keys on those engines. Migrations are now rendered from the
 * spec at boot with no artifact files, so the guards here are:
 *
 * 1. every spec table must exist in the matching schema.ts with EXACTLY the
 *    same column name set (adding a column to one without the other fails);
 * 2. every spec index must be emitted by the bootstrap renderer for its
 *    engine (an index declared in the spec but dropped by the renderer fails).
 */

import { describe, expect, it } from "vitest";

import {
  SYSTEM_SCHEMA,
  type Dialect,
  type IndexSpec,
  type TableSpec,
} from "@src/databases/system-schema-spec";
import {
  renderBootstrapStatements,
  renderSqliteBatch,
} from "@src/databases/core/system-schema-bootstrap";
import * as mariaSchema from "@src/databases/mariadb/schema";
import * as pgSchema from "@src/databases/postgresql/schema";
import * as sqliteSchema from "@src/databases/sqlite/schema";

const DIALECTS: Dialect[] = ["sqlite", "postgresql", "mariadb"];

const DRIZZLE_TABLE = Symbol.for("drizzle:IsDrizzleTable");
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

/**
 * Schema elements that the spec declares (and boot provisioning creates) but
 * the hand-written schema.ts does not define on this engine. Each entry is
 * asserted to be GENUINELY absent below, so it cannot silently rot — when
 * someone adds the element to schema.ts, the test fails and the entry must be
 * removed.
 *
 * - tables: whole tables missing from schema.ts. postgresql/mariadb
 *   `404_logs` is created by boot provisioning for src/hooks/handle-redirects.ts;
 *   the postgresql `404-logs.ts` sub-module defines an unrelated, unused
 *   `collection_404_logs` table, and mariadb has no 404 schema at all.
 * - columns: columns missing from an existing schema.ts table. sqlite/mariadb
 *   `system_preferences.category` is a legacy grouping column the Drizzle
 *   schemas never declared; provisioning still creates it.
 */
interface SchemaGap {
  tables?: string[];
  columns?: Record<string, string[]>;
}

const KNOWN_SCHEMA_TS_GAPS: Partial<Record<Dialect, SchemaGap>> = {
  postgresql: { tables: ["404_logs"] },
  mariadb: { tables: ["404_logs"], columns: { system_preferences: ["category"] } },
  sqlite: { columns: { system_preferences: ["category"] } },
};

const SCHEMA_MODULES: Record<Dialect, Record<string, unknown>> = {
  sqlite: sqliteSchema,
  postgresql: pgSchema,
  mariadb: mariaSchema,
};

function specTables(): TableSpec[] {
  return SYSTEM_SCHEMA.filter((i): i is TableSpec => i.kind === "table");
}

function specColumnNames(t: TableSpec, dialect: Dialect): string[] {
  return t.columns
    .filter((c) => c.type[dialect] !== undefined)
    .map((c) => c.name)
    .sort();
}

function collectSchemaTables(mod: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const value of Object.values(mod)) {
    if (value && typeof value === "object" && DRIZZLE_TABLE in value) {
      const name = (value as Record<PropertyKey, unknown>)[DRIZZLE_NAME];
      if (typeof name === "string") map.set(name, value);
    }
  }
  return map;
}

/** DB column names of a drizzle table (own column properties, minus helpers like enableRLS). */
function schemaColumnNames(table: unknown): string[] {
  const t = table as Record<string, unknown>;
  return Object.keys(t)
    .filter((k) => {
      const v = t[k];
      return typeof v === "object" && v !== null && (v as { table?: unknown }).table === t;
    })
    .map((k) => (t[k] as { name: string }).name)
    .sort();
}

function allSpecIndexes(): IndexSpec[] {
  const indexes: IndexSpec[] = [];
  for (const t of specTables()) {
    indexes.push(...(t.indexes ?? []));
  }
  return indexes;
}

/** Rendered DDL text for a dialect — the haystack for index-name guards. */
function renderedDdl(dialect: Dialect): string {
  if (dialect === "sqlite") return renderSqliteBatch();
  return renderBootstrapStatements(dialect).join("\n");
}

describe("system schema spec vs drizzle schema.ts", () => {
  for (const dialect of DIALECTS) {
    const tables = collectSchemaTables(SCHEMA_MODULES[dialect]);

    describe(`dialect: ${dialect}`, () => {
      it("every spec table exists in schema.ts with exactly the same columns", () => {
        const problems: string[] = [];
        const gapTables = new Set(KNOWN_SCHEMA_TS_GAPS[dialect]?.tables ?? []);
        const gapColumns = KNOWN_SCHEMA_TS_GAPS[dialect]?.columns ?? {};
        for (const spec of specTables()) {
          const expected = specColumnNames(spec, dialect);
          const schemaTable = tables.get(spec.name);

          if (gapTables.has(spec.name)) {
            if (schemaTable) {
              problems.push(
                `${spec.name}: now defined in schema.ts — remove it from KNOWN_SCHEMA_TS_GAPS.${dialect}.tables`,
              );
            }
            continue;
          }
          if (!schemaTable) {
            problems.push(`${spec.name}: missing from ${dialect} schema.ts`);
            continue;
          }
          const actual = schemaColumnNames(schemaTable);
          const knownMissing = new Set(gapColumns[spec.name] ?? []);
          for (const col of knownMissing) {
            if (actual.includes(col)) {
              problems.push(
                `${spec.name}.${col}: now defined in schema.ts — remove it from KNOWN_SCHEMA_TS_GAPS.${dialect}.columns`,
              );
            }
          }
          const missing = expected.filter((c) => !actual.includes(c) && !knownMissing.has(c));
          const extra = actual.filter((c) => !expected.includes(c));
          if (missing.length > 0) {
            problems.push(
              `${spec.name}: spec columns missing from schema.ts: ${missing.join(", ")}`,
            );
          }
          if (extra.length > 0) {
            problems.push(
              `${spec.name}: schema.ts columns missing from the spec: ${extra.join(", ")}`,
            );
          }
        }
        expect(problems, problems.join("\n")).toEqual([]);
      });

      it("every spec index is emitted by the boot renderer", () => {
        // Quotes stripped from the haystack: postgresql quotes digit-leading
        // names (`"404_logs_path_tenant_idx"`) and sqlite quotes everything.
        const haystack = renderedDdl(dialect).replace(/"/g, "");
        const problems: string[] = [];
        for (const idx of allSpecIndexes()) {
          const name = idx.name[dialect];
          if (!name) continue;
          const needle =
            dialect === "postgresql"
              ? `INDEX IF NOT EXISTS ${name} ON`
              : dialect === "mariadb"
                ? `INDEX ${name} (`
                : `INDEX IF NOT EXISTS ${name} ON`;
          if (!haystack.includes(needle)) {
            problems.push(`${dialect}: index ${name} missing from rendered bootstrap DDL`);
          }
        }
        expect(problems, problems.join("\n")).toEqual([]);
      });
    });
  }
});
