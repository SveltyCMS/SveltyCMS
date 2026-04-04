/**
 * @file src/routes/setup/+page.server.ts
 * @description
 * Server-side orchestrator for the SveltyCMS Setup Wizard.
 * Implements SvelteKit Server Actions (Remote Functions) for system initialization.
 *
 * Responsibilities include:
 * - Testing database connections and auto-creating missing databases.
 * - Writing the private configuration file (`config/private.ts`).
 * - Seeding initial roles, settings, and collection presets.
 * - Finalizing admin user creation and initial system state.
 *
 * ### Features:
 * - database connection testing
 * - automated driver installation
 * - solution preset copying & compilation
 * - secure admin user & session creation
 * - self-healing initialization fast-path
 */

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { invalidateUserCountCache } from "@src/hooks/handle-authorization";
import type { ISODateString, DatabaseId } from "@src/databases/db-interface";
import { databaseConfigSchema } from "@src/databases/schemas";
import { setupAdminSchema, smtpConfigSchema } from "@utils/form-schemas";
import { logger } from "@utils/logger.server";
import { isSetupComplete } from "@utils/setup-check";
import nodemailer from "nodemailer";
import { safeParse } from "valibot";
import { version as pkgVersion } from "../../../package.json";
import type { Actions, PageServerLoad } from "./$types";

