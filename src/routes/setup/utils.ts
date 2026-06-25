/**
 * @file src/routes/setup/utils.ts
 * @description Core utility functions for the setup process, including database connection helpers,
 * adapter factories, and validation logic.
 *
 * This file is part of the SveltyCMS setup wizard and handles low-level setup operations
 * such as building connection strings and initializing database adapters during the setup phase.
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import type { DatabaseConfig } from "@src/databases/schemas";
import { logger } from "@utils/logger";
import { createClient } from "redis";
import { resolveSqlitePath } from "@src/databases/config-state";

/**
 * Database connection string builder for supported database types.
 * Currently supports: MongoDB (standard and Atlas SRV), MariaDB
 * Future support planned: PostgreSQL
 */
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
  // Validate config
  switch (config.type) {
    case "mongodb":
    case "mongodb+srv": {
      const isSrv = config.type === "mongodb+srv";
      const protocol = isSrv ? "mongodb+srv" : "mongodb";
      const port = isSrv || !config.port ? "" : `:${config.port}`;

      // Check if username is provided
      const user = config.user
        ? `${encodeURIComponent(config.user)}${config.password ? `:${encodeURIComponent(config.password)}` : ""}@`
        : "";

      let queryParams = "";
      if (isSrv) {
        queryParams = "?retryWrites=true&w=majority";
      }

      // Logging happens in getSetupDatabaseAdapter with correlationId
      return `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;
    }
    case "mariadb": {
      // MariaDB connection string
      const port = config.port ? `:${config.port}` : ":3306";
      const hasCredentials = config.user && config.password;
      const user = hasCredentials
        ? `${encodeURIComponent(config.user!)}:${encodeURIComponent(config.password!)}@`
        : "";

      return `mysql://${user}${config.host}${port}/${config.name}`;
    }
    case "postgresql": {
      // PostgreSQL connection string
      const port = config.port ? `:${config.port}` : ":5432";
      const hasCredentials = config.user && config.password;
      const user = hasCredentials
        ? `${encodeURIComponent(config.user!)}:${encodeURIComponent(config.password!)}@`
        : "";

      return `postgresql://${user}${config.host}${port}/${config.name}`;
    }
    case "sqlite": {
      return resolveSqlitePath(config.host, config.name);
    }
    default: {
      // TypeScript ensures exhaustive checking - this should never be reached
      // but provides a helpful message if the schema is extended without updating this function
      const EXHAUSTIVE_CHECK: never = config.type;
      throw new Error(`Unsupported database type: ${EXHAUSTIVE_CHECK}`);
    }
  }
}

/**
 * A centralized factory function to get a temporary, connected database adapter
 * for setup operations. This is the core of the refactor.
 */

