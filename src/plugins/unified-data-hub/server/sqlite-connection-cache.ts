/**
 * @file src/plugins/unified-data-hub/server/sqlite-connection-cache.ts
 * @description Per-connector SQLite file connection cache (Bun native driver preferred).
 *
 * Features:
 * - Lazy connection per connector file path
 * - Explicit invalidation on path/credential updates
 * - Test-only clearAll for isolation
 */

export interface SqliteHandle {
  query(sql: string, params?: unknown[]): { all(): Record<string, unknown>[] };
  close(): void;
}

const connections = new Map<string, SqliteHandle>();

async function openSqlite(filePath: string): Promise<SqliteHandle> {
  if (typeof Bun !== "undefined") {
    const { Database } = await new Function('return import("bun:sqlite")')();
    const db = new Database(filePath, { readonly: false });
    return {
      query(sql: string, params: unknown[] = []) {
        return {
          all() {
            return db.query(sql).all(...params) as Record<string, unknown>[];
          },
        };
      },
      close() {
        db.close();
      },
    };
  }

  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(filePath);
  return {
    query(sql: string, params: unknown[] = []) {
      return {
        all() {
          const stmt = db.prepare(sql);
          return stmt.all(...(params as (string | number | bigint | Buffer | null)[])) as Record<
            string,
            unknown
          >[];
        },
      };
    },
    close() {
      db.close();
    },
  };
}

export async function getPooledSqlite(
  connectorId: string,
  filePath: string,
): Promise<SqliteHandle> {
  const existing = connections.get(connectorId);
  if (existing) return existing;
  const handle = await openSqlite(filePath);
  connections.set(connectorId, handle);
  return handle;
}

export async function invalidateSqliteConnection(connectorId: string): Promise<void> {
  const conn = connections.get(connectorId);
  if (!conn) return;
  connections.delete(connectorId);
  try {
    conn.close();
  } catch {
    /* non-fatal */
  }
}

export async function clearAllSqliteConnections(): Promise<void> {
  const ids = [...connections.keys()];
  await Promise.all(ids.map((id) => invalidateSqliteConnection(id)));
}
