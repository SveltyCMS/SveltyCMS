/**
 * @file src/utils/benchmark-db-purge.ts
 * @description Purges stale mock/benchmark collection tables and content_nodes from SQLite databases.
 *
 * Filesystem purge (`purgeBenchmarkCollectionArtifacts`) does not remove DB tables or
 * `content_nodes` rows — this module closes that gap.
 *
 * ### Features:
 * - scope-aware drops (user vs benchmark_shared vs ephemeral test DBs)
 * - mock scan debris always removed
 * - bench_tmp_*.sqlite file deletion
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  isBenchmarkArtifact,
  isMockScanCollection,
  normalizeCollectionId,
} from "@src/routes/setup/preset-collections.server";
import { logger } from "@utils/logger";

export const DEFAULT_DATABASE_DIR = path.resolve(process.cwd(), "config", "database");

export type BenchmarkDbScope = "user" | "benchmark-shared" | "test-ephemeral";

/** Intentional demo/benchmark presets kept in benchmark_shared.sqlite. */
const BENCHMARK_SHARED_KEEP_IDS = new Set([
  "benchmarkstable",
  "benchmarkauthors",
  "benchmarkposts",
]);

/** Normalizes a `collection_*` table name to a collection id. */
export function collectionTableToId(tableName: string): string {
  const prefix = "collection_";
  return tableName.startsWith(prefix) ? tableName.slice(prefix.length) : tableName;
}

/** Resolves purge scope from a database filename. */
export function resolveBenchmarkDbScope(fileName: string): BenchmarkDbScope {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("bench_tmp_")) return "test-ephemeral";
  if (lower.includes("benchmark_shared")) return "benchmark-shared";
  if (lower.includes("healing_test")) return "test-ephemeral";
  return "user";
}

/** True when a legacy sanitized table id looks benchmark-only (e.g. benchacid, benchmarkauthors). */
export function isLegacyBenchmarkTableId(collectionId: string): boolean {
  const norm = normalizeCollectionId(collectionId);
  if (norm.startsWith("mockcollection")) return true;
  if (norm.startsWith("benchmark") || norm.startsWith("bench")) return true;
  if (norm.startsWith("stress")) return true;
  return isBenchmarkArtifact(`${collectionId}.ts`);
}

/** True when a collection id should be dropped for the given DB scope. */
export function shouldPurgeDatabaseCollection(
  collectionId: string,
  scope: BenchmarkDbScope,
): boolean {
  if (isMockScanCollection(collectionId)) return true;
  const norm = normalizeCollectionId(collectionId);
  if (norm.startsWith("mockcollection")) return true;

  if (scope === "benchmark-shared") {
    if (BENCHMARK_SHARED_KEEP_IDS.has(norm)) return false;
    return isLegacyBenchmarkTableId(collectionId);
  }

  return isLegacyBenchmarkTableId(collectionId);
}

/** True when a content_nodes row represents stale benchmark/mock debris. */
export function isStaleCollectionContentNode(
  nodePath: string,
  slug: string,
  scope: BenchmarkDbScope,
): boolean {
  const pathSlug = nodePath.split("/").filter(Boolean).pop() ?? "";
  const candidates = [pathSlug, slug].filter(Boolean);
  for (const candidate of candidates) {
    if (shouldPurgeDatabaseCollection(candidate, scope)) return true;
    if (isMockScanCollection(candidate, candidate)) return true;
  }
  const combined = `${nodePath} ${slug}`.toLowerCase();
  if (combined.includes("mock collection")) return true;
  return false;
}

function isSqliteDatabaseFile(fileName: string): boolean {
  if (fileName.includes("-wal") || fileName.includes("-shm")) return false;
  return fileName.endsWith(".sqlite") || fileName.endsWith(".db");
}

export interface PurgeBenchmarkDatabaseResult {
  databasesProcessed: number;
  tablesDropped: number;
  nodesDeleted: number;
  tempDbsRemoved: number;
}

/**
 * Purges stale mock/benchmark collection data from SQLite files in config/database.
 */
export async function purgeBenchmarkDatabaseArtifacts(options?: {
  databaseDir?: string;
  dbPaths?: string[];
}): Promise<PurgeBenchmarkDatabaseResult> {
  const databaseDir = options?.databaseDir ?? DEFAULT_DATABASE_DIR;
  const result: PurgeBenchmarkDatabaseResult = {
    databasesProcessed: 0,
    tablesDropped: 0,
    nodesDeleted: 0,
    tempDbsRemoved: 0,
  };

  let dbPaths = options?.dbPaths;
  if (!dbPaths) {
    if (!existsSync(databaseDir)) return result;
    const entries = await fs.readdir(databaseDir);
    dbPaths = entries.filter(isSqliteDatabaseFile).map((f) => path.join(databaseDir, f));
  }

  for (const dbPath of dbPaths) {
    const fileName = path.basename(dbPath);
    const scope = resolveBenchmarkDbScope(fileName);

    if (scope === "test-ephemeral" && fileName.startsWith("bench_tmp_")) {
      await removeSqliteFileFamily(dbPath);
      result.tempDbsRemoved++;
      continue;
    }

    if (!existsSync(dbPath)) continue;

    const db = new Database(dbPath);
    try {
      const tables = db
        .query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%' ORDER BY name`,
        )
        .all() as { name: string }[];

      const tablesToDrop: string[] = [];
      for (const { name } of tables) {
        const collectionId = collectionTableToId(name);
        if (shouldPurgeDatabaseCollection(collectionId, scope)) {
          tablesToDrop.push(name);
        }
      }

      for (const tableName of tablesToDrop) {
        db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
        result.tablesDropped++;
      }

      try {
        const nodes = db
          .query(`SELECT path, slug FROM content_nodes WHERE nodeType = 'collection'`)
          .all() as { path: string; slug: string | null }[];

        const deleteStmt = db.prepare(
          `DELETE FROM content_nodes WHERE nodeType = 'collection' AND path = ?`,
        );
        for (const node of nodes) {
          if (isStaleCollectionContentNode(node.path ?? "", node.slug ?? "", scope)) {
            deleteStmt.run(node.path ?? "");
            result.nodesDeleted++;
          }
        }
      } catch {
        /* content_nodes may not exist */
      }

      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      result.databasesProcessed++;
    } finally {
      db.close();
    }
  }

  if (result.tablesDropped > 0 || result.nodesDeleted > 0 || result.tempDbsRemoved > 0) {
    logger.info(
      `🧹 DB purge: ${result.tablesDropped} table(s), ${result.nodesDeleted} content_node(s), ${result.tempDbsRemoved} temp DB(s)`,
    );
  }

  return result;
}

async function removeSqliteFileFamily(dbPath: string): Promise<void> {
  const variants = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const file of variants) {
    await fs.unlink(file).catch(() => {});
  }
}
