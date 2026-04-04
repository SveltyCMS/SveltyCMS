/**
 * @file src/routes/setup/utils.ts
 * @description
 * Low-level utility engine for the SveltyCMS Setup Wizard.
 * Orchestrates database adapter life-cycles, connection validation, and technical error handling.
 *
 * Responsibilities include:
 * - Dynamic loading and initialization of database adapters during setup mode.
 * - Validating raw connection strings and configuration payloads.
 * - Implementing engine-specific connection health checks (MongoDB, SQL).
 * - Identifying and classifying technical dependencies (e.g., missing drivers).
 * - Providing a unified interface for database-agnostic operations during setup.
 *
 * ### Features:
 * - transient adapter factory patterns
 * - cross-engine connection verification
 * - structured error normalization
 * - driver availability heuristics
 * - server-side validation logic orchestration
 */

import type { IDBAdapter } from "@src/databases/db-interface";
import type { DatabaseConfig } from "@src/databases/schemas";
import { logger } from "@utils/logger.server";
import { SetupDatabaseError } from "./error-classifier";
import { classifyDatabaseError } from "./error-classifier";

/**
 * Internal helper to wrap any database error into a SetupDatabaseError.
 */
function toSetupError(err: unknown, config: DatabaseConfig): SetupDatabaseError {
  return SetupDatabaseError.fromError(err, (e) =>
    classifyDatabaseError(e, {
      host: config.host,
      name: config.name,
      isSrv: config.type === "mongodb+srv",
    }),
  );
}

/**
 * Database connection string builder for supported database types.
 */
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
  switch (config.type) {
    case "mongodb":
    case "mongodb+srv": {
      const isSrv = config.type === "mongodb+srv";
      const protocol = isSrv ? "mongodb+srv" : "mongodb";
      const port = isSrv || !config.port ? "" : `:${config.port}`;
      const user = config.user
        ? `${encodeURIComponent(config.user)}${config.password ? `:${encodeURIComponent(config.password)}` : ""}@`
        : "";
      let queryParams = "";
      if (isSrv) {
        queryParams = "retryWrites=true&w=majority";
      }
      // Add authSource if explicitly provided in config (or if we'll add it later in setup)
      if ((config as any).authSource) {
        queryParams += (queryParams ? "&" : "") + `authSource=${(config as any).authSource}`;
      }
      const finalParams = queryParams ? `?${queryParams}` : "";
      return `${protocol}://${user}${config.host}${port}/${config.name}${finalParams}`;
    }
    case "mariadb": {
      const port = config.port ? `:${config.port}` : ":3306";
      const hasCredentials = config.user && config.password;
      const user = hasCredentials
        ? `${encodeURIComponent(config.user!)}:${encodeURIComponent(config.password!)}@`
        : "";
      return `mysql://${user}${config.host}${port}/${config.name}`;
    }
    case "postgresql": {
      const port = config.port ? `:${config.port}` : ":5432";
      const hasCredentials = config.user && config.password;
      const user = hasCredentials
        ? `${encodeURIComponent(config.user!)}:${encodeURIComponent(config.password!)}@`
        : "";
      return `postgresql://${user}${config.host}${port}/${config.name}`;
    }
    case "sqlite": {
      // Standardize SQLite placement under config/database/ unless an absolute path is provided
      const name = config.name.endsWith(".sqlite") ? config.name : `${config.name}.sqlite`;
      if (config.host && (config.host.startsWith("/") || config.host.startsWith("C:"))) {
        const path = config.host.endsWith("/") ? config.host : `${config.host}/`;
        return `${path}${name}`;
      }
      return `config/database/${name}`;
    }
    default: {
      const EXHAUSTIVE_CHECK: never = config.type;
      throw new Error(`Unsupported database type: ${EXHAUSTIVE_CHECK}`);
    }
  }
}

