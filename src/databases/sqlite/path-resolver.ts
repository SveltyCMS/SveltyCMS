/**
 * @file src/databases/sqlite/path-resolver.ts
 * @description SQLite database path and config resolution helpers.
 *
 * Features:
 * - Isolation guard ensuring test/harness databases never land in live config/database/
 * - Extension canonicalization for .sqlite files
 * - Best-effort directory creation
 * - Fail-closed enforcement for missing DB_NAME under test harnesses
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";
import { resolveSqlitePath } from "../config-state";
import { isIsolatedTestDbName } from "@utils/test-db-safety";
import { isSetupComplete } from "@utils/setup-check-fast";
export type SQLiteConfig = {
  connectionString?: string;
  readonly?: boolean;
  host?: string;
  DB_NAME?: string;
  name?: string;
};

/**
 * Resolves the physical database path for SQLite connections, enforcing
 * test isolation, directory creation, and URI rejection.
 */
export async function resolveSqliteAdapterPath(config: string | SQLiteConfig): Promise<string> {
  let dbPath = typeof config === "string" ? config : config.connectionString;

  // Host may be a direct SQLite file path (test bridge passes host=auditFile
  // in db.ts when no config file exists yet).
  if (!dbPath && config && typeof config === "object") {
    const rawConfig = config as Record<string, unknown>;
    const host = rawConfig.host;
    if (
      typeof host === "string" &&
      host &&
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      !host.includes("://")
    ) {
      const name =
        (rawConfig.DB_NAME as string | undefined) || (rawConfig.name as string | undefined);
      if (host.endsWith(".sqlite") || host.endsWith(".db") || host.endsWith(":memory:")) {
        dbPath = host;
      } else if (name) {
        dbPath = resolveSqlitePath(host, name);
      }
    }
  }

  // 🛡️ ISOLATION GUARD: Isolated test/harness DBs must never land in config/database/
  if (dbPath && typeof dbPath === "string") {
    const normalized = dbPath.replace(/\\/g, "/");
    if (normalized.startsWith("config/database/") || normalized.includes("/config/database/")) {
      const baseName = nodePath.basename(normalized);
      const logicalName = baseName.replace(/-(wal|shm)$/i, "").replace(/\.(sqlite|db)$/i, "");
      if (isIsolatedTestDbName(logicalName)) {
        const finalName =
          baseName.endsWith(".sqlite") || baseName.endsWith(".db")
            ? baseName
            : `${baseName}.sqlite`;
        try {
          fs.mkdirSync(nodePath.join(process.cwd(), "config", "test-database"), {
            recursive: true,
          });
        } catch {
          /* best-effort */
        }
        dbPath = `config/test-database/${finalName}`;
      }
    }
  }

  if (!dbPath) {
    const isTestHarness =
      process.env.TEST_MODE === "true" ||
      process.env.VITEST === "true" ||
      process.env.BUN_TEST === "true" ||
      process.env.BENCHMARK === "true";
    const rawConfig =
      typeof config === "object" && config ? (config as Record<string, unknown>) : undefined;
    const rawDbName = (rawConfig?.DB_NAME as string | undefined) || process.env.DB_NAME;
    const dbName =
      rawDbName &&
      !rawDbName.endsWith(".sqlite") &&
      !rawDbName.endsWith(".db") &&
      !rawDbName.endsWith(":memory:")
        ? `${rawDbName}.sqlite`
        : rawDbName;
    const isTestDb =
      isTestHarness || (dbName && (dbName.includes("test") || dbName.includes("benchmark")));
    const defaultDbFolder = isTestDb ? "config/test-database" : "config/database";

    if (isTestHarness && !dbName) {
      throw new Error(
        `[SQLite] Refused to connect without DB_NAME in test/benchmark mode. ` +
          `Pass DB_NAME (or set DB_PATH) explicitly so tests never use the live ` +
          `default file. Received config: ${JSON.stringify(config)}`,
      );
    }

    dbPath =
      process.env.DB_PATH ||
      (dbName
        ? `${defaultDbFolder}/${dbName}`
        : isSetupComplete()
          ? `${defaultDbFolder}/sveltycms.db`
          : ":memory:");
  }

  if (dbPath.includes("://")) {
    throw new Error(
      `Invalid SQLite path: '${dbPath}' looks like a URI. Check your DB configuration.`,
    );
  }

  if (dbPath !== ":memory:" && !nodePath.isAbsolute(dbPath) && !dbPath.startsWith("file:")) {
    dbPath = nodePath.resolve(process.cwd(), dbPath);
  }

  const dir = nodePath.dirname(dbPath.replace("file:///", ""));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dbPath;
}
