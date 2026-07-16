/**
 * @file src/plugins/unified-data-hub/server/sqlite-connection-cache.ts
 * @description Per-connector SQLite file connection cache (Bun native driver preferred).
 *
 * Features:
 * - Lazy connection per connector file path
 * - Explicit invalidation on path/credential updates
 * - Test-only clearAll for isolation
 * - Statement cache on Node.js (matches Bun's built-in query caching)
 * - Boolean-to-integer normalization for cross-runtime parity
 */

export interface SqliteHandle {
  query(sql: string, params?: unknown[]): { all(): Record<string, unknown>[] };
  close(): void;
}

/** Union of SQLite bindable types shared by Bun (`bun:sqlite`) and Node (`node:sqlite`) drivers. */
type SqliteBinding = string | number | bigint | boolean | Uint8Array | Buffer | null;

const connections = new Map<string, SqliteHandle>();

async function openSqlite(filePath: string): Promise<SqliteHandle> {
  // ── Bun native ────────────────────────────────────────────────────────
  if (typeof Bun !== "undefined") {
    // Standard dynamic import — "bun:sqlite" is in Vite's external config
    const { Database } = await import("bun:sqlite");
    const db = new Database(filePath, { readonly: false });

    return {
      query(sql: string, params: unknown[] = []) {
        // Normalize booleans for cross-runtime parity (Bun binds 1/0, Node throws)
        const safe = params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
        return {
          all() {
            // Bun's .query() handles its own statement caching internally
            return db.query(sql).all(...(safe as SqliteBinding[])) as Record<string, unknown>[];
          },
        };
      },
      close() {
        db.close();
      },
    };
  }

  // ── Node.js native ────────────────────────────────────────────────────
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(filePath);

  // Statement cache to match Bun's db.query() performance characteristics.
  // Without this, every call creates, compiles, executes, and discards a new
  // StatementSync — catastrophic under heavy CMS read/write load.
  const statementCache = new Map<string, ReturnType<typeof db.prepare>>();

  return {
    query(sql: string, params: unknown[] = []) {
      return {
        all() {
          let stmt = statementCache.get(sql);
          if (!stmt) {
            stmt = db.prepare(sql);
            statementCache.set(sql, stmt);
          }

          // Node.js SQLite throws TypeError on booleans; Bun binds them as 1/0.
          // Normalize for cross-runtime parity so queries behave identically.
          const safeParams = params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));

          return stmt.all(...(safeParams as SqliteBinding[])) as Record<string, unknown>[];
        },
      };
    },
    close() {
      statementCache.clear();
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
