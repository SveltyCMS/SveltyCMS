/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import { exec } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { version as pkgVersion } from "../../../package.json";
import { databaseConfigSchema } from "@src/databases/schemas";
import { logger } from "@utils/logger";
import { safeParse } from "valibot";
import nodemailer from "nodemailer";
import { setupAdminSchema, smtpConfigSchema } from "@utils/schemas";
import type { ISODateString } from "@src/databases/db-interface";
import type { Actions, PageServerLoad } from "./$types";
import { checkRedis } from "./utils";

const execAsync = promisify(exec);

// Database driver mapping (MongoDB is default, others are optional)
const DRIVER_PACKAGES = {
  mongodb: "mongoose",
  "mongodb+srv": "mongoose",
  postgresql: "postgres",
  mysql: "mysql2",
  mariadb: "mysql2",
  sqlite: "bun:sqlite",
} as const;

type DatabaseType = keyof typeof DRIVER_PACKAGES;

// Import inlang settings directly (TypeScript/SvelteKit handles JSON imports)
import inlangSettings from "../../../project.inlang/settings.json";

export const load: PageServerLoad = async ({ locals, cookies }) => {
  // --- SECURITY ---
  // Note: The handleSetup middleware already checks if setup is complete
  // and blocks access to /setup routes if config has valid values.

  // Clear any existing session cookies to ensure fresh start
  // This prevents issues when doing a fresh database setup
  const { SESSION_COOKIE_NAME } = await import("@src/databases/auth/constants");
  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });

  // Get available system languages from inlang settings (direct import, no parsing needed)
  const availableLanguages: string[] = inlangSettings.locales || ["en", "de"];

  // pass theme data and PKG_VERSION from server to client
  return {
    theme: locals.theme,
    darkMode: locals.darkMode,
    availableLanguages, // Pass the languages from settings.json
    redisAvailable: await checkRedis(),
    settings: {
      PKG_VERSION: pkgVersion,
    },
  };
};

/**
 * ACTIONS
 * Standard SvelteKit 5 actions for setup operations
 */
