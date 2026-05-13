/**
 * @file src/databases/sqlite/sqlite-adapter.ts
 * @description Standard SQLite database adapter for SveltyCMS.
 */

import type { IDBAdapter, DatabaseResult } from "../db-interface";
import { logger } from "@src/utils/logger";
import { SQLiteAdapterCore } from "./adapter-core";

export class SQLiteAdapter extends SQLiteAdapterCore implements IDBAdapter {
  constructor(_config: any = {}) {
    super();
  }
  public readonly type = "sqlite";

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    return SQLiteAdapterCore.writeMutex.runExclusive(() =>
      this.wrap(async () => {
        // Support both Bun (query) and Node/better-sqlite3 (prepare)
        let tables: { name: string }[];
        if (this.sqlite.query) {
          tables = this.sqlite
            .query(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            )
            .all() as { name: string }[];
        } else if (this.sqlite.prepare) {
          tables = this.sqlite
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            )
            .all() as { name: string }[];
        } else {
          return;
        }

        this.sqlite.run("PRAGMA foreign_keys = OFF;");
        for (const table of tables) {
          this.sqlite.run(`DROP TABLE IF EXISTS "${table.name}"`);
        }
        this.sqlite.run("PRAGMA foreign_keys = ON;");

        // 🚀 HARDENING: Mark as not provisioned so system tables are re-created
        this._provisioned = false;
        this._provisionPromise = null;

        logger.info("[SQLite Adapter] Database tables dropped (resilient clear)");
      }, "CLEAR_DATABASE_FAILED"),
    );
  }
}
