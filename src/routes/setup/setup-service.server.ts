/**
 * @file src/routes/setup/setup-service.server.ts
 * @description
 * Server-side service isolating database creation and setup orchestration logic.
 * Promotes tree-shaking for SvelteKit server actions by lazy-loading database drivers
 * only when auto-creation is strictly required.
 *
 * Responsibilities include:
 * - Handling `DB_NOT_FOUND` errors and attempting auto-creation.
 * - Encapsulating heavy driver imports (`postgres`, `mysql2`) inside isolated async functions.
 */

import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { DatabaseConfig } from "@src/databases/schemas";
import { logger } from "@utils/logger.server";
import { buildDatabaseConnectionString, getSetupDatabaseAdapter } from "./utils";
import { SetupDatabaseError } from "./error-classifier";

/**
 * Tests database connection, and attempts to create the database if it doesn't exist
 * and `createIfMissing` is set.
 */
export async function testAndCreateDatabase(
  dbConfig: DatabaseConfig,
  createIfMissing: boolean,
): Promise<{ success: boolean; message?: string; latencyMs?: number; error?: string }> {
  const start = performance.now();

  try {
    logger.info(`🔌 Attempting to connect to ${dbConfig.type} at ${dbConfig.host}...`);
    const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, { createIfMissing });

    logger.info("📡 Connection established, sending ping...");
    const health = await dbAdapter.getConnectionHealth();

    if (!health.success) {
      logger.error("❌ Database ping failed:", health.message);
      await dbAdapter.disconnect();
      return { success: false, error: health.message || "Database ping failed" };
    }

    logger.info("✅ Ping successful!");
    await dbAdapter.disconnect();

    return {
      success: true,
      message: "Database connected successfully! ✨",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err: any) {
    const isMissing = err instanceof SetupDatabaseError && err.classification === "DB_NOT_FOUND";

    if (isMissing && createIfMissing) {
      try {
        logger.info("🛠 Attempting to create missing database:", dbConfig.name);
        if (dbConfig.type === "sqlite") {
          const dbPath = buildDatabaseConnectionString(dbConfig);
          mkdirSync(dirname(dbPath), { recursive: true });
        } else if (dbConfig.type === "postgresql") {
          const postgres = (await import("postgres")).default;
          const sql = postgres({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            database: "postgres",
          });
          await sql.unsafe(`CREATE DATABASE "${dbConfig.name}"`);
          await sql.end();
        } else if (dbConfig.type === "mariadb" || (dbConfig.type as any) === "mysql") {
          const mysql = await import("mysql2/promise");
          const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
          });
          await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.name}\``);
          await connection.end();
        }

        // Retry connection
        const retry = await getSetupDatabaseAdapter(dbConfig, { createIfMissing: true });
        await retry.dbAdapter.disconnect();
        return {
          success: true,
          message: "Database created and connected successfully! ✨",
          latencyMs: Math.round(performance.now() - start),
        };
      } catch (createErr: any) {
        logger.error("❌ Database creation failed:", createErr.message);
        return {
          success: false,
          error: "Could not create database: " + createErr.message,
        };
      }
    }

    if (err instanceof SetupDatabaseError) {
      return err.toClientPayload();
    }

    logger.error("❌ Database test failed critically:", err);
    return { success: false, error: err.message || String(err) };
  }
}