/**
 * A centralized factory function to get a temporary, connected database adapter
 * for setup operations.
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
    // Only log sanitized connection string (without password)
    connectionStringPreview: connectionString.replace(/:[^:@]+@/, ":***@"),
  });

  // Handle TEST_MODE
  if (process.env.TEST_MODE === "true" && config.host === "mock-host") {
    const mockAdapter = {
      connect: async () => ({ success: true, data: undefined }),
      disconnect: async () => {},
      auth: { setupAuthModels: async () => {} },
      crud: { count: async () => 0 },
      getConnectionHealth: async () => ({
        success: true,
        data: { healthy: true, latency: 10, activeConnections: 1 },
      }),
    } as unknown as IDBAdapter;
    return { dbAdapter: mockAdapter, connectionString };
  }

  let dbAdapter: IDBAdapter;

  try {
    switch (config.type) {
      case "mongodb":
      case "mongodb+srv":
        dbAdapter = await setupMongoDB(config, connectionString, correlationId);
        break;
      case "mariadb":
        dbAdapter = await setupMariaDB(config, connectionString, correlationId);
        break;
      case "postgresql":
        dbAdapter = await setupPostgreSQL(config, connectionString, correlationId);
        break;
      case "sqlite":
        dbAdapter = await setupSQLite(config, connectionString, options, correlationId);
        break;
      default: {
        const EXHAUSTIVE_CHECK: never = config.type;
        throw new Error(`Database type '${EXHAUSTIVE_CHECK}' is not supported for setup.`);
      }
    }

    // Initialize models and interfaces for all domain modules
    if (dbAdapter.ensureAuth) await dbAdapter.ensureAuth();
    else if (dbAdapter.auth?.setupAuthModels) await dbAdapter.auth.setupAuthModels();

    if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();
    if (dbAdapter.ensureCollections) await dbAdapter.ensureCollections();
    if (dbAdapter.ensureMedia) await dbAdapter.ensureMedia();
    if (dbAdapter.ensureContent) await dbAdapter.ensureContent();
  } catch (err) {
    // If it's already a SetupDatabaseError, just rethrow
    if (err instanceof SetupDatabaseError) throw err;
    // Otherwise wrap it
    throw toSetupError(err, config);
  }

  logger.info(`✅ Successfully created and connected adapters for ${config.type}`, {
    correlationId,
  });
  return { dbAdapter, connectionString };
}

// Strategy: setup MongoDB adapter
async function setupMongoDB(
  config: DatabaseConfig,
  connectionString: string,
  correlationId: string,
): Promise<IDBAdapter> {
  const { MongoDBAdapter } = await import("@src/databases/mongodb/mongo-db-adapter");
  const dbAdapter = new MongoDBAdapter() as IDBAdapter;

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

  // Multi-phase Authentication Strategy
  // 1. Try as provided (default or user-specified authSource)
  // 2. Try authSource: "admin"
  // 3. Try authSource: [dbName]
  const authSourcesToTry = ["DEFAULT", "admin", config.name];
  let lastError: any = null;

  for (const source of authSourcesToTry) {
    try {
      if (source !== "DEFAULT") {
        logger.info(`🔄 Retrying MongoDB with authSource: ${source}...`, { correlationId });
        await dbAdapter.disconnect().catch(() => {});

        // Update config and rebuild connection string
        const retryConfig = { ...config, authSource: source } as any;
        connectionString = buildDatabaseConnectionString(retryConfig);
        connectionOptions.authSource = source;
      } else {
        logger.info("📡 Attempting initial MongoDB connection...", { correlationId });
      }

      const connectResult = await dbAdapter.connect(connectionString, connectionOptions);
      if (!connectResult.success) {
        lastError = connectResult.error;
        const classified = classifyDatabaseError(lastError);
        if (classified.classification === "AUTH_FAILED" && config.user) {
          continue; // Try next authSource
        }
        throw new SetupDatabaseError(classified, lastError);
      }

      // Verify connection with a probe
      const probeResult = await dbAdapter.crud.count(
        "system_content_structure",
        {},
        { silent: true },
      );
      if (probeResult.success) {
        logger.info(
          `✅ MongoDB connection successful (authSource: ${source === "DEFAULT" ? (config as any).authSource || "implicit" : source})`,
        );
        return dbAdapter;
      }

      const classifiedProbe = classifyDatabaseError(probeResult.error);
      if (classifiedProbe.classification === "AUTH_FAILED" && config.user) {
        lastError = probeResult.error;
        continue;
      }
      throw new SetupDatabaseError(classifiedProbe, probeResult.error);
    } catch (err) {
      if (err instanceof SetupDatabaseError) {
        if (err.classification === "AUTH_FAILED" && config.user) {
          lastError = err;
          continue;
        }
        throw err;
      }
      throw toSetupError(err, config);
    }
  }

  // If we reach here, all retries failed
  throw lastError instanceof SetupDatabaseError
    ? lastError
    : toSetupError(lastError || new Error("Authentication failed after all retries"), config);
}

// Strategy: setup MariaDB adapter
async function setupMariaDB(
  config: DatabaseConfig,
  connectionString: string,
  _correlationId: string,
): Promise<IDBAdapter> {
  const { MariaDBAdapter } = await import("@src/databases/mariadb/mariadb-adapter");
  const dbAdapter = new MariaDBAdapter() as IDBAdapter;

  const connectResult = await dbAdapter.connect(connectionString);
  if (!connectResult.success) {
    throw new SetupDatabaseError(
      classifyDatabaseError(connectResult.error, { host: config.host, name: config.name }),
      connectResult.error,
    );
  }

  const probeResult = await dbAdapter.crud.count("system_content_structure", {});
  if (!probeResult.success) {
    throw new SetupDatabaseError(
      classifyDatabaseError(probeResult.error, { host: config.host, name: config.name }),
      probeResult.error,
    );
  }

  return dbAdapter;
}

// Strategy: setup PostgreSQL adapter
async function setupPostgreSQL(
  config: DatabaseConfig,
  connectionString: string,
  _correlationId: string,
): Promise<IDBAdapter> {
  const { PostgreSQLAdapter } = await import("@src/databases/postgresql/postgres-adapter");
  const dbAdapter = new PostgreSQLAdapter() as IDBAdapter;

  const connectResult = await dbAdapter.connect(connectionString);
  if (!connectResult.success) {
    throw new SetupDatabaseError(
      classifyDatabaseError(connectResult.error, { host: config.host, name: config.name }),
      connectResult.error,
    );
  }

  const probeResult = await dbAdapter.crud.count("system_content_structure", {});
  if (!probeResult.success) {
    throw new SetupDatabaseError(
      classifyDatabaseError(probeResult.error, { host: config.host, name: config.name }),
      probeResult.error,
    );
  }
  return dbAdapter;
}

// Strategy: setup SQLite adapter
async function setupSQLite(
  config: DatabaseConfig,
  connectionString: string,
  options: { createIfMissing?: boolean },
  correlationId: string,
): Promise<IDBAdapter> {
  try {
    const { existsSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    if (!existsSync(connectionString)) {
      if (options.createIfMissing) {
        logger.info(`[setupSQLite] Creating missing SQLite database file: ${connectionString}`, {
          correlationId,
        });
        const dir = dirname(connectionString);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(connectionString, Buffer.alloc(0));
      } else {
        // Use the specific classification for DB missing
        throw new SetupDatabaseError({
          classification: "DB_NOT_FOUND",
          userFriendly: `SQLite database file "${config.name}" does not exist.`,
          hint: 'SveltyCMS can create the file for you automatically. Click "Yes, Create" in the confirmation dialog.',
          raw: "",
        });
      }
    }

    const { SQLiteAdapter } = await import("@src/databases/sqlite/sqlite-adapter");
    const dbAdapter = new SQLiteAdapter() as IDBAdapter;
    const connectResult = await dbAdapter.connect(connectionString);
    if (!connectResult.success) {
      throw new SetupDatabaseError(classifyDatabaseError(connectResult.error), connectResult.error);
    }
    return dbAdapter;
  } catch (err) {
    if (err instanceof SetupDatabaseError) throw err;
    throw toSetupError(err, config);
  }
}

// Probes for a local Redis server on port 6379.
export async function checkRedis(): Promise<boolean> {
  const { createClient } = await import("redis");
  const client = createClient({
    socket: { host: "localhost", port: 6379, connectTimeout: 1000 },
  });

  try {
    await client.connect();
    await client.ping();
    await client.quit();
    logger.info("🚀 Local Redis detected during setup probe");
    return true;
  } catch {
    return false;
  }
}

/**
 * Tests connection to a Redis server with provided credentials.
 */
export async function testRedisConnection(config: {
  host: string;
  port: number;
  password?: string;
}): Promise<{ success: boolean; message?: string }> {
  const { createClient } = await import("redis");
  const client = createClient({
    socket: { host: config.host, port: config.port, connectTimeout: 2000 },
    password: config.password || undefined,
  });

  try {
    client.on("error", (err) => logger.debug("Redis test connection error event:", err.message));
    await client.connect();
    await client.ping();
    await client.quit();
    return { success: true };
  } catch (error: any) {
    logger.error("Redis connection test failed:", error);
    // Wrap Redis errors too? We could use SetupDatabaseError but let's see.
    // For now just return the message as before but we'll integrate it into +page.server.ts
    return {
      success: false,
      message: error.message || "Could not connect to Redis",
    };
  }
}
