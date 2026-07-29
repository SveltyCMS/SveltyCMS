/**
 * @file src/utils/schema-diff.ts
 * @description Hardened Schema Diffing Engine.
 *
 * ### Hardening (audit 2026-07):
 * - SQL injection prevention: SQLite table name escaping via .replace(/"/g, '""')
 * - Type mismatch detection: maps SQLite types → Drizzle types, reports discrepancies
 * - Extra column detection: reports DB columns not in Drizzle schema
 * - Null-safe initialization: ??= [] pattern for clean record population
 *
 * Compares Drizzle schemas against the physical database structure
 * and identifies required changes. Currently specialized for SQLite.
 */

import { logger } from "./logger";
import { getTableColumns } from "drizzle-orm";

export interface SchemaDiffResult {
  missingTables: string[];
  missingColumns: Record<string, string[]>;
  extraColumns: Record<string, string[]>;
  typeMismatches: Record<string, { column: string; expected: string; actual: string }[]>;
}

export class SchemaDiffEngine {
  /**
   * Compares the provided Drizzle schema against a database instance.
   * Currently specialized for SQLite.
   */
  public static async compare(db: any, schema: Record<string, any>): Promise<SchemaDiffResult> {
    const result: SchemaDiffResult = {
      missingTables: [],
      missingColumns: {},
      extraColumns: {},
      typeMismatches: {},
    };

    // 1. Fetch physical tables safely
    const physicalTables = new Set<string>();
    try {
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];
      rows.forEach((r) => physicalTables.add(r.name));
    } catch (err) {
      logger.error("[SchemaDiff] Critical failure fetching schema:", err);
      return result;
    }

    // 2. Map SQLite types to expected Drizzle types
    const mapSqliteToDrizzle = (type: string): string => {
      const t = type.toUpperCase();
      if (t.includes("INT")) return "integer";
      if (t.includes("TEXT")) return "text";
      if (t.includes("REAL") || t.includes("FLOAT")) return "real";
      return t.toLowerCase();
    };

    for (const table of Object.values(schema)) {
      const tableName = (table as any)._Config?.name || (table as any).tableName;
      if (!tableName) continue;

      if (!physicalTables.has(tableName)) {
        result.missingTables.push(tableName);
        continue;
      }

      // 3. Analyze columns
      try {
        const drizzleCols = getTableColumns(table as any);
        // Escape double-quotes for SQLite identifier quoting (prevents injection)
        const physicalCols = db
          .prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`)
          .all() as any[];

        const physMap = new Map(physicalCols.map((c) => [c.name, c]));

        const drizzleNames = new Set(Object.keys(drizzleCols));
        const physicalNames = new Set(physMap.keys());

        // Check for missing vs extra columns
        for (const name of drizzleNames) {
          if (!physicalNames.has(name)) {
            (result.missingColumns[tableName] ??= []).push(name);
          } else {
            // Type Mismatch Detection
            const dCol = drizzleCols[name];
            const pCol = physMap.get(name);
            const dType = dCol.dataType;
            const pType = mapSqliteToDrizzle(pCol.type);

            if (!SchemaDiffEngine.typesMatch(dType, pType)) {
              (result.typeMismatches[tableName] ??= []).push({
                column: name,
                expected: dType,
                actual: pType,
              });
            }
          }
        }

        // Extra columns (in DB but not in Drizzle)
        for (const name of physicalNames) {
          if (!drizzleNames.has(name)) {
            (result.extraColumns[tableName] ??= []).push(name);
          }
        }
      } catch (err) {
        logger.error(`[SchemaDiff] Error analyzing table ${tableName}:`, err);
      }
    }

    return result;
  }

  /**
   * Checks whether a Drizzle column type is compatible with the physical SQLite type.
   */
  private static typesMatch(drizzleType: string, sqliteType: string): boolean {
    const map: Record<string, string[]> = {
      string: ["text", "varchar"],
      number: ["integer", "real"],
      boolean: ["integer"],
    };
    return map[drizzleType]?.includes(sqliteType) ?? true;
  }
}