export const actions: Actions = {
  /**
   * Tests the database connection
   */
  testDatabase: async ({ request }) => {
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info("🚀 Action: VerifyDatabaseConfig starting...");
    }
    try {
      const formData = await request.formData();
      const configRaw = formData.get("config") as string;
      const createIfMissing = formData.get("createIfMissing") === "true";
      const allowOverwrite = formData.get("allowOverwrite") === "true";

      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info("📦 [testDatabase] Received config raw:", {
          exists: !!configRaw,
          length: configRaw?.length,
          isLiteralUndefined: configRaw === "undefined",
          isLiteralNull: configRaw === "null",
          value: configRaw?.slice(0, 100),
        });
      }

      if (!configRaw || configRaw === "undefined") {
        logger.error("❌ [testDatabase] No valid config data provided in form");
        return { success: false, error: "No configuration data provided" };
      }

      let configData;
      try {
        configData = JSON.parse(configRaw);
      } catch (err: any) {
        logger.error("❌ [testDatabase] JSON.parse failed:", {
          error: err.message,
          raw: configRaw,
        });
        return { success: false, error: `Invalid configuration format: ${err.message}` };
      }

      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info("🔍 [testDatabase] Parsed config for type:", configData?.type);
      }

      // Coerce port to number for validation
      if (configData && (configData.port === "" || configData.port === null)) {
        configData.port = undefined;
      } else if (configData && configData.port !== undefined) {
        const portNum = Number(configData.port);
        if (!Number.isNaN(portNum)) {
          configData.port = portNum;
        }
      }

      const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
      if (!(success && dbConfig)) {
        logger.error("❌ Action: Validation failed", { issues });
        return {
          success: false,
          error: "Invalid configuration",
          details: issues,
        };
      }

      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info("✅ Action: Configuration validated successfully");
      }

      const start = performance.now();
      const { getSetupDatabaseAdapter } = await import("./utils");

      const dropDatabase = async (targetName: string) => {
        logger.info(`🚨 Attempting to drop database '${targetName}'...`);
        // 🚨 Hardening for Benchmarks: Disconnect active adapter to release handles/sessions
        try {
          const { getDb } = await import("@src/databases/db");
          const adapter = getDb();
          const isRelational =
            dbConfig.type.includes("postgres") ||
            dbConfig.type.includes("mariadb") ||
            dbConfig.type === "sqlite";
          logger.info(
            `[dropDatabase] Adapter found: ${!!adapter}, Type: ${dbConfig.type}, isRelational: ${isRelational}`,
          );
          if (adapter && isRelational) {
            logger.info(`Disconnecting active adapter to release ${dbConfig.type} sessions...`);
            await adapter.disconnect();
            // wait for sessions to clear
            await new Promise((r) => setTimeout(r, 800));
          }
        } catch (err: any) {
          logger.warn(
            "[dropDatabase] Failed to disconnect active adapter (ignoring):",
            err.message,
          );
        }

        if (dbConfig.type === "mongodb" || dbConfig.type === "mongodb+srv") {
          const mongoose = (await import("mongoose")).default;
          const uri = configData.host.includes("://")
            ? configData.host
            : `mongodb://${configData.user ? `${configData.user}:${configData.password}@` : ""}${configData.host}:${configData.port || 27017}/${targetName}`;
          const conn = await mongoose.createConnection(uri).asPromise();
          await conn.dropDatabase();
          await conn.close();
        } else if (dbConfig.type === "mariadb" || (dbConfig.type as any) === "mysql") {
          const mysql = await import("mysql2/promise");
          const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
          });
          await connection.query(`DROP DATABASE IF EXISTS \`${targetName}\``);
          await connection.end();
        } else if (dbConfig.type === "postgresql") {
          const postgres = (await import("postgres")).default;
          const sql = postgres({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            database: "postgres",
          });
          // Try WITH (FORCE) first (PostgreSQL 13+), fall back to standard if it fails
          // Kill any other active sessions to this database
          try {
            // 1. Prevent new connections
            await sql
              .unsafe(`ALTER DATABASE "${targetName}" WITH ALLOW_CONNECTIONS false`)
              .catch(() => {});

            // 2. Terminate existing sessions
            await sql
              .unsafe(`
              SELECT pg_terminate_backend(pid)
              FROM pg_stat_activity
              WHERE datname = '${targetName}' AND pid <> pg_backend_pid()
            `)
              .catch(() => {});

            // Small delay to allow sessions to terminate
            await new Promise((r) => setTimeout(r, 500));
          } catch (err: any) {
            logger.debug(`PostgreSQL: session termination failed (ignoring): ${err.message}`);
          }

          // 3. Drop the database
          try {
            await sql.unsafe(`DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`);
          } catch {
            await sql.unsafe(`DROP DATABASE IF EXISTS "${targetName}"`);
          }
          await sql.end();
        } else if (dbConfig.type === "sqlite") {
          const { buildDatabaseConnectionString } = await import("./utils");
          const dbPath = buildDatabaseConnectionString(dbConfig);
          const fs = await import("node:fs");
          if (fs.existsSync(dbPath)) {
            // Retry loop for unlinking (resilience against Windows EBUSY)
            let attempts = 0;
            while (attempts < 5) {
              try {
                fs.unlinkSync(dbPath);
                logger.info(`✅ Successfully dropped SQLite database: ${dbPath}`);
                break;
              } catch (e: any) {
                attempts++;
                if (attempts >= 5) throw e;
                logger.warn(`⚠️ SQLite file busy, retrying in 500ms (Attempt ${attempts}/5)...`);
                await new Promise((r) => setTimeout(r, 500));
              }
            }
          }
        }
        logger.info(`✅ Successfully dropped database '${targetName}'.`);
      };

      if (allowOverwrite) {
        try {
          await dropDatabase(dbConfig.name);
          // Auto-create after dropping will be handled by passing allowOverwrite
        } catch (dropErr: any) {
          logger.error("❌ Failed to drop database for overwrite:", dropErr.message);
          return {
            success: false,
            error: `Overwrite failed: Could not drop database. ${dropErr.message}`,
          };
        }
      }

      try {
        logger.info(`🔌 Attempting to connect to ${dbConfig.type} at ${dbConfig.host}...`);

        // --- SQLite  Check if file exists BEFORE connection ---
        // getSetupDatabaseAdapter for SQLite runs migrations/seeds, which makes isEmpty() return false.
        // We track if it existed before so we can skip the "not empty" check for fresh databases.
        let sqliteFileExisted = false;
        if (dbConfig.type === "sqlite") {
          const { buildDatabaseConnectionString } = await import("./utils");
          const dbPath = buildDatabaseConnectionString(dbConfig);
          sqliteFileExisted = existsSync(dbPath);
          logger.debug(`[testDatabase] SQLite file exists: ${sqliteFileExisted} (${dbPath})`);
        }

        const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
          createIfMissing: createIfMissing || allowOverwrite || dbConfig.type === "sqlite",
        });

        logger.info("📡 Connection established, sending ping...");
        const health = await dbAdapter.getConnectionHealth();

        if (!health.success) {
          logger.error("❌ Database ping failed:", health.message);
          await dbAdapter.disconnect();
          const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
          const classified = classifyDatabaseError(health.message, dbConfig.type as any, dbConfig);
          return new SetupDatabaseError(classified).toClientPayload();
        }

        logger.info("✅ Ping successful!");

        // Check if database is empty - setup should ideally be on a fresh DB
        // SKIP check for freshly created SQLite databases (they contain migrations/seeds already)
        // Also skip if we are in the middle of a setup (no private.ts yet) and we just created this file.
        const skipEmptyCheck = dbConfig.type === "sqlite";

        if (!skipEmptyCheck) {
          const isEmptyRes = await dbAdapter.isEmpty();
          if (isEmptyRes.success && !isEmptyRes.data && !allowOverwrite) {
            logger.warn(
              `⚠️ Database '${dbConfig.name}' is not empty. Blocking until overwrite confirmed.`,
            );
            await dbAdapter.disconnect();

            const { classifyDatabaseError, SetupDatabaseError } =
              await import("./error-classifier");
            const classified = classifyDatabaseError(
              new Error("Database is not empty"),
              dbConfig.type as any,
              dbConfig,
            );
            return new SetupDatabaseError(classified).toClientPayload();
          }
        }

        await dbAdapter.disconnect();
        const latencyMs = Math.round(performance.now() - start);
        return {
          success: true,
          message: "Database connected successfully! ✨",
          latencyMs,
        };
      } catch (err: any) {
        logger.error("❌ Connection attempt failed:", err.message, err.code);

        const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
        const classified = classifyDatabaseError(err, dbConfig.type as any, dbConfig);

        // --- Handle Overwrite (Confirm Overwrite flow) ---
        if (classified.classification === "CASE_MISMATCH" && allowOverwrite) {
          try {
            const existingName = (classified.details as any)?.existingName;
            if (existingName) {
              await dropDatabase(existingName);
              // Now that it's dropped, we can proceed as if it was a "not found" scenario
              // and let the existing retry logic below handle creation.
            }
          } catch (dropErr: any) {
            return {
              success: false,
              error: `Overwrite failed: Could not drop existing database. ${dropErr.message}`,
            };
          }
        }

        // If DB doesn't exist and we didn't auto-create, return a structured payload
        if (classified.classification === "DB_NOT_FOUND" && !createIfMissing) {
          return new SetupDatabaseError(classified, err).toClientPayload();
        }

        // Handle SQLite/SQL "database does not exist" for auto-creation
        if (
          (err.message?.includes("does not exist") ||
            err.message?.includes("Unknown database") ||
            err.code === "ER_BAD_DB_ERROR" ||
            err.code === "3D000") &&
          createIfMissing
        ) {
          try {
            logger.info("🛠 Attempting to create missing database:", dbConfig.name);
            if (dbConfig.type === "sqlite") {
              const { buildDatabaseConnectionString } = await import("./utils");
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

            // Add a small delay to allow the database engine to fully register the new database
            await new Promise((r) => setTimeout(r, 500));

            // Retry connection now that DB/file exists
            const retry = await getSetupDatabaseAdapter(dbConfig, {
              createIfMissing: true,
            });
            const health = await retry.dbAdapter.getConnectionHealth();
            if (health.success) {
              await retry.dbAdapter.disconnect();
              return {
                success: true,
                message: "Database created and connected successfully! ✨",
                latencyMs: Math.round(performance.now() - start),
              };
            } else {
              throw new Error(health.message || "Connection health check failed after creation.");
            }
          } catch (createErr: any) {
            logger.error("❌ Database creation failed:", createErr.message);
            return {
              success: false,
              error: "Could not create database: " + createErr.message,
            };
          }
        }

        // For all other errors (including CASE_MISMATCH), return classified payload
        return new SetupDatabaseError(classified, err).toClientPayload();
      }
    } catch (err: any) {
      logger.error("❌ Database test failed critically:", err);
      return { success: false, error: err.message || String(err) };
    }
  },
  /**
   * Test Redis connection
   */
  testRedis: async ({ request }) => {
    logger.info("🚀 Action: testRedis called");
    const formData = await request.formData();
    const host = (formData.get("host") as string) || "localhost";
    const port = Number.parseInt((formData.get("port") as string) || "6379", 10);
    const password = formData.get("security") as string;

    const start = performance.now();
    const { createClient } = await import("redis");
    const client = createClient({
      socket: {
        host,
        port,
        connectTimeout: 5000,
      },
      password: password || undefined,
    });

    try {
      await client.connect();
      await client.ping();
      const latency = Math.round(performance.now() - start);
      await client.quit();

      logger.info(`✅ Redis test successful at ${host}:${port} (${latency}ms)`);
      return {
        success: true,
        message: "Redis connection successful!",
        latencyMs: latency,
      };
    } catch (err: any) {
      logger.error(`❌ Redis test failed at ${host}:${port}:`, err.message);
      return {
        success: false,
        error: `Redis connection failed: ${err.message}`,
        classification: "REDIS_CONNECTION_ERROR",
      };
    }
  },

  /**
   * Seeds the database
   */
  seedDatabase: async ({ request }) => {
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info("🚀 Action: seedDatabase called");
    }
    const formData = await request.formData();
    const configRaw = formData.get("config") as string;
    const systemRaw = formData.get("system") as string;

    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info("📦 [seedDatabase] Received raw data:", {
        configExists: !!configRaw,
        configIsUndefined: configRaw === "undefined",
        systemExists: !!systemRaw,
        systemIsUndefined: systemRaw === "undefined",
      });
    }

    if (!configRaw || configRaw === "undefined") {
      logger.error("❌ [seedDatabase] No valid config data provided");
      return { success: false, error: "No configuration data provided" };
    }

    let configData;
    try {
      configData = JSON.parse(configRaw);
    } catch (err: any) {
      logger.error("❌ [seedDatabase] JSON.parse(config) failed:", {
        error: err.message,
        raw: configRaw,
      });
      return { success: false, error: `Invalid configuration format: ${err.message}` };
    }

    let systemData: any = {};
    if (systemRaw && systemRaw !== "undefined") {
      try {
        systemData = JSON.parse(systemRaw);
      } catch (err: any) {
        logger.error("❌ [seedDatabase] JSON.parse(system) failed:", {
          error: err.message,
          raw: systemRaw,
        });
        // Non-fatal, but good to know
      }
    }

    // Coerce port to number for validation
    if (configData && (configData.port === "" || configData.port === null)) {
      configData.port = undefined;
    } else if (configData && configData.port !== undefined) {
      const portNum = Number(configData.port);
      if (!Number.isNaN(portNum)) {
        configData.port = portNum;
      }
    }

    const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
    if (!(success && dbConfig)) {
      logger.error("❌ Action: seedDatabase Validation failed", { issues });
      return {
        success: false,
        error: "Invalid configuration",
        details: issues,
      };
    }

    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info("DEBUG: [seedDatabase] dbConfig details:", {
        type: dbConfig.type,
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.name,
        hasUser: !!dbConfig.user,
        hasPassword: !!dbConfig.password,
        userLength: dbConfig.user?.length,
        passLength: dbConfig.password?.length,
      });
    }

    try {
      // 0. Copy Preset Files Before Anything compile triggers
      if (systemData.preset && systemData.preset !== "blank") {
        logger.info(`✨ Copying preset files for: ${systemData.preset}`);
        try {
          const sourceDir = resolve(process.cwd(), "src", "presets", systemData.preset);
          const targetDir = resolve(process.cwd(), "config", "collections");

          if (existsSync(sourceDir)) {
            // Copy recursive
            cpSync(sourceDir, targetDir, { recursive: true, force: true });
            logger.info(`✅ Copied preset ${systemData.preset} to config/collections`);

            // Force compilation of new preset files
            try {
              const mod: any = await import("@utils/compilation/compile");
              const compileFn = mod.compile || mod.default?.compile || mod.default || mod;
              if (typeof compileFn === "function") {
                await compileFn();
                logger.info(`✅ Compiled preset collections successfully`);
              } else {
                logger.warn("⚠️ compile function not found in @utils/compilation/compile", {
                  type: typeof compileFn,
                });
              }
            } catch (e) {
              logger.error(`❌ Failed to compile newly copied preset files`, e);
            }
          } else {
            logger.warn(`⚠️ Preset directory not found: ${sourceDir}`);
          }
        } catch (presetError) {
          logger.error("Failed to copy preset files:", presetError);
          // Non-fatal, continue with DB setup
        }
      }

      // 1. Write Private Config (Bootstrap)
      // We do this immediately so the system has a valid config/private.ts
      try {
        const { writePrivateConfig } = await import("./write-private-config");
        await writePrivateConfig(dbConfig, {
          multiTenant: systemData.multiTenant,
          demoMode: systemData.demoMode,
        });
        logger.info("✅ [seedDatabase] Private configuration written successfully");
      } catch (configError) {
        logger.error("❌ [seedDatabase] Failed to write private config:", configError);
        // Non-fatal if seeding can still proceed, but usually indicates FS issues
      }

      // 2. Start background seeding (Split Strategy)
      const { initSystemFast } = await import("./seed");
      const { getSetupDatabaseAdapter } = await import("./utils");
      const { setupManager } = await import("./setup-manager");

      const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
        createIfMissing: true,
      });

      const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

      // Track critical seeding (blocking)
      setupManager.startSeeding(async () => {
        try {
          await criticalPromise;

          // Queue background content seeding (non-blocking)
          // This allows completeSetup to return immediately after critical data is ready
          setupManager.startBackgroundWork(async () => {
            try {
              await backgroundTask();
            } finally {
              logger.info("🔌 [seedDatabase] Disconnecting seeding adapter...");
              await dbAdapter.disconnect();
            }
          });
        } catch (err) {
          logger.error("❌ [seedDatabase] Critical seeding failed:", err);
          await dbAdapter.disconnect();
          throw err;
        }
      });

      return {
        success: true,
        message: "Database configuration saved. Seeding started! 🚀",
      };
    } catch (err) {
      logger.error("Database config save failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      const isSetupComplete =
        message.includes("Cannot overwrite private.ts") ||
        message.includes("setup already completed");
      return {
        success: false,
        error: isSetupComplete
          ? 'Setup is already complete. To change database configuration, go to the login page and use "Reset setup" when a database error is shown, or remove config/private.ts and restart the app.'
          : message,
        code: isSetupComplete ? "SETUP_ALREADY_COMPLETE" : undefined,
      };
    }
  },

  /**
   * Completes the setup
   */
  completeSetup: async ({ request, cookies, url }) => {
    const setupStartTime = performance.now();
    logger.info("🚀 Action: completeSetup called");

    try {
      // 1. Skip background seeding wait - the new process is fresh.
      // We rely on the fact that critical tables (roles/settings) are already
      // verified during the global bootAll phase.
      logger.info("⏳ completeSetup: Proceeding with final account creation...");

      const formData = await request.formData();
      const dataRaw = formData.get("data") as string;

      if (!dataRaw || dataRaw === "undefined") {
        logger.error("❌ [completeSetup] No valid data provided in form");
        return { success: false, error: "No setup data provided" };
      }

      let payload;
      try {
        payload = JSON.parse(dataRaw);
      } catch (parseErr) {
        logger.error("❌ completeSetup: Failed to parse JSON data:", parseErr);
        return { success: false, error: "Invalid setup data format." };
      }

      const { database, admin, system = {} } = payload;

      logger.info("DEBUG: [completeSetup] payload contents:", {
        hasDatabase: !!database,
        hasAdmin: !!admin,
        hasSystem: !!system,
        dbType: database?.type,
      });
      const adminValidation = safeParse(setupAdminSchema, admin);
      if (!adminValidation.success) {
        return { success: false, error: "Invalid admin user data" };
      }

      // 2. Get Database Adapter
      // We prioritize the global initialization if it's already running (due to private.ts write)
      // otherwise we fall back to a manual setup adapter.
      const { ensureFullInitialization, dbAdapter: globalAdapter } =
        await import("@src/databases/db");

      let dbAdapter: any;
      try {
        logger.info("⏳ [completeSetup] Attempting to use global database instance...");
        const result = await ensureFullInitialization();
        dbAdapter = result?.adapter || globalAdapter;
        logger.info("✅ [completeSetup] Using global database instance.");
      } catch (err) {
        logger.warn(
          "⚠️ [completeSetup] Global initialization failed or not ready, falling back to manual adapter:",
          err,
        );
        const { getSetupDatabaseAdapter } = await import("./utils");
        const manualResult = await getSetupDatabaseAdapter(database, {
          createIfMissing: true,
        });
        dbAdapter = manualResult.dbAdapter;
      }

      const { Auth } = await import("@src/databases/auth");
      const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
      const setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

      // Check if user already exists
      const existingUser = await setupAuth.getUserByEmail(
        {
          email: admin.email,
          tenantId: undefined,
        },
        { bypassTenantCheck: true },
      );
      let session: any;

      if (existingUser) {
        logger.info("Admin user already exists, updating credentials...");

        // Update password
        await setupAuth.updateUserPassword(admin.email, admin.password, {
          bypassTenantCheck: true,
        });

        // Update other attributes
        await setupAuth.updateUser(
          existingUser._id,
          {
            username: admin.username,
            role: "admin",
            isRegistered: true,
          },
          { bypassTenantCheck: true },
        );

        // Create new session
        session = await setupAuth.createSession(
          {
            user_id: existingUser._id,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
            tenantId: undefined,
          },
          { bypassTenantCheck: true },
        );
      } else {
        const userData = {
          username: admin.username,
          email: admin.email,
          password: admin.password,
          role: "admin",
          isRegistered: true,
        };

        logger.info(`Creating admin user: ${userData.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}`);
        logger.debug("Admin user data (excluding password):", {
          ...userData,
          password: "[REDACTED]",
        });

        // Create new user
        const authResult = await setupAuth.createUserAndSession(
          userData,
          {
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
          },
          { bypassTenantCheck: true },
        );

        if (!authResult.success) {
          const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
          const classified = classifyDatabaseError(
            authResult.error?.message || authResult.message || "User creation failed",
            database.type,
            database,
          );
          return new SetupDatabaseError(classified).toClientPayload();
        }
        session = authResult.data.session;
      }

      if (!session) {
        return { success: false, error: "Failed to create session" };
      }

      logger.info("DEBUG: Session created:", {
        sessionId: session._id,
        userId: session.user_id,
      });

      // Safer secure flag logic (matches handleAuthentication)
      const { dev } = await import("$app/environment");
      const isSecure =
        url.protocol === "https:" ||
        (url.hostname !== "localhost" && !dev && process.env.TEST_MODE !== "true");

      const { SESSION_COOKIE_NAME } = await import("@src/databases/auth/constants");

      logger.info("DEBUG: Setting cookie:", {
        name: SESSION_COOKIE_NAME,
        value: session._id,
        secure: isSecure,
      });

      // Set session cookie
      cookies.set(SESSION_COOKIE_NAME, session._id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: isSecure,
        maxAge: 60 * 60 * 24, // 1 day
      });
      logger.info(`Set ${SESSION_COOKIE_NAME} cookie for new admin user`);

      // 3. Persist system settings
      // Note: We don't call initializeWithConfig here because we just waited for it above.
      const { clearPrivateConfigCache } = await import("@src/databases/db");
      clearPrivateConfigCache(false);

      const persistSettingsPromise = (async () => {
        try {
          logger.debug("Persisting system settings to DB...");
          const settingsToPersist = [
            // Redis & Arch Mode (Private)
            {
              key: "USE_REDIS",
              value: system.useRedis,
              category: "private",
              scope: "system",
            },
            {
              key: "REDIS_HOST",
              value: system.redisHost,
              category: "private",
              scope: "system",
            },
            {
              key: "REDIS_PORT",
              value: Number(system.redisPort),
              category: "private",
              scope: "system",
            },
            {
              key: "REDIS_PASSWORD",
              value: system.redisPassword,
              category: "private",
              scope: "system",
            },
            {
              key: "MULTI_TENANT",
              value: system.multiTenant,
              category: "private",
              scope: "system",
            },
            {
              key: "DEMO",
              value: system.demoMode,
              category: "private",
              scope: "system",
            },

            // General Site Settings (Public)
            {
              key: "SITE_NAME",
              value: system.siteName,
              category: "public",
              scope: "system",
            },
            {
              key: "PASSWORD_MIN_LENGTH",
              value: Number(system.passwordMinLength || 8),
              category: "public",
              scope: "system",
            },
            {
              key: "HOST_PROD",
              value: system.hostProd,
              category: "public",
              scope: "system",
            },
            {
              key: "TIMEZONE",
              value: system.timezone,
              category: "public",
              scope: "system",
            },

            // Language Settings (Public)
            // Note: validation should ideally ensure defaults are in the arrays
            {
              key: "DEFAULT_CONTENT_LANGUAGE",
              value: system.defaultContentLanguage,
              category: "public",
              scope: "system",
            },
            {
              key: "AVAILABLE_CONTENT_LANGUAGES",
              value: system.contentLanguages,
              category: "public",
              scope: "system",
            },
            {
              key: "BASE_LOCALE",
              value: system.defaultSystemLanguage,
              category: "public",
              scope: "system",
            },
            {
              key: "LOCALES",
              value: system.systemLanguages,
              category: "public",
              scope: "system",
            },

            // Media Settings (Public)
            {
              key: "MEDIA_STORAGE_TYPE",
              value: system.mediaStorageType,
              category: "public",
              scope: "system",
            },
            {
              key: "MEDIA_FOLDER",
              value: system.mediaFolder,
              category: "public",
              scope: "system",
            },
            // Cloudflare CDN
            {
              key: "CF_API_TOKEN",
              value: system.cfApiToken,
              category: "private",
              scope: "system",
            },
            {
              key: "CF_ZONE_ID",
              value: system.cfZoneId,
              category: "private",
              scope: "system",
            },
            {
              key: "CF_PURGE_MODE",
              value: system.cfPurgeMode,
              category: "private",
              scope: "system",
            },
            // Read Replicas (stored in DB)
            {
              key: "DB_REPLICA_URLS",
              value: JSON.stringify(database.replicaUrls || []),
              category: "private",
              scope: "system",
            },
          ];

          // Cast to any to bypass strict type check for now, or define a proper interface for the array item
          await dbAdapter.system.preferences.setMany(settingsToPersist as any);
          logger.info("System settings persisted to database successfully");
        } catch (dbError) {
          logger.warn("Failed to persist some system settings to DB:", dbError);
        }
      })();

      await persistSettingsPromise;

      // 3.2 Invalidate setup cache
      // Force setupStatus = true so the redirect succeeds without a disk/DB re-read.
      // By this point user creation, seeding, and DB init have all completed successfully.
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(true, true);

      // 4. Final System Health Check
      // We don't call initializeWithConfig here as it is already handled by the global boot.
      logger.info("✅ [completeSetup] Skipping redundant system initialization.");

      // OPTIMIZATION: Initialize content-system IMMEDIATELY with skipReconciliation: true
      // This prevents the 4s blocking delay on the subsequent redirect request.
      // We trust the database state because we just seeded it.
      try {
        logger.info(
          "🚀 [completeSetup] Refreshing content-system state (skipping reconciliation)...",
        );
        const { contentSystem } = await import("@src/content/index.server");
        // skipReconciliation: true is CRITICAL here to prevent the 4s blocking delay
        await contentSystem.refresh(undefined, true, false, dbAdapter);
        logger.info(
          "✅ [completeSetup] ContentSystem refreshed successfully (skipped reconciliation).",
        );
      } catch (cmError) {
        logger.warn("⚠️ [completeSetup] ContentSystem init/reconcile failed:", cmError);
      }

      // PRE-WARM CACHE REMOVED (Caused Race Conditions)
      // We effectively rely on lazy loading upon the first request to /Collections
      // The background content seeding (setupManager) handles the data.

      // --- PRESET INSTALLATION (DEPRECATED: Now handled in seedDatabase) ---
      // We keep a small log here to confirm it was skipped if already done
      logger.debug("📦 [completeSetup] Preset installation handled in previous step.");

      // --- 3. PERSIST FINAL SYSTEM SETTINGS TO DB ---
      try {
        const { updateSystemSettings } = await import("./seed");
        await updateSystemSettings(dbAdapter, system);
        logger.info("✅ [completeSetup] System settings updated in database.");
      } catch (err) {
        logger.warn("⚠️ [completeSetup] Failed to update system settings in DB (non-fatal):", err);
      }

      // --- FINAL STEP: UPDATE PRIVATE CONFIG MODES ---
      // We do this at the very end because it triggers a Vite restart.
      // We use setTimeout to allow the HTTP response to be sent to the client FIRST,
      // preventing "Failed to fetch" errors on the frontend.
      setTimeout(async () => {
        try {
          logger.info("💾 [completeSetup] Updating private configuration modes (deferred)...");
          const { updatePrivateConfigMode } = await import("./write-private-config");
          await updatePrivateConfigMode({
            multiTenant: system.multiTenant,
            demoMode: system.demoMode,
          });

          // 🚀 Set global flag to prevent race conditions in the current process
          (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = true;

          logger.info("✅ [completeSetup] Private configuration updated successfully.");
        } catch (configError) {
          logger.error("❌ [completeSetup] Failed to update private config:", configError);
        }
      }, 3000);

      // 4. Determine redirect path
      let redirectPath = "/config/collectionbuilder";

      // Use provided firstCollection if valid
      if (system.firstCollection?.path) {
        redirectPath = `/${system.defaultContentLanguage || "en"}${system.firstCollection.path}`;
      } else {
        // Fallback: Query content-system for smart first collection
        try {
          const { contentSystem } = await import("@src/content/index.server");
          // Clear cache to ensure we see the newly initialized collections
          // (Runes handle this automatically, but keeping terminology consistent)

          const smartRedirect = await contentSystem.getFirstCollectionRedirectUrl(
            system.defaultContentLanguage || "en",
          );
          if (smartRedirect) {
            redirectPath = smartRedirect;
          }
        } catch (e) {
          logger.warn("Could not determine first collection for redirect:", e);
        }
      }

      // Force system state to READY to prevent the TurboPipeline from blocking the redirect
      // while the server waits to restart.
      try {
        const { systemStateStore } = await import("@src/stores/system/state.svelte");
        const { invalidateSetupCache } = await import("@src/utils/setup-check");

        // ✨ CRITICAL: Set global flag to prevent TurboPipeline redirect loop during server restart
        (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = true;
        invalidateSetupCache(true, true);

        systemStateStore.update((state) => ({ ...state, overallState: "READY" }));
        logger.info(
          "✅ [completeSetup] Forced system state to READY and setup to COMPLETE to unblock frontend redirect.",
        );
      } catch (err) {
        logger.warn("⚠️ [completeSetup] Failed to force system state to READY:", err);
      }

      const setupDuration = performance.now() - setupStartTime;
      logger.info(
        `🎊 [completeSetup] Setup logic finished in ${Math.round(setupDuration)}ms. Redirecting to: ${redirectPath}`,
      );

      return {
        success: true,
        message: "Setup complete! 🎉",
        redirectPath,
        sessionId: session._id,
        publicSettings: {
          SITE_NAME: system.siteName || "SveltyCMS",
          DEFAULT_LANGUAGE: "en",
          MULTI_TENANT: system.multiTenant,
          DEMO: system.demoMode,
          USE_REDIS: system.useRedis,
          PKG_VERSION: pkgVersion,
          SETUP_COMPLETE: true,
        },
      };
    } catch (err) {
      logger.error("Setup completion failed detailed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  // Tests Email Configuration
  testEmail: async ({ request }) => {
    logger.info("🚀 Action: testEmail called");
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData.entries());

    // Map formData to schema expected types (booleans/numbers)
    const config = {
      host: rawData.host as string,
      port: Number(rawData.port),
      user: rawData.user as string,
      password: rawData.password as string,
      from: (rawData.from as string) || (rawData.user as string),
      secure: rawData.secure === "true",
      testEmail: rawData.testEmail as string,
      saveToDatabase: rawData.saveToDatabase === "true",
    };

    const { host, port, user, password, from, secure, testEmail, saveToDatabase } = config;

    try {
      // Validation
      const validationResult = safeParse(smtpConfigSchema, {
        host,
        port,
        user,
        password,
        from,
        secure,
      });

      if (!validationResult.success) {
        const errors = validationResult.issues
          .map((issue) => `${issue.path?.[0]?.key}: ${issue.message}`)
          .join(", ");
        return {
          success: false,
          error: `Invalid SMTP configuration: ${errors}`,
        };
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465 ? true : secure,
        auth: { user, pass: password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });

      // Verify connection
      await transporter.verify();
      logger.info("✅ SMTP connection successful");

      // Send test email
      await transporter.sendMail({
        from,
        to: testEmail,
        subject: "SveltyCMS SMTP Test Email",
        text: `This is a test email from SveltyCMS.\n\nYour SMTP configuration is working correctly!\n\nHost: ${host}\nTimestamp: ${new Date().toISOString()}`,
        html: `
					<div style="font-family: Arial, sans-serif; padding: 20px;">
						<h2 style="color: #2563eb;">SveltyCMS SMTP Test</h2>
						<p><strong>Your SMTP configuration is working correctly! ✅</strong></p>
						<p>Host: ${host}</p>
					</div>
				`,
      });

      // Save to database only if explicitly requested
      let saved = false;
      if (saveToDatabase) {
        try {
          const { dbAdapter } = await import("@src/databases/db");
          if (dbAdapter) {
            await dbAdapter.system.preferences.set("SMTP_HOST", host, "system");
            await dbAdapter.system.preferences.set("SMTP_PORT", port.toString(), "system");
            await dbAdapter.system.preferences.set("SMTP_USER", user, "system");
            await dbAdapter.system.preferences.set("SMTP_PASS", password, "system");
            await dbAdapter.system.preferences.set("SMTP_FROM", from, "system");
            await dbAdapter.system.preferences.set(
              "SMTP_SECURE",
              secure ? "true" : "false",
              "system",
            );
            saved = true;
          }
        } catch (e) {
          logger.warn("Could not save SMTP settings (DB might not be ready):", e);
        }
      }

      return {
        success: true,
        message: `SMTP test successful! Email sent to ${testEmail}.${saved ? " Settings saved." : ""}`,
        testEmailSent: true,
      };
    } catch (error: any) {
      logger.error("SMTP test failed:", error);
      // User friendly error mapping
      let msg = error.message;
      if (error.code === "EAUTH") {
        msg = "Authentication failed. Check credentials.";
      }
      if (error.code === "ECONNREFUSED") {
        msg = "Connection refused. Check host/port.";
      }
      return { success: false, error: msg };
    }
  },

  /**
   * Installs database drivers (optional)
   */
  installDriver: async ({ request }) => {
    logger.info("🚀 Action: installDriver called");
    const formData = await request.formData();
    const dbType = formData.get("dbType") as DatabaseType;

    if (!(dbType && DRIVER_PACKAGES[dbType]) || dbType === "sqlite") {
      return {
        success: true,
        message: "No driver installation needed (or invalid type).",
      };
    }

    const packageName = DRIVER_PACKAGES[dbType];

    try {
      // Check if already installed
      try {
        await import(/* @vite-ignore */ packageName);
        return {
          success: true,
          message: `Driver ${packageName} is already installed.`,
          alreadyInstalled: true,
          package: packageName,
        };
      } catch {
        // Install needed
      }

      // Detect package manager
      const cwd = process.cwd();
      let pm = "npm";
      if (existsSync(join(cwd, "bun.lock"))) {
        pm = "bun";
      } else if (existsSync(join(cwd, "yarn.lock"))) {
        pm = "yarn";
      } else if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
        pm = "pnpm";
      }

      const cmd =
        pm === "bun" || pm === "yarn" || pm === "pnpm"
          ? `${pm} add ${packageName}`
          : `npm install ${packageName}`;

      logger.info(`Installing ${packageName} using ${pm}...`);
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: 120_000,
      });
      logger.info("Installation output:", stdout + stderr);

      return {
        success: true,
        message: `Successfully installed ${packageName}.`,
        package: packageName,
      };
    } catch (error: any) {
      logger.error("Driver installation failed:", error);
      return { success: false, error: `Installation failed: ${error.message}` };
    }
  },
};
