/**
 * @file src/databases/sqlite/sqlite-dialect.ts
 * @description SQLite-specific performance tuning and dialect normalization.
 */

import type { IDialectProvider } from "../db-interface";

export class SqliteDialect implements IDialectProvider {
  constructor(private db: any) {}

  async applyOptimizations(): Promise<void> {
    const pragmas = [
      "PRAGMA journal_mode=WAL",
      "PRAGMA synchronous=NORMAL",
      "PRAGMA foreign_keys=ON",
      "PRAGMA busy_timeout=30000",
      "PRAGMA temp_store=MEMORY",
      "PRAGMA mmap_size=536870912",
      "PRAGMA cache_size=-128000",
    ];
    for (const p of pragmas) await this.executeTuningCommand(p);
  }

  normalizeSchema(schema: any) {
    return schema; // SQLite schema is already the baseline
  }

  async executeTuningCommand(cmd: string): Promise<void> {
    await this.db.exec(cmd);
  }
}
