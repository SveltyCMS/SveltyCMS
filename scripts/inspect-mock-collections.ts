#!/usr/bin/env bun
/**
 * @file scripts/inspect-mock-collections.ts
 * @description Inspects SQLite databases for stale mock/benchmark collection tables and content_nodes.
 */
import { Database } from "bun:sqlite";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

const DB_DIR = path.resolve("config/database");
const MOCK_PATTERN = /mock|bench|stress|benchmark|Mock/i;

function inspectDb(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db
    .query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%' ORDER BY name`,
    )
    .all() as { name: string }[];

  const mockTables = tables.filter((t) => MOCK_PATTERN.test(t.name));
  console.log(`\n=== ${path.basename(dbPath)} ===`);
  console.log(`  collection_* tables: ${tables.length} (mock/bench: ${mockTables.length})`);
  for (const t of mockTables.slice(0, 20)) console.log(`    - ${t.name}`);
  if (mockTables.length > 20) console.log(`    ... +${mockTables.length - 20} more`);

  try {
    const row = db
      .query(`SELECT COUNT(*) as c FROM content_nodes WHERE nodeType = 'collection'`)
      .get() as { c: number };
    console.log(`  content_nodes (collection): ${row.c}`);
    const mockNodes = db
      .query(
        `SELECT path, slug FROM content_nodes WHERE nodeType = 'collection' AND (path LIKE '%mock%' OR slug LIKE '%mock%' OR path LIKE '%bench%' OR slug LIKE '%bench%') LIMIT 10`,
      )
      .all() as { path: string; slug: string }[];
    if (mockNodes.length) {
      console.log("  sample mock/bench nodes:");
      for (const n of mockNodes) console.log(`    - ${n.slug || n.path}`);
    }
  } catch {
    /* table may not exist */
  }
  db.close();
}

if (!existsSync(DB_DIR)) {
  console.log("No config/database directory");
  process.exit(0);
}

for (const file of readdirSync(DB_DIR)) {
  const isDb =
    (file.endsWith(".sqlite") || file.endsWith(".db")) &&
    !file.includes("-wal") &&
    !file.includes("-shm");
  if (isDb) inspectDb(path.join(DB_DIR, file));
}
