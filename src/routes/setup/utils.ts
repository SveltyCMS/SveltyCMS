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
  options: { createIfMissing?: boolean } = {},
): Promise<{
  dbAdapter: IDBAdapter;
  connectionString: string;
}> {
  const correlationId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : (await import("node:crypto")).randomUUID();
  logger.info(`Creating setup database adapter for ${config.type}`, {
    correlationId,
  });

  const connectionString = buildDatabaseConnectionString(config);
  logger.info(`Connection string built for ${config.type}`, {
    correlationId,
    host: config.host,
    port: config.port,
    name: config.name,
    hasUser: !!config.user,
    hasPassword: !!config.password,
    // Only log sanitized connection string (without password)
    connectionStringPreview: connectionString.replace(/:[^:@]+@/, ":***@"),
  });

  let dbAdapter: IDBAdapter;

  switch (config.type) {
    case "mongodb":
    case "mongodb+srv": {
      // Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
      if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
        logger.info("🛠️ Mocking DB connection for setup in TEST_MODE");
        const { MongoDBAdapter } = await import("@src/databases/mongodb/mongo-db-adapter");
        dbAdapter = new MongoDBAdapter() as unknown as IDBAdapter;

        // Mock the connect method to return success
        dbAdapter.connect = async () => ({ success: true, data: undefined });
        // Mock the auth setup to do nothing
        dbAdapter.auth.setupAuthModels = async () => {};

        return { dbAdapter, connectionString };
      }

      const { MongoDBAdapter } = await import("@src/databases/mongodb/mongo-db-adapter");
      dbAdapter = new MongoDBAdapter() as unknown as IDBAdapter;

      // Prepare connection options for MongoDB
      const connectionOptions: any = {
        serverSelectionTimeoutMS: 15_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 50, // Increased to handle parallel seeding
        retryWrites: true,
        dbName: config.name,
      };

      if (config.user) {
        connectionOptions.user = config.user;
        if (config.password) {
          connectionOptions.pass = config.password;
        }
      }

      try {
        const connectResult = await dbAdapter.connect(connectionString, connectionOptions);
        if (!connectResult.success) {
          logger.error(`MongoDB connection failed: ${connectResult.error.message}`, {
            correlationId,
          });
          throw new Error(`Database connection failed: ${connectResult.error.message}`);
        }

        // VERIFICATION PROBE: MongoDB connection might succeed but fail on first CRUD if auth is wrong
        logger.info("Running authentication verification probe...", { correlationId });
        try {
          // Robust check for case sensitivity on Windows/macOS:
          // We list all databases and check if one with the same name (but different case) exists.
          const mongoAdapter = dbAdapter as any;
          if (mongoAdapter.connection?.db) {
            const admin = mongoAdapter.connection.db.admin();
            const dbs = await admin.listDatabases();
            const existingDb = dbs.databases.find(
              (d: any) =>
                d.name.toLowerCase() === config.name.toLowerCase() && d.name !== config.name,
            );
            if (existingDb) {
              logger.error(
                `❌ Case mismatch detected: Entered '${config.name}', but server already has '${existingDb.name}'`,
                { correlationId },
              );
              // This specific message format is recognized by the error classifier
              throw new Error(
                `db already exists with different case already have: [${existingDb.name}] trying to create [${config.name}]`,
              );
            }
          }

          // We try to list collections - this requires 'admin' or specific DB permissions
          // If this fails with "Command find requires authentication", we know auth is wrong
          await dbAdapter.crud.count("system_content_structure", {});
          logger.info("✅ Authentication verification probe successful", { correlationId });
        } catch (probeErr: any) {
          const probeMsg = probeErr.message || String(probeErr);
          if (probeMsg.includes("already exists with different case")) {
            logger.error(`❌ Case mismatch detected during probe: ${probeMsg}`, { correlationId });
            throw probeErr; // Re-throw to fail the connection test
          }

          logger.warn(`⚠️ Auth probe warning (non-fatal if DB is empty): ${probeMsg}`, {
            correlationId,
          });
          if (
            probeMsg.toLowerCase().includes("authentication") ||
            probeMsg.toLowerCase().includes("unauthorized")
          ) {
            throw new Error(`Authentication failed: ${probeMsg}`);
          }
        }
      } catch (err: any) {
        logger.error(`MongoDB adapter connect threw: ${err.message}`, {
          correlationId,
        });
        throw err;
      }

      break;
    }
    case "mariadb": {
      // Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
      if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
        logger.info("🛠️ Mocking MariaDB connection for setup in TEST_MODE");
        const { MariaDBAdapter } = await import("@src/databases/mariadb/mariadb-adapter");
        dbAdapter = new MariaDBAdapter() as unknown as IDBAdapter;

        // Mock the connect method to return success
        dbAdapter.connect = async () => ({ success: true, data: undefined });
        // Mock the auth setup to do nothing
        dbAdapter.auth.setupAuthModels = async () => {};

        return { dbAdapter, connectionString };
      }

      const { MariaDBAdapter } = await import("@src/databases/mariadb/mariadb-adapter");
      dbAdapter = new MariaDBAdapter() as unknown as IDBAdapter;

      const connectResult = await dbAdapter.connect(connectionString);
      if (!connectResult.success) {
        logger.error(`MariaDB connection failed: ${connectResult.error?.message}`, {
          correlationId,
        });
        throw new Error(`Database connection failed: ${connectResult.error?.message}`);
      }

      break;
    }
    case "postgresql": {
      // Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
      if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
        logger.info("🛠️ Mocking PostgreSQL connection for setup in TEST_MODE");
        const { PostgreSQLAdapter } = await import("@src/databases/postgresql/postgres-adapter");
        dbAdapter = new PostgreSQLAdapter() as unknown as IDBAdapter;

        // Mock the connect method to return success
        dbAdapter.connect = async () => ({ success: true, data: undefined });
        // Mock the auth setup to do nothing
        dbAdapter.auth = {
          setupAuthModels: async () => {},
        } as IDBAdapter["auth"];

        return { dbAdapter, connectionString };
      }

      const { PostgreSQLAdapter } = await import("@src/databases/postgresql/postgres-adapter");
      dbAdapter = new PostgreSQLAdapter() as unknown as IDBAdapter;

      const connectResult = await dbAdapter.connect(connectionString);
      if (!connectResult.success) {
        logger.error(`PostgreSQL connection failed: ${connectResult.error?.message}`, {
          correlationId,
        });
        throw new Error(`Database connection failed: ${connectResult.error?.message}`);
      }

      break;
    }
    case "sqlite": {
      // Mock success in TEST_MODE if host is 'mock-host' for UI audit
      if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
        logger.info("🛠️ Mocking SQLite connection for setup in TEST_MODE");
        // We'll create the folder/file in execution block below
        return {
          dbAdapter: {
            connect: async () => ({ success: true, data: undefined }),
            auth: { setupAuthModels: async () => {} },
          } as unknown as IDBAdapter,
          connectionString,
        };
      }

      // For SQLite during setup, we'll try to import a minimal adapter if it exists
      // or just return a dummy if we are just testing connection in Wizard
      try {
        const { existsSync } = await import("node:fs");
        if (
          !existsSync(connectionString) &&
          process.env.TEST_MODE !== "true" &&
          !options.createIfMissing
        ) {
          throw new Error(
            `SQLite database file "${connectionString}" does not exist. Create it now?`,
          );
        }

        const { SQLiteAdapter } = await import("@src/databases/sqlite/sqlite-adapter");
        dbAdapter = new SQLiteAdapter() as unknown as IDBAdapter;
        const connectResult = await dbAdapter.connect(connectionString);
        if (!connectResult.success) {
          throw new Error(connectResult.error?.message);
        }
      } catch (err: any) {
        logger.error(`SQLite connection failed: ${err.message}`, {
          correlationId,
        });
        throw new Error(`SQLite Connection failed: ${err.message}`);
      }

      break;
    }
    default: {
      // TypeScript ensures exhaustive checking - this should never be reached
      const EXHAUSTIVE_CHECK: never = config.type;
      logger.error(`Unsupported database type: ${EXHAUSTIVE_CHECK}`, {
        correlationId,
      });
      throw new Error(
        `Database type '${EXHAUSTIVE_CHECK}' is not supported for setup. Supported types: mongodb, mongodb+srv, mariadb, postgresql`,
      );
    }
  }

  // Initialize all database modules with error handling
  try {
    // Ensure all required modules are initialized before returning
    if (dbAdapter.ensureAuth) await dbAdapter.ensureAuth();
    if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();
    if (dbAdapter.ensureContent) await dbAdapter.ensureContent();
    if (dbAdapter.ensureCollections) await dbAdapter.ensureCollections();

    // Fallback for adapters that might not implement ensureAuth (legacy)
    if (!dbAdapter.ensureAuth && dbAdapter.auth?.setupAuthModels) {
      await dbAdapter.auth.setupAuthModels();
    }
  } catch (err) {
    logger.error(
      `Module initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      { correlationId },
    );
    await dbAdapter.disconnect();
    throw new Error(
      `Module initialization failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }

  logger.info(`✅ Successfully created and connected adapters for ${config.type}`, {
    correlationId,
  });
  return { dbAdapter, connectionString };
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
    await client.quit();
    logger.info("🚀 Local Redis detected during setup probe");
    return true;
  } catch {
    // Redis not available - silent failure, it's just a probe
    return false;
  }
}
