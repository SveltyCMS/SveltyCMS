/**
 * @file src/utils/schema-diff.ts
 * @description 💎 GOLD TIER: Schema Diffing Engine.
 * Compares Drizzle schemas against the physical database structure
 * and identifies required changes.
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

    logger.info("[SchemaDiff] Starting structural analysis...");

    // 1. Get physical tables from database
    const physicalTables = new Set<string>();
    try {
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      rows.forEach((r: any) => physicalTables.add(r.name));
    } catch (err) {
      logger.error("[SchemaDiff] Failed to fetch physical tables:", err);
      return result;
    }

    // 2. Iterate through Drizzle schema
    for (const [, table] of Object.entries(schema)) {
      // Drizzle tables are identified by their 'Config.name'
      const tableName = (table as any)._Config?.name || (table as any).tableName;
      if (!tableName) continue;

      if (!physicalTables.has(tableName)) {
        result.missingTables.push(tableName);
        continue;
      }

      // 3. Compare columns
      try {
        const drizzleCols = getTableColumns(table as any);
        const physicalColsRows = db.prepare(`PRAGMA table_info("${tableName}")`).all();
        const physicalCols = new Set(physicalColsRows.map((r: any) => r.name));

        const missingInPhysical: string[] = [];
        for (const colName of Object.keys(drizzleCols)) {
          if (!physicalCols.has(colName)) {
            missingInPhysical.push(colName);
          }
        }

        if (missingInPhysical.length > 0) {
          result.missingColumns[tableName] = missingInPhysical;
        }
      } catch {
        logger.warn(`[SchemaDiff] Failed to analyze columns for table: ${tableName}`);
      }
    }

    logger.info(
      `[SchemaDiff] Analysis complete. Detected ${result.missingTables.length} missing tables.`,
    );
    return result;
  }
}