import { checkRedis, testRedisConnection } from "./utils";

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

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
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
    origin: url.origin, // Dynamic origin detection (localhost vs 127.0.0.1 vs custom port)
    configLocked: isSetupComplete(), // Check if private.ts exists
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
    const isTestMode = process.env.TEST_MODE === "true";
    if (isSetupComplete() && !isTestMode) {
      logger.warn("❌ Action: testDatabase BLOCKED - configuration already exists");
      return {
        success: false,
        error: "Configuration already exists. Database settings are locked.",
      };
    }
    try {
      const formData = await request.formData();
      const configRaw = formData.get("config") as string;
      const createIfMissing = formData.get("createIfMissing") === "true";
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

      const { testAndCreateDatabase } = await import("./setup-service.server");

      try {
        const result = await testAndCreateDatabase(dbConfig, createIfMissing);
        return result;
      } catch (err: any) {
        logger.error("❌ Action: TestDatabase failed fatally:", err);
        return { success: false, error: err.message || String(err) };
      }
    } catch (err: any) {
      logger.error("❌ Action: TestDatabase failed fatally:", err);
      return { success: false, error: err.message || String(err) };
    }
  },

  /**
   * Seeds the database
   */
  seedDatabase: async ({ request }) => {
    logger.info("🚀 Action: seedDatabase called");
    const isTestMode = process.env.TEST_MODE === "true";
    if (isSetupComplete() && !isTestMode) {
      logger.warn("❌ Action: seedDatabase BLOCKED - configuration already exists");
      return {
        success: false,
        error: "Configuration already exists. Seeding is locked.",
      };
    }
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
      const { firstCollection } = await new Promise<{
        firstCollection: { name: string; path: string } | null;
      }>((resolve) => {
        setupManager.startSeeding(async () => {
          await criticalPromise;

          // Queue background content seeding (non-blocking)
          // This allows completeSetup to return immediately after critical data is ready
          setupManager.startBackgroundWork(backgroundTask);

          // Get first collection for fast redirect
          const { seedCollectionsForSetup } = await import("./seed");
          const result = await seedCollectionsForSetup(dbAdapter);
          resolve(result);
        });
      });

      return {
        success: true,
        message: "Database configuration saved. Seeding started! 🚀",
        firstCollection,
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
      // --- REDIS VERIFICATION ---
      if (system.useRedis) {
        logger.info("📡 completeSetup: Verifying Redis connection...");
        const redisCheck = await testRedisConnection({
          host: system.redisHost || "localhost",
          port: Number(system.redisPort) || 6379,
          password: system.redisPassword,
        });

        if (!redisCheck.success) {
          logger.error("❌ completeSetup: Redis verification failed:", redisCheck.message);
          return {
            success: false,
            error: `Redis connection failed: ${redisCheck.message}. Please check your Redis settings or disable Redis caching.`,
          };
        }
        logger.info("✅ completeSetup: Redis verified successfully");
      }

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
        await setupAuth.updateUserPassword(admin.email, admin.password, undefined);

        // Update other attributes
        await setupAuth.updateUser(
          existingUser._id as DatabaseId,
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
        // Create new user
        const authResult = await setupAuth.createUserAndSession(
          {
            username: admin.username,
            email: admin.email,
            password: admin.password,
            role: "admin",
            isAdmin: true,
            isRegistered: true,
          },
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

      // Invalidate user count cache so the frontend realizes the system is now setup
      await invalidateUserCountCache();

      if (!session) {
        return { success: false, error: "Failed to create session" };
      }

      logger.info("DEBUG: Session created:", {
        sessionId: session._id,
        userId: session.user_id,
      });

      // Safer secure flag logic (matches handleAuthentication)
      // Environment-aware security: Only force secure if strictly HTTPS
      // This prevents cookie blocking on http://localhost or http://127.0.0.1 in preview mode
      const isSecure = url.protocol === "https:";
      const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;
      const sameSiteSetting = isSecure ? "strict" : "lax";

      logger.info("DEBUG: Setting cookie:", {
        name: cookieName,
        value: session._id,
        secure: isSecure,
      });

      // Set session cookie
      cookies.set(cookieName, session._id, {
        path: "/",
        httpOnly: true,
        sameSite: sameSiteSetting,
        secure: isSecure,
        maxAge: 60 * 60 * 24, // 1 day
        // __Host- prefix requires no Domain attribute
        ...(isSecure ? {} : { domain: undefined }),
      });
      logger.info(`Set ${cookieName} cookie for new admin user`);

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
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(true);

      // --- PRESET INSTALLATION (Relocated from Step 1) ---
      // We perform this here because the user only picks the preset in Step 3
      if (system.preset && system.preset !== "blank") {
        logger.info(`✨ [completeSetup] Installing preset: ${system.preset}`);
        try {
          const { compile } = await import("@utils/compilation/compile");
          const fs = await import("node:fs");

          const sourceDir = resolve(process.cwd(), "src", "presets", system.preset);
          const targetDir = resolve(process.cwd(), "config", "collections");

          if (fs.existsSync(sourceDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
            logger.info(`✅ Copied preset ${system.preset} to config/collections`);

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
          logger.error("Failed to install preset during completion:", presetError);
        }
      }

      // Initialize global system
      const { initializeWithConfig } = await import("@src/databases/db");

      // Load real keys from private.ts for correct session signing
      let jwtSecret = "temp_secret";
      let encryptionKey = "temp_key";
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const privatePath = path.resolve(process.cwd(), "config", "private.ts");
        const content = await fs.readFile(privatePath, "utf-8");
        const jwtMatch = /JWT_SECRET_KEY\s*:\s*['"]([^'"]+)['"]/.exec(content);
        const encMatch = /ENCRYPTION_KEY\s*:\s*['"]([^'"]+)['"]/.exec(content);
        if (jwtMatch) jwtSecret = jwtMatch[1];
        if (encMatch) encryptionKey = encMatch[1];
      } catch (e) {
        logger.warn("Failed to read keys from private.ts, using fallbacks:", e);
      }

      await initializeWithConfig({
        DB_TYPE: database.type,
        DB_HOST: database.host,
        DB_PORT: Number(database.port),
        DB_NAME: database.name,
        DB_USER: database.user || "",
        DB_PASSWORD: database.password || "",
        JWT_SECRET_KEY: jwtSecret,
        ENCRYPTION_KEY: encryptionKey,
        USE_REDIS: system.useRedis,
        REDIS_HOST: system.redisHost,
        REDIS_PORT: Number(system.redisPort),
        REDIS_PASSWORD: system.redisPassword,
        MULTI_TENANT: system.multiTenant,
        DEMO: system.demoMode,
      } as any);

      // 4. Force Content Manager synchronization REMOVED (Handled lazily or in background)
      // This ensures the dashboard can find the newly seeded collections immediately.
      // logger.info("🚀 [completeSetup] Synchronizing content manager (from DB)...");
      // const { contentManager } = await import("@src/content");
      // await contentManager.initialize(undefined, true, dbAdapter);

      // PRE-WARM CACHE REMOVED (Caused Race Conditions)
      // We effectively rely on lazy loading upon the first request to /Collections
      // The background content seeding (setupManager) handles the data.

      // Determine redirect path
      let redirectPath = "/config/collectionbuilder";

      // Use provided firstCollection if valid
      if (system.firstCollection?.path) {
        redirectPath = `/${system.defaultContentLanguage || "en"}${system.firstCollection.path}`;
      } else {
        // Fallback: Query contentSystem for smart first collection
        try {
          const { contentSystem } = await import("@src/content");
          // Clear cache to ensure we see the newly initialized collections
          contentSystem.clearFirstCollectionCache();

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
          BASE_LOCALE: system.defaultSystemLanguage || "en",
          DEFAULT_CONTENT_LANGUAGE: system.defaultContentLanguage || "en",
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

      // Structured error classification for Email
      let classification = "EMAIL_FAILED";
      let userFriendly = error.message;
      let hint = "Check your SMTP host, port, and security settings.";

      if (error.code === "EAUTH") {
        classification = "AUTH_FAILED";
        userFriendly = "SMTP Authentication failed. Please check your username and password.";
        hint =
          'Ensure your credentials are correct. For Gmail/Outlook, you might need an "App Password".';
      } else if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        classification = "HOST_UNREACHABLE";
        userFriendly = `Could not connect to SMTP host at ${host}:${port}.`;
        hint =
          "Verify the host and port. Ensure your firewall allows outgoing traffic on this port.";
      } else if (error.code === "ESOCKET") {
        classification = "CONNECTION_FAILED";
        userFriendly = "SSL/TLS handshake failed.";
        hint =
          'Try toggling the "Secure" option or check if the port matches the security protocol (e.g., 465 for SSL, 587 for STARTTLS).';
      }

      return {
        success: false,
        error: userFriendly,
        classification,
        hint,
      };
    }
  },

  /**
   * Tests Redis connection
   */
  testRedis: async ({ request }) => {
    logger.info("🚀 Action: testRedis starting...");
    try {
      const formData = await request.formData();
      const host = formData.get("host") as string;
      const port = Number(formData.get("port"));
      const password = formData.get("password") as string;

      if (!host || !port) {
        return { success: false, error: "Host and port are required" };
      }

      const result = await testRedisConnection({ host, port, password });
      return result;
    } catch (err: any) {
      logger.error("❌ Redis test failed critically:", err);
      return { success: false, error: err.message || String(err) };
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

  /**
   * Cleans the database by dropping system collections.
   * Useful when resolving duplicate key errors or performing a clean reinstall.
   */
  cleanDatabase: async ({ request }) => {
    logger.info("🚀 Action: cleanDatabase starting...");
    try {
      const formData = await request.formData();
      const configRaw = formData.get("config") as string;

      if (!configRaw) {
        return { success: false, error: "No configuration data provided" };
      }

      const configData = JSON.parse(configRaw);

      // Coerce port to number
      if (configData.port === "" || configData.port === null) {
        configData.port = undefined;
      } else if (configData.port !== undefined) {
        const portNum = Number(configData.port);
        if (!Number.isNaN(portNum)) {
          configData.port = portNum;
        }
      }

      const { success, output: dbConfig } = safeParse(databaseConfigSchema, configData);
      if (!(success && dbConfig)) {
        return { success: false, error: "Invalid configuration" };
      }

      const { getSetupDatabaseAdapter } = await import("./utils");
      const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, { createIfMissing: false });

      logger.info("🧹 Wiping system collections for a clean setup...");

      // If the adapter supports clearDatabase, use it. Otherwise, drop specific collections.
      if (typeof dbAdapter.clearDatabase === "function") {
        await dbAdapter.clearDatabase();
      } else {
        // Fallback: manually delete from critical system collections
        // This is safe even if they don't exist
        const systemCollections = [
          "system_content_structure",
          "system_settings",
          "system_preferences",
          "system_themes",
          "system_roles",
          "system_tenants",
          "system_widgets",
        ];

        for (const coll of systemCollections) {
          try {
            await dbAdapter.crud.deleteMany(coll, {}, { bypassTenantCheck: true });
          } catch (e) {
            logger.debug(`Could not clear collection ${coll} (maybe doesn't exist):`, e);
          }
        }
      }

      await dbAdapter.disconnect();
      logger.info("✅ Database cleaned successfully! ✨");

      return {
        success: true,
        message: "Database cleaned successfully! You can now proceed with the fresh setup. ✨",
      };
    } catch (err: any) {
      logger.error("❌ CleanDatabase failed fatally:", err);
      return { success: false, error: err.message || String(err) };
    }
  },
};
