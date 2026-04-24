/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side logic for the setup page including Server Functions (Remote Functions).
 * Note: Route protection is handled by the handleSetup middleware in hooks.server.ts
 */

import { exec } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import type { ISODateString } from "@src/databases/db-interface";
import { databaseConfigSchema } from "@src/databases/schemas";
import { setupAdminSchema, smtpConfigSchema } from "@utils/form-schemas";
import { logger } from "@utils/logger.server";
import nodemailer from "nodemailer";
import { safeParse } from "valibot";
import { version as pkgVersion } from "../../../package.json";
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
    logger.info("🚀 Action: VerifyDatabaseConfig starting...");
    try {
      const formData = await request.formData();
      const configRaw = formData.get("config") as string;
      const createIfMissing = formData.get("createIfMissing") === "true";
      const allowOverwrite = formData.get("allowOverwrite") === "true";
      logger.info(
        "📦 Received config raw:",
        configRaw ? `Yes (length: ${configRaw.length})` : "No",
      );
      logger.info("🛠 Create missing DB if needed:", createIfMissing);

      if (!configRaw) {
        logger.error("❌ Action: No config data provided in form");
        return { success: false, error: "No configuration data provided" };
      }

      const configData = JSON.parse(configRaw);
      logger.info("🔍 Parsed config for type:", configData?.type);

      // Coerce port to number for validation (Frontend sends string "27017" or "")
      if (configData.port === "" || configData.port === null) {
        configData.port = undefined;
      } else if (configData.port !== undefined) {
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

      logger.info("✅ Action: Configuration validated successfully");

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
          if ((await import("fs")).existsSync(dbPath)) {
            await (await import("fs")).promises.unlink(dbPath);
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
        const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
          createIfMissing: createIfMissing || allowOverwrite,
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

        // Check for existing collections if we didn't just overwrite
        if (!allowOverwrite) {
          try {
            let existingCollections: string[] = [];

            if (dbConfig.type === "mongodb" || dbConfig.type === "mongodb+srv") {
              const mongoose = (await import("mongoose")).default;
              const uri = configData.host.includes("://")
                ? configData.host
                : `mongodb://${configData.user ? `${configData.user}:${configData.password}@` : ""}${configData.host}:${configData.port || 27017}/${dbConfig.name}`;
              const conn = await mongoose.createConnection(uri).asPromise();
              if (conn.db) {
                const collections = await conn.db.listCollections().toArray();
                existingCollections = collections.map((c: any) => c.name);
              }
              await conn.close();
            } else if (dbConfig.type === "postgresql") {
              const postgres = (await import("postgres")).default;
              const sql = postgres({
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                password: dbConfig.password,
                database: dbConfig.name,
              });
              const result =
                await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
              existingCollections = result.map((r: any) => r.table_name);
              await sql.end();
            } else if (dbConfig.type === "mariadb" || (dbConfig.type as any) === "mysql") {
              const mysql = await import("mysql2/promise");
              const connection = await mysql.createConnection({
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                password: dbConfig.password,
                database: dbConfig.name,
              });
              const [rows] = await connection.query(`SHOW TABLES`);
              existingCollections = (rows as any[]).map((r: any) => Object.values(r)[0] as string);
              await connection.end();
            } else if (dbConfig.type === "sqlite") {
              const Database = (await import("better-sqlite3")).default;
              const { buildDatabaseConnectionString } = await import("./utils");
              const dbPath = buildDatabaseConnectionString(dbConfig);
              if ((await import("fs")).existsSync(dbPath)) {
                const db = new Database(dbPath);
                const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
                existingCollections = rows.map((r: any) => r.name);
                db.close();
              }
            }

            // Exclude sqlite internal tables
            existingCollections = existingCollections.filter((c) => !c.startsWith("sqlite_"));

            if (existingCollections.length > 0) {
              logger.warn(
                `⚠️ Database already contains ${existingCollections.length} collections.`,
              );
              await dbAdapter.disconnect();

              const { SetupDatabaseError } = await import("./error-classifier");
              return new SetupDatabaseError({
                classification: "DATABASE_ALREADY_EXISTS",
                userFriendly: `Database "${dbConfig.name}" already exists and contains data (e.g. ${existingCollections.slice(0, 3).join(", ")}). If your compiled collections do not match this database, you may encounter errors. Proceeding will OVERWRITE and PERMANENTLY DELETE all existing data.`,
                canOverwrite: true,
                raw: "DATABASE_ALREADY_EXISTS",
              }).toClientPayload();
            }
          } catch (checkErr: any) {
            logger.error("❌ Failed to check existing collections:", checkErr.message);
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
   * Seeds the database
   */
  seedDatabase: async ({ request }) => {
    logger.info("🚀 Action: seedDatabase called");
    const formData = await request.formData();
    const configRaw = formData.get("config") as string;
    const systemRaw = formData.get("system") as string;

    if (!configRaw) {
      return { success: false, error: "No configuration data provided" };
    }

    const configData = JSON.parse(configRaw);
    const systemData = systemRaw ? JSON.parse(systemRaw) : {};

    // Coerce port to number for validation
    if (configData.port === "" || configData.port === null) {
      configData.port = undefined;
    } else if (configData.port !== undefined) {
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

    try {
      // 0. Copy Preset Files Before Anything compile triggers
      if (systemData.preset && systemData.preset !== "blank") {
        logger.info(`✨ Copying preset files for: ${systemData.preset}`);
        try {
          const { compile } = await import("@utils/compilation/compile");

          const sourceDir = resolve(process.cwd(), "src", "presets", systemData.preset);
          const targetDir = resolve(process.cwd(), "config", "collections");

          if (existsSync(sourceDir)) {
            // Copy recursive
            cpSync(sourceDir, targetDir, { recursive: true, force: true });
            logger.info(`✅ Copied preset ${systemData.preset} to config/collections`);

            // Force compilation of new preset files
            try {
              await compile();
              logger.info(`✅ Compiled preset collections successfully`);
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

      // 1. Write private config
      const { writePrivateConfig } = await import("./write-private-config");
      await writePrivateConfig(dbConfig, {
        multiTenant: systemData.multiTenant,
        demoMode: systemData.demoMode,
      });

      const { invalidateSetupCache } = await import("@utils/setup-check");
      invalidateSetupCache(true);

      // 2. Start background seeding (Split Strategy)
      // Critical phases (roles/settings) are tracked by startSeeding (blocking completeSetup)
      // Content phases are tracked by startBackgroundWork (non-blocking)
      const { setupManager } = await import("./setup-manager");
      const { initSystemFast } = await import("./seed");
      const { getSetupDatabaseAdapter } = await import("./utils");

      const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
        createIfMissing: true,
      });

      // Get split promises
      const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

      // Track critical seeding (blocking)
      setupManager.startSeeding(async () => {
        await criticalPromise;

        // Queue background content seeding (non-blocking)
        // This allows completeSetup to return immediately after critical data is ready
        setupManager.startBackgroundWork(backgroundTask);
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

    // Await CRITICAL seeding only (roles/settings/themes)
    // Background content seeding continues independently
    try {
      const { setupManager } = await import("./setup-manager");
      const seedingPromise = setupManager.waitTillDone();
      if (seedingPromise) {
        logger.info("⏳ completeSetup: Waiting for critical seeding...");
        await seedingPromise;
        logger.info("✅ completeSetup: Critical seeding finished");
      }
    } catch (seedError) {
      logger.error("❌ completeSetup: Seeding failed:", seedError);
      // Continue, as retry logic or partial state might allow completion
    }

    const formData = await request.formData();
    const dataRaw = formData.get("data") as string;
    logger.info("DEBUG: [completeSetup] data raw length:", dataRaw?.length);

    const { database, admin, system = {} } = JSON.parse(dataRaw);

    logger.info("DEBUG: [completeSetup] database details:", {
      type: database?.type,
      host: database?.host,
      hasUser: !!database?.user,
      hasPassword: !!database?.password,
      userLength: database?.user?.length,
    });
    logger.info("DEBUG: extracted system data:", JSON.stringify(system, null, 2));

    try {
      const adminValidation = safeParse(setupAdminSchema, admin);
      if (!adminValidation.success) {
        return { success: false, error: "Invalid admin user data" };
      }

      const { getSetupDatabaseAdapter } = await import("./utils");
      const { dbAdapter } = await getSetupDatabaseAdapter(database, {
        createIfMissing: true,
      });

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

        logger.info(`Creating admin user: ${userData.email}`);
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

        if (!(authResult.success && authResult.data)) {
          return { success: false, error: "Failed to create user" };
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

      // 3. Parallel Execution: Update private config & Persist system settings
      const updatePrivateConfigPromise = (async () => {
        try {
          // Optimization: Check if values actually changed to avoid unnecessary restart
          let privateConfigModule: any;
          try {
            privateConfigModule = await import("@config/private");
          } catch {
            logger.debug("Private config not found, proceeding with creation.");
          }

          if (privateConfigModule) {
            const privateEnv = privateConfigModule.privateEnv as any;
            // Use loose equality to handle string/boolean differences if any
            if (
              privateEnv.MULTI_TENANT === system.multiTenant &&
              privateEnv.DEMO === system.demoMode
            ) {
              logger.info("DEBUG: Private config unchanged, skipping update to prevent restart.");
              return;
            }
          }

          console.log("DEBUG: Updating private config with modes:", {
            multiTenant: system.multiTenant,
            demoMode: system.demoMode,
          });
          const { updatePrivateConfigMode } = await import("./write-private-config");
          await updatePrivateConfigMode({
            multiTenant: system.multiTenant,
            demoMode: system.demoMode,
          });
          console.log("DEBUG: Private config update completed");
        } catch (configError) {
          console.error("ERROR: Failed to update private config (NON-FATAL):", configError);
          logger.error("Failed to update private config modes:", configError);
          // Do not throw, allow setup to complete even if this file update fails
        }
      })();

      const persistSettingsPromise = (async () => {
        try {
          console.log("DEBUG: Persisting system settings to DB...");
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

      await Promise.all([updatePrivateConfigPromise, persistSettingsPromise]);

      // 3.2 Invalidate setup cache
      // Force setupStatus = true so the redirect succeeds without a disk/DB re-read.
      // By this point user creation, seeding, and DB init have all completed successfully.
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(true, true);

      // Initialize global system
      const { initializeWithConfig } = await import("@src/databases/db");
      await initializeWithConfig({
        DB_TYPE: database.type,
        DB_HOST: database.host,
        DB_PORT: Number(database.port),
        DB_NAME: database.name,
        DB_USER: database.user || "",
        DB_PASSWORD: database.password || "",
        JWT_SECRET_KEY: "temp_secret",
        ENCRYPTION_KEY: "temp_key",
        USE_REDIS: system.useRedis,
        REDIS_HOST: system.redisHost,
        REDIS_PORT: Number(system.redisPort),
        REDIS_PASSWORD: system.redisPassword,
        PASSWORD_MIN_LENGTH: Number(system.passwordMinLength || 8),
      } as any);

      // OPTIMIZATION: Initialize content-system IMMEDIATELY with skipReconciliation: true
      // This prevents the 4s blocking delay on the subsequent redirect request.
      // We trust the database state because we just seeded it.
      try {
        logger.info(
          "🚀 [completeSetup] Refreshing content-system state (skipping reconciliation)...",
        );
        const { contentSystem } = await import("@src/content");
        // skipReconciliation: true is CRITICAL here to prevent the 4s blocking delay
        // 🚀 Elite Audit Fix: Pass active dbAdapter directly to bypass global singleton race conditions
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

      // --- PRESET INSTALLATION ---
      if (system.preset && system.preset !== "blank") {
        logger.info(`📦 Installing preset: ${system.preset}`);
        try {
          const { compile } = await import("@utils/compilation/compile");

          // Source: src/presets/[preset]
          const presetDir = resolve(process.cwd(), "src", "presets", system.preset);

          // Target: config/collections
          const targetDir = resolve(process.cwd(), "config", "collections");

          // Ensure target exists
          mkdirSync(targetDir, { recursive: true });

          try {
            if (existsSync(presetDir)) {
              // Use cpSync with recursive option for simplified and efficient copying
              cpSync(presetDir, targetDir, { recursive: true, force: true });
              logger.info(`✅ Copied preset ${system.preset} to config/collections`);

              // Trigger compilation to register new collections
              logger.info("🔄 Compiling new collections...");
              await compile();
              logger.info("✅ Preset installation complete.");
            } else {
              logger.warn(`⚠️ Preset directory not found: ${presetDir}`);
            }
          } catch (presetError) {
            logger.warn(`⚠️ Preset directory not found or empty: ${presetDir}`, presetError);
          }
        } catch (err) {
          logger.error("❌ Failed to install preset:", err);
          // Non-fatal, continue setup
        }
      }

      // 4. Determine redirect path
      let redirectPath = "/config/collectionbuilder";

      // Use provided firstCollection if valid
      if (system.firstCollection?.path) {
        redirectPath = `/${system.defaultContentLanguage || "en"}${system.firstCollection.path}`;
      } else {
        // Fallback: Query content-system for smart first collection
        try {
          const { contentSystem } = await import("@src/content");
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
        },
      };
    } catch (err) {
      console.error("Setup completion failed detailed:", err);
      logger.error("Setup completion failed:", err);
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
