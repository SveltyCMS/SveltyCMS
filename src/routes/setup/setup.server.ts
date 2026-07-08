/**
 * @file src/routes/setup/setup.server.ts
 * @description Setup Remote Functions — database testing, seeding, completion, email, and Redis.
 *
 * Extracted from +page.server.ts for auditability and type safety.
 * installDriver remains as a traditional form action (spawn-based npm install).
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "@utils/logger";
import { databaseConfigSchema } from "@src/databases/schemas";
import { setupAdminSchema, smtpConfigSchema } from "@utils/schemas";
import { safeParse } from "valibot";
import nodemailer from "nodemailer";
import type { ISODateString } from "@src/databases/db-interface";

export interface DbConfig {
  type: string;
  host: string;
  port: number | string;
  name: string;
  user?: string;
  password?: string;
}
export interface SystemSettings {
  preset?: string | null;
  multiTenant?: boolean;
  demoMode?: boolean;
  siteName?: string;
  useRedis?: boolean;
  redisHost?: string;
  redisPort?: string;
  redisPassword?: string;
  defaultSystemLanguage?: string;
  systemLanguages?: string[];
  defaultContentLanguage?: string;
  contentLanguages?: string[];
  mediaStorageType?: string;
  mediaFolder?: string;
  timezone?: string;
  passwordMinLength?: number;
  cfApiToken?: string;
  cfZoneId?: string;
  cfPurgeMode?: string;
}
export interface AdminUser {
  username: string;
  email: string;
  password: string;
}

async function verifyDiskSpace() {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const stats = await fs.statfs(path.resolve("."));
    const freeBytes = Number(stats.bavail) * stats.bsize;
    const freeMb = freeBytes / (1024 * 1024);
    if (freeMb < 50) {
      return {
        success: false,
        error: `Insufficient disk space: Only ${freeMb.toFixed(1)} MB available on server disk. SveltyCMS requires at least 50 MB to run setup.`,
      };
    }
  } catch (err: any) {
    const { logger } = await import("@utils/logger");
    logger.warn("Failed to check disk space during setup:", err);
  }
  return null;
}

export async function testDatabaseConnection(
  configData: DbConfig,
  createIfMissing = false,
  allowOverwrite = false,
) {
  if (configData.port === "" || configData.port === null) (configData as any).port = undefined;
  else if (configData.port !== undefined) {
    const n = Number(configData.port);
    if (!Number.isNaN(n)) (configData as any).port = n;
  }

  const { success, output: dbConfig } = safeParse(databaseConfigSchema, configData);
  if (!(success && dbConfig)) return { success: false, error: "Invalid configuration" };

  const diskCheck = await verifyDiskSpace();
  if (diskCheck) return diskCheck;

  const start = performance.now();
  try {
    const { getSetupDatabaseAdapter } = await import("./utils");
    if (allowOverwrite) await dropDatabase(dbConfig);

    const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: createIfMissing || allowOverwrite || dbConfig.type === "sqlite",
      skipModuleInit: true, // Don't create system tables before isEmpty() check
    });

    const health = await dbAdapter.getConnectionHealth();
    if (!health.success) {
      await dbAdapter.disconnect();
      const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
      return new SetupDatabaseError(
        classifyDatabaseError(health.message, dbConfig.type as any, dbConfig),
      ).toClientPayload();
    }

    const isEmptyRes = await dbAdapter.isEmpty();
    if (isEmptyRes.success && !isEmptyRes.data && !allowOverwrite) {
      // In test mode, the test harness resets the DB before each file — skip the
      // emptiness warning to avoid false positives from test collection seeding.
      const isTest =
        (globalThis as any).process?.env?.TEST_MODE === "true" ||
        (globalThis as any).process?.env?.VITE_TEST_MODE === "true";
      if (!isTest) {
        await dbAdapter.disconnect();
        const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
        return new SetupDatabaseError(
          classifyDatabaseError(new Error("Database not empty"), dbConfig.type as any, dbConfig),
        ).toClientPayload();
      }
    }

    // Database is empty (or user chose overwrite) — safe to initialize modules
    if (dbAdapter.ensureAuth) await dbAdapter.ensureAuth();
    if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();
    if (dbAdapter.ensureCollections) await dbAdapter.ensureCollections();
    if (dbAdapter.ensureContent) await dbAdapter.ensureContent();
    if (dbAdapter.auth?.setupAuthModels) await dbAdapter.auth.setupAuthModels();

    await dbAdapter.disconnect();
    return {
      success: true,
      message: "Database connected successfully!",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err: any) {
    const errMsg = err.message;
    if (
      (errMsg.includes("does not exist") ||
        errMsg.includes("Unknown database") ||
        err.code === "ER_BAD_DB_ERROR" ||
        err.code === "3D000") &&
      createIfMissing
    ) {
      try {
        await createDatabase(dbConfig);
        await new Promise((r) => setTimeout(r, 500));
        const retry = await (
          await import("./utils")
        ).getSetupDatabaseAdapter(dbConfig, { createIfMissing: true });
        if ((await retry.dbAdapter.getConnectionHealth()).success) {
          await retry.dbAdapter.disconnect();
          return {
            success: true,
            message: "Database created and connected!",
            latencyMs: Math.round(performance.now() - start),
          };
        }
      } catch (ce: any) {
        return {
          success: false,
          error: ce.message,
        };
      }
    }
    const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
    return new SetupDatabaseError(
      classifyDatabaseError(err, dbConfig.type as any, dbConfig),
      err,
    ).toClientPayload();
  }
}

export async function seedDatabase(configData: DbConfig, systemData: SystemSettings = {}) {
  if (configData.port === "" || configData.port === null) (configData as any).port = undefined;
  else if (configData.port !== undefined) {
    const n = Number(configData.port);
    if (!Number.isNaN(n)) (configData as any).port = n;
  }

  const { success, output: dbConfig } = safeParse(databaseConfigSchema, configData);
  if (!(success && dbConfig)) return { success: false, error: "Invalid configuration" };

  const diskCheck = await verifyDiskSpace();
  if (diskCheck) return diskCheck;

  try {
    const { writePrivateConfig } = await import("./write-private-config");
    await writePrivateConfig(dbConfig, {
      multiTenant: systemData.multiTenant,
      demoMode: systemData.demoMode,
    });
    const { initSystemFast } = await import("./seed");
    const { getSetupDatabaseAdapter } = await import("./utils");
    const { setupManager } = await import("./setup-manager");
    const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: true,
    });
    const { criticalPromise, backgroundTask } = await initSystemFast(
      dbAdapter,
      null,
      systemData.demoMode || false,
      systemData.preset || null,
    );
    setupManager.startSeeding(async () => {
      await criticalPromise;
      setupManager.startBackgroundWork(async () => {
        await backgroundTask();
        await dbAdapter.disconnect();
      });
    });
    return {
      success: true,
      message: "Database configuration saved. Seeding started!",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      code: err.message.includes("Cannot overwrite") ? "SETUP_ALREADY_COMPLETE" : undefined,
    };
  }
}

export async function completeSetup(
  database: DbConfig,
  admin: AdminUser,
  system: SystemSettings = {},
  emailSettings: any = {},
) {
  if (!safeParse(setupAdminSchema, admin).success)
    return { success: false, error: "Invalid admin data" };

  // Wait for critical background seeding to complete
  const { setupManager } = await import("./setup-manager");
  if ((globalThis as any).process?.env?.TEST_MODE === "true" || database.type === "sqlite") {
    await setupManager.waitAll();
  } else {
    await setupManager.waitTillDone();
  }

  if (setupManager.seedingError) {
    return {
      success: false,
      error: `Critical database seeding failed: ${setupManager.seedingError}`,
    };
  }

  const { initializeWithConfig, dbAdapter: ga } = await import("@src/databases/db");
  let dbAdapter: any;
  try {
    dbAdapter =
      (
        await initializeWithConfig({
          DB_TYPE: database.type,
          DB_HOST: database.host,
          DB_PORT: Number(database.port),
          DB_NAME: database.name,
          DB_USER: database.user || "",
          DB_PASSWORD: database.password || "",
          USE_REDIS: system.useRedis,
          REDIS_HOST: system.redisHost,
          REDIS_PORT: Number(system.redisPort),
        })
      )?.adapter || ga;
  } catch {
    dbAdapter = (
      await (
        await import("./utils")
      ).getSetupDatabaseAdapter(database as any, { createIfMissing: true })
    ).dbAdapter;
  }

  // Seed preset collections once the user has chosen their blueprint (step 2).
  // Step 0 seedDatabase() always runs with preset "blank" — collections are applied here only.
  if (system.preset && system.preset !== "blank") {
    const { seedPresetCollections } = await import("./seed");
    await seedPresetCollections(dbAdapter, system.preset, null, undefined, {
      replaceAll: true,
    });
    try {
      const { refreshContent } = await import("@src/content/engine.server");
      await refreshContent(null, { mode: "schemas", adapter: dbAdapter });
    } catch (e) {
      logger.warn("[Setup] Content refresh after preset seeding failed:", e);
    }
  }

  // Save custom configuration settings to database preferences
  if (dbAdapter?.system?.preferences) {
    try {
      const p = dbAdapter.system.preferences;
      const opts = { scope: "system" as const };

      if (system.siteName)
        await p.set("SITE_NAME", system.siteName, {
          ...opts,
          category: "public",
        });
      if (system.timezone)
        await p.set("TIMEZONE", system.timezone, {
          ...opts,
          category: "public",
        });
      if (system.defaultSystemLanguage)
        await p.set("BASE_LOCALE", system.defaultSystemLanguage, {
          ...opts,
          category: "public",
        });
      if (system.systemLanguages)
        await p.set("LOCALES", system.systemLanguages, {
          ...opts,
          category: "public",
        });
      if (system.defaultContentLanguage)
        await p.set("DEFAULT_CONTENT_LANGUAGE", system.defaultContentLanguage, {
          ...opts,
          category: "public",
        });
      if (system.contentLanguages)
        await p.set("AVAILABLE_CONTENT_LANGUAGES", system.contentLanguages, {
          ...opts,
          category: "public",
        });
      if (system.mediaStorageType)
        await p.set("MEDIA_STORAGE_TYPE", system.mediaStorageType, {
          ...opts,
          category: "public",
        });
      if (system.mediaFolder)
        await p.set("MEDIA_FOLDER", system.mediaFolder, {
          ...opts,
          category: "public",
        });

      if (system.useRedis !== undefined)
        await p.set("USE_REDIS", system.useRedis, {
          ...opts,
          category: "private",
        });
      if (system.redisHost)
        await p.set("REDIS_HOST", system.redisHost, {
          ...opts,
          category: "private",
        });
      if (system.redisPort)
        await p.set("REDIS_PORT", Number(system.redisPort) || 6379, {
          ...opts,
          category: "private",
        });
      if (system.redisPassword !== undefined)
        await p.set("REDIS_PASSWORD", system.redisPassword, {
          ...opts,
          category: "private",
        });

      if (system.cfApiToken !== undefined)
        await p.set("CF_API_TOKEN", system.cfApiToken, {
          ...opts,
          category: "private",
        });
      if (system.cfZoneId !== undefined)
        await p.set("CF_ZONE_ID", system.cfZoneId, {
          ...opts,
          category: "private",
        });
      if (system.cfPurgeMode)
        await p.set("CF_PURGE_MODE", system.cfPurgeMode, {
          ...opts,
          category: "private",
        });

      if (emailSettings && emailSettings.smtpConfigured) {
        await p.set("SMTP_HOST", emailSettings.host, {
          ...opts,
          category: "private",
        });
        await p.set("SMTP_PORT", Number(emailSettings.port) || 587, {
          ...opts,
          category: "private",
        });
        await p.set("SMTP_EMAIL", emailSettings.user, {
          ...opts,
          category: "private",
        });
        await p.set("SMTP_PASSWORD", emailSettings.password, {
          ...opts,
          category: "private",
        });
        await p.set("SMTP_MAIL_FROM", emailSettings.from || emailSettings.user, {
          ...opts,
          category: "private",
        });
      }

      // Update architectural modes in private.ts based on final wizard state
      try {
        const { updatePrivateConfigMode } = await import("./write-private-config");
        await updatePrivateConfigMode({
          multiTenant: system.multiTenant,
          demoMode: system.demoMode,
        });
      } catch (modeError) {
        logger.error("Failed to update architectural modes in private.ts:", modeError);
      }

      // Invalidate settings cache + reload private config to pick up MULTI_TENANT/DEMO changes
      const { invalidateSettingsCache } = await import("@src/services/core/settings-service");
      invalidateSettingsCache();
      const { clearPrivateConfigCache, loadPrivateConfig } =
        await import("@src/databases/config-state");
      clearPrivateConfigCache();
      await loadPrivateConfig(true);
    } catch (e) {
      logger.error("Failed to save custom system preferences during setup:", e);
    }
  }

  const { Auth } = await import("@src/databases/auth");
  const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
  const auth = new Auth(dbAdapter, getDefaultSessionStore());

  const existing = await auth.getUserByEmail(
    { email: admin.email, tenantId: undefined },
    { bypassTenantCheck: true },
  );
  let session: any;
  if (existing) {
    await auth.updateUserPassword(admin.email, admin.password, {
      bypassTenantCheck: true,
    });
    await auth.updateUser(
      existing._id,
      { username: admin.username, role: "admin", isRegistered: true },
      { bypassTenantCheck: true },
    );
    session = await auth.createSession(
      {
        user_id: existing._id,
        expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
      },
      { bypassTenantCheck: true },
    );
  } else {
    const r = await auth.createUserAndSession(
      {
        username: admin.username,
        email: admin.email,
        password: admin.password,
        role: "admin",
        isRegistered: true,
      },
      {
        expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
      },
      { bypassTenantCheck: true },
    );
    if (!r.success)
      return {
        success: false,
        error: r.error?.message || "User creation failed",
      };
    session = r.data.session;
  }

  if (!session) return { success: false, error: "Session creation failed" };

  // 🚀 Prime the in-memory session cache so getUserFromSession gets an instant hit,
  // bypassing the sqlite-proxy validateSession query entirely.
  try {
    const user = await auth.getUserById((session as any).user_id);
    if (user) {
      const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
      primeSessionMemoryCache(session._id, user);
      logger.info(`[Setup] Primed session cache for ${(user as any).email}`);
    }
  } catch (e) {
    logger.warn("[Setup] Failed to prime session cache:", e);
  }

  const { SESSION_COOKIE_NAME } = await import("@src/databases/auth/constants");
  const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
  invalidateSetupCache(true);

  // The admin now exists — clear the cached user count (TTL 1h) so the login page
  // immediately sees a non-empty DB and offers Sign In instead of the first-user Sign Up.
  try {
    const { invalidateUserCountCache } = await import("@src/hooks/handle-authorization");
    await invalidateUserCountCache();
  } catch {
    // Non-fatal: cache will self-heal on next authoritative read.
  }

  // Determine redirect target — first collection if seeded, otherwise builder
  let redirectPath = "/config/collectionbuilder";
  try {
    const { getCachedFirstCollectionPath } = await import("@utils/server/collection-utils.server");
    const path = await getCachedFirstCollectionPath("en" as any);
    if (path) redirectPath = path;
  } catch {
    // Collections may not be seeded yet — fall back to builder
  }

  return {
    success: true,
    message: "Setup completed",
    sessionId: session._id,
    sessionCookie: {
      name: SESSION_COOKIE_NAME,
      value: session._id,
      attributes: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 86400 },
    },
    publicSettings: {
      SITE_NAME: system.siteName,
      DEFAULT_LANGUAGE: system.defaultSystemLanguage,
      MULTI_TENANT: system.multiTenant,
      DEMO: system.demoMode,
      USE_REDIS: system.useRedis,
    },
    redirectPath,
  };
}

export async function testEmailConnection(cfg: {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
  testEmail: string;
}) {
  if (!safeParse(smtpConfigSchema, cfg).success)
    return { success: false, error: "Invalid SMTP config" };
  try {
    const t = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
      connectionTimeout: 10000,
    });
    await t.sendMail({
      to: cfg.testEmail,
      subject: "SveltyCMS Email Test",
      text: "Test email from SveltyCMS setup wizard.",
    });
    return { success: true, message: "Test email sent!" };
  } catch (e: any) {
    return {
      success: false,
      error: e.message,
    };
  }
}

export async function testRedisConnection(host = "localhost", port = 6379, password?: string) {
  const start = performance.now();
  try {
    const { createClient } = await import("redis");
    const c = createClient({
      url: "redis://" + host + ":" + port,
      password: password || undefined,
      socket: { connectTimeout: 5000 },
    });
    await c.connect();
    await c.ping();
    const latency = Math.round(performance.now() - start);
    await c.destroy();
    return { success: true, message: "Redis connected!", latencyMs: latency };
  } catch (e: any) {
    return {
      success: false,
      error: e.message,
    };
  }
}

export async function probeRedis() {
  const { checkRedis } = await import("./utils");
  return checkRedis();
}

// ── internal helpers ──
async function dropDatabase(db: any) {
  if (db.type === "mongodb" || db.type === "mongodb+srv") {
    const m = (await import("mongoose")).default;
    const uri = db.host.includes("://")
      ? db.host
      : `mongodb://${db.user ? `${db.user}:${db.password}@` : ""}${db.host}:${db.port || 27017}/${db.name}`;
    const c = await m.createConnection(uri).asPromise();
    await c.dropDatabase();
    await c.close();
  } else if (db.type === "mariadb" || db.type === "mysql") {
    const m = await import("mysql2/promise");
    const c = await m.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
    });
    await c.query(`DROP DATABASE IF EXISTS \`${db.name}\``);
    await c.end();
  } else if (db.type === "postgresql") {
    const p = (await import("postgres")).default;
    const s = p({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: "postgres",
    });
    await s
      .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db.name}'`)
      .catch(() => {
        logger.debug("PG terminate backend failed silently during database drop");
      });
    try {
      await s.unsafe(`DROP DATABASE IF EXISTS "${db.name}" WITH (FORCE)`);
    } catch {
      await s.unsafe(`DROP DATABASE IF EXISTS "${db.name}"`);
    }
    await s.end();
  } else if (db.type === "sqlite") {
    const { buildDatabaseConnectionString } = await import("./utils");
    const p = buildDatabaseConnectionString(db);
    if (require("node:fs").existsSync(p)) {
      let deleted = false;
      for (let attempt = 0; attempt < 5 && !deleted; attempt++) {
        try {
          require("node:fs").unlinkSync(p);
          deleted = true;
        } catch {
          if (attempt < 4) await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }
}
async function createDatabase(db: any) {
  if (db.type === "sqlite") {
    const { buildDatabaseConnectionString } = await import("./utils");
    mkdirSync(dirname(buildDatabaseConnectionString(db)), { recursive: true });
  } else if (db.type === "postgresql") {
    const p = (await import("postgres")).default;
    const s = p({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: "postgres",
    });
    await s.unsafe(`CREATE DATABASE "${db.name}"`);
    await s.end();
  } else if (db.type === "mariadb" || db.type === "mysql") {
    const m = await import("mysql2/promise");
    const c = await m.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
    });
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${db.name}\``);
    await c.end();
  }
}