export async function getSetupDatabaseAdapter(
  config: DatabaseConfig,
  options: { createIfMissing?: boolean; skipModuleInit?: boolean } = {},
): Promise<{
  dbAdapter: IDBAdapter;
  connectionString: string;
}> {
  const correlationId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : (await import("node:crypto")).randomUUID();

  logger.info(`🔌 Connecting to ${config.type}...`);
  const connectionString = buildDatabaseConnectionString(config);

  let dbAdapter: IDBAdapter | undefined;

  try {
    switch (config.type) {
      case "mongodb":
      case "mongodb+srv": {
        const { MongoDBAdapter } = await import("@src/databases/mongodb/mongo-db-adapter");
        dbAdapter = new MongoDBAdapter() as unknown as IDBAdapter;

        if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
          logger.info("🛠️ Mocking MongoDB connection for setup in TEST_MODE");
          dbAdapter.connect = async () => ({ success: true, data: undefined });
          dbAdapter.auth.setupAuthModels = async () => {};
        } else {
          const connectionOptions: any = {
            serverSelectionTimeoutMS: 15_000,
            socketTimeoutMS: 45_000,
            maxPoolSize: 50,
            retryWrites: true,
            dbName: config.name,
          };
          if (config.user) {
            connectionOptions.user = config.user;
            if (config.password) connectionOptions.pass = config.password;
          }

          const connectResult = await dbAdapter.connect(connectionString, connectionOptions);
          if (!connectResult.success) {
            throw new Error(`Database connection failed: ${connectResult.error.message}`);
          }

          // Auth verification probe
          try {
            const mongoAdapter = dbAdapter as any;
            if (mongoAdapter.connection?.db) {
              const admin = mongoAdapter.connection.db.admin();
              const dbs = await admin.listDatabases();
              const existingDb = dbs.databases.find(
                (d: any) =>
                  d.name.toLowerCase() === config.name.toLowerCase() && d.name !== config.name,
              );
              if (existingDb) {
                throw new Error(
                  `db already exists with different case already have: [${existingDb.name}] trying to create [${config.name}]`,
                );
              }
            }
            await dbAdapter.crud.count("system_content_structure", {});
          } catch (probeErr: any) {
            const probeMsg = probeErr.message;
            if (probeMsg.includes("already exists with different case")) throw probeErr;
            logger.warn(`⚠️ Auth probe warning (non-fatal if DB is empty): ${probeMsg}`);
            if (
              probeMsg.toLowerCase().includes("authentication") ||
              probeMsg.toLowerCase().includes("unauthorized")
            ) {
              throw new Error(`Authentication failed: ${probeMsg}`);
            }
          }
        }
        break;
      }
      case "mariadb": {
        const { MariaDBAdapter } = await import("@src/databases/mariadb/mariadb-adapter");
        dbAdapter = new MariaDBAdapter() as unknown as IDBAdapter;

        if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
          logger.info("🛠️ Mocking MariaDB connection for setup in TEST_MODE");
          dbAdapter.connect = async () => ({ success: true, data: undefined });
          dbAdapter.auth.setupAuthModels = async () => {};
        } else {
          const connectResult = await dbAdapter.connect(connectionString);
          if (!connectResult.success) {
            throw new Error(`Database connection failed: ${connectResult.error?.message}`);
          }
        }
        break;
      }
      case "postgresql": {
        const { PostgreSQLAdapter } = await import("@src/databases/postgresql/postgres-adapter");
        dbAdapter = new PostgreSQLAdapter() as unknown as IDBAdapter;

        if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
          logger.info("🛠️ Mocking PostgreSQL connection for setup in TEST_MODE");
          dbAdapter.connect = async () => ({ success: true, data: undefined });
          dbAdapter.auth = { setupAuthModels: async () => {} } as any;
        } else {
          const connectResult = await dbAdapter.connect(connectionString);
          if (!connectResult.success) {
            throw new Error(`Database connection failed: ${connectResult.error?.message}`);
          }
        }
        break;
      }
      case "sqlite": {
        if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
          logger.info("🛠️ Mocking SQLite connection for setup in TEST_MODE");
          dbAdapter = {
            connect: async () => ({ success: true, data: undefined }),
            auth: { setupAuthModels: async () => {} },
          } as unknown as IDBAdapter;
        } else {
          const { existsSync } = await import("node:fs");
          if (!existsSync(connectionString) && !options.createIfMissing) {
            throw new Error(`SQLite database file "${connectionString}" does not exist.`);
          }
          const { SQLiteAdapter } = await import("@src/databases/sqlite/sqlite-adapter");
          dbAdapter = new SQLiteAdapter() as unknown as IDBAdapter;
          const connectResult = await dbAdapter.connect(connectionString);
          if (!connectResult.success) {
            throw new Error(connectResult.error?.message);
          }
        }
        break;
      }
      default: {
        const EXHAUSTIVE_CHECK: never = config.type;
        throw new Error(`Database type '${EXHAUSTIVE_CHECK}' is not supported.`);
      }
    }

    logger.info(`✅ Database connected: ${config.type}`);

    // Initialize all database modules (skip during connection test to avoid
    // populating the DB before isEmpty() check)
    if (!options.skipModuleInit) {
      if (dbAdapter.ensureAuth) {
        logger.info("🛠️ Step 1: Initializing Auth module...");
        await dbAdapter.ensureAuth();
      }
      if (dbAdapter.ensureSystem) {
        logger.info("🛠️ Step 2: Initializing System module...");
        await dbAdapter.ensureSystem();
      }
      if (dbAdapter.ensureCollections) {
        logger.info("🛠️ Step 3: Initializing Collections module...");
        await dbAdapter.ensureCollections();
      }
      if (dbAdapter.ensureContent) {
        logger.info("🛠️ Step 4: Initializing Content module...");
        await dbAdapter.ensureContent();
      }
      if (dbAdapter.auth?.setupAuthModels) {
        await dbAdapter.auth.setupAuthModels();
      }
    }

    return { dbAdapter: dbAdapter!, connectionString };
  } catch (err: any) {
    logger.error(`getSetupDatabaseAdapter failed: ${err.message}`, {
      correlationId,
    });
    if (dbAdapter)
      await dbAdapter.disconnect().catch(() => {
        logger.debug("DB adapter disconnect failed during setup error");
      });
    throw new Error(
      `Module initialization failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}

/**
 * Probes for a local Redis server on port 6379.
 * Used to suggest performance optimizations to the user during setup.
 */
export async function checkRedis(): Promise<boolean> {
  const client = createClient({
    socket: {
      host: "localhost",
      port: 6379,
      connectTimeout: 1000,
    },
  });

  try {
    await client.connect();
    await client.ping();
    await client.destroy();
    logger.info("🚀 Local Redis detected during setup probe");
    return true;
  } catch {
    // Redis not available - silent failure, it's just a probe
    return false;
  }
}
