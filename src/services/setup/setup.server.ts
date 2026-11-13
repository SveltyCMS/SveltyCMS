/**
 * @file src/services/setup/setup.server.ts
 * @description Setup Remote Functions — database testing, seeding, completion, email, and Redis.
 *
 * Extracted from +page.server.ts for auditability and type safety.
 * installDriver remains as a traditional form action (spawn-based npm install).
 */
import { withSystemScope } from "@src/databases/system-tenant-scope";

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

/** Cached lazy handle to the engine server — one module-registry lookup instead of one per call. */
let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

/** Cached lazy handle to the authentication hook — one module-registry lookup instead of one per call. */
let handleAuthenticationModulePromise:
  | Promise<typeof import("@src/hooks/handle-authentication")>
  | undefined;
function loadHandleAuthenticationModule(): Promise<
  typeof import("@src/hooks/handle-authentication")
> {
  return (handleAuthenticationModulePromise ??= import("@src/hooks/handle-authentication"));
}

/** Cached lazy handle to the auth constants — one module-registry lookup instead of one per call. */
let authConstantsModulePromise: Promise<typeof import("@src/databases/auth/constants")> | undefined;
function loadAuthConstantsModule(): Promise<typeof import("@src/databases/auth/constants")> {
  return (authConstantsModulePromise ??= import("@src/databases/auth/constants"));
}

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { generateUUID } from "@utils/native-utils";
import { logger } from "@utils/logger";
import { describeHardware } from "@utils/hardware-profile";
import { databaseConfigSchema, type DatabaseConfig } from "@src/databases/schemas";
import { setupAdminSchema, smtpConfigSchema } from "@utils/schemas";
import { safeParse } from "valibot";
import type { DatabaseId, ISODateString, IDBAdapter } from "@src/databases/db-interface";

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
  homeCountry?: string;
  currency?: string;
  pricesIncludeTax?: boolean;
  storeLanguage?: string;
  taxRate?: string | number | null;
  reducedRate?: string | number | null;
  cfApiToken?: string;
  cfZoneId?: string;
  cfPurgeMode?: string;
}
export interface AdminUser {
  username: string;
  email: string;
  password: string;
}

/**
 * Databases this setup session created and seeded (SV-003). Re-testing one of them
 * must not be reported as a foreign, non-empty database that offers "PERMANENTLY
 * DELETE" — the wizard's own system tables are what makes it non-empty.
 *
 * Fingerprints are config identity only (engine/host/port/name/user) — never a
 * password — and live in process memory, so a restart simply falls back to the
 * normal "database not empty" classification.
 */
const wizardOwnedDatabases = new Set<string>();

/** Structural subset shared by the wizard payload and the parsed `databaseConfigSchema`. */
interface DatabaseIdentity {
  type: string;
  host: string;
  port?: number | string | null;
  name: string;
  user?: string;
}

function databaseFingerprint(dbConfig: DatabaseIdentity): string {
  return [dbConfig.type, dbConfig.host, dbConfig.port, dbConfig.name, dbConfig.user ?? ""]
    .map((part) => String(part ?? "").trim())
    .join("|");
}

/** True when this setup session already created/seeded the exact target. */
function isWizardOwnedDatabase(dbConfig: DatabaseIdentity): boolean {
  return wizardOwnedDatabases.has(databaseFingerprint(dbConfig));
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
  } catch (err) {
    logger.warn("Failed to check disk space during setup:", err);
  }
  return null;
}

/**
 * Error matcher for a target database/schema that simply does not exist yet.
 *
 * Kept deliberately narrower than `classifyDatabaseError`'s DB_NOT_FOUND bucket:
 * SQLite has no auth at all (the file check happens before connect), and the SQL
 * engines authenticate before resolving the database name. A match is therefore a
 * *candidate* for "target missing, credentials fine" — not proof. Callers must
 * confirm the credentials against a maintenance database before treating it as one
 * (see `proveCredentialsOnMaintenanceDatabase`).
 */
function isMissingDatabaseError(err: unknown, type: string): boolean {
  const errObj = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
  const message = String(errObj?.message ?? err ?? "");
  const lower = message.toLowerCase();
  const code = errObj?.code;
  return (
    code === "3D000" ||
    code === "ER_BAD_DB_ERROR" ||
    /unknown database/i.test(lower) ||
    /database .+ does not exist/i.test(lower) ||
    /database .+ not found/i.test(lower) ||
    (type === "sqlite" && lower.includes("does not exist"))
  );
}

/**
 * Maintenance databases that exist in every fresh SQL server install.
 *
 * "Database ... does not exist" only proves the target *name* was unresolved. Both
 * engines authenticate before resolving it, but the probe has not verified that the
 * supplied role/password are the ones that were accepted — QA reproduced a false
 * "willCreate" success with a non-existent PostgreSQL role and a dummy password.
 * Connecting to a database that always exists, with the SAME credentials, is proof.
 */
const MAINTENANCE_DATABASES = {
  postgresql: ["template1", "postgres"],
  mariadb: ["mysql"],
} as const;

type MaintenanceProbeEngine = keyof typeof MAINTENANCE_DATABASES;

function isMaintenanceProbeEngine(type: string): type is MaintenanceProbeEngine {
  return type === "postgresql" || type === "mariadb";
}

/** Strips the configured password out of any string bound for a log or a client payload. */
function redactSecret(value: string, secret?: string): string {
  if (!secret) return value;
  return value.split(secret).join("[redacted]");
}

/**
 * Redacts the password from a probe error, keeping it usable for classification.
 *
 * The error is returned unchanged when it cannot leak the secret, so the original
 * `code` (3D000, 28P01, ER_ACCESS_DENIED_ERROR, …) still reaches the classifier.
 */
function sanitizeProbeError(err: unknown, password?: string): unknown {
  const message = err instanceof Error ? err.message : String(err);
  const redacted = redactSecret(message, password);
  if (redacted === message) return err;

  const sanitized = new Error(redacted);
  sanitized.name = err instanceof Error ? err.name : "DatabaseProbeError";
  if (typeof err === "object" && err !== null && "code" in err) {
    (sanitized as Error & { code?: unknown }).code = (err as { code?: unknown }).code;
  }
  return sanitized;
}

/**
 * Proves the supplied credentials by connecting to a maintenance database.
 *
 * Reuses the setup adapter factory with a target override (`name`), so the probe
 * applies exactly the connection options a real connection uses (host, port, user,
 * password, TLS/transport rules) and runs the adapter's own `SELECT 1` handshake —
 * one short-lived connection, disconnected on every path, never provisioning.
 */
async function proveCredentialsOnMaintenanceDatabase(
  dbConfig: DatabaseConfig,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const targets = MAINTENANCE_DATABASES[dbConfig.type as MaintenanceProbeEngine];
  const utils = await import("./setup-utils");
  let firstError: unknown;

  for (const name of targets) {
    let dbAdapter: IDBAdapter | undefined;
    try {
      logger.debug(
        `[Setup] Database "${dbConfig.name}" is missing; proving credentials against "${name}"`,
      );
      const connection = await utils.getSetupDatabaseAdapter(
        { ...dbConfig, name },
        {
          createIfMissing: false, // a proof must never create anything
          skipModuleInit: true,
          readOnlyProbe: true, // skip connect-time schema bootstrap
        },
      );
      dbAdapter = connection.dbAdapter;
      const health = await dbAdapter.getConnectionHealth();
      if (!health.success) throw new Error(health.message);
      return { ok: true };
    } catch (err) {
      firstError ??= sanitizeProbeError(err, dbConfig.password);
    } finally {
      if (dbAdapter) {
        await dbAdapter.disconnect().catch((disconnectErr: unknown) => {
          logger.debug("[Setup] Maintenance probe disconnect failed", disconnectErr);
        });
      }
    }
  }

  return { ok: false, error: firstError };
}

/**
 * Probe a database connection **without mutating it**.
 * Validates connectivity/authentication and inspects whether the target is empty.
 * It never creates the database file/schema, never seeds system data and never
 * writes `config/private.ts` — those writes run on the wizard's explicit
 * Next/Complete step. A target that does not exist yet is reported as
 * `willCreate: true` instead of being materialized here.
 *
 * @param _createIfMissing Legacy flag retained for the remote/action contract —
 *   probes never create the database, so it is intentionally ignored.
 * @param allowOverwrite Explicit, user-confirmed overwrite of a conflicting DB.
 * @param ownsDatabase The wizard already tested & seeded this DB, so skip the
 *   "not empty" guard on re-tests (only a *foreign* non-empty DB should trip it).
 */
export async function testDatabaseConnection(
  configData: DbConfig,
  _createIfMissing = false,
  allowOverwrite = false,
  ownsDatabase = false,
) {
  const rawPort = configData.port;
  let parsedPort: number | undefined;
  if (rawPort !== "" && rawPort !== null && rawPort !== undefined) {
    const n = Number(rawPort);
    if (!Number.isNaN(n)) parsedPort = n;
  }
  const normalizedConfig = { ...configData, port: parsedPort };

  const { success, output: dbConfig } = safeParse(databaseConfigSchema, normalizedConfig);
  if (!(success && dbConfig)) return { success: false, error: "Invalid configuration" };

  const diskCheck = await verifyDiskSpace();
  if (diskCheck) return diskCheck;

  const start = performance.now();
  const missingMessage = `Database "${dbConfig.name}" does not exist yet. It will be created when you continue setup.`;
  // The wizard's own database (created + seeded on the Next step) is expected to be
  // non-empty on a re-test. Only a *foreign* non-empty target should trip the guard.
  let wizardOwned = ownsDatabase || isWizardOwnedDatabase(dbConfig);
  try {
    const utils = await import("./setup-utils");
    if (allowOverwrite) {
      await dropDatabase(dbConfig);
      // The confirmed overwrite destroyed the previous contents — this session no
      // longer owns a database whose system data is gone.
      wizardOwnedDatabases.delete(databaseFingerprint(dbConfig));
      wizardOwned = false;
    }

    // SQLite: connecting creates the file, so check the target on disk first.
    // A missing file is a valid configuration — just not materialized yet.
    if (dbConfig.type === "sqlite" && !existsSync(utils.buildDatabaseConnectionString(dbConfig))) {
      return {
        success: true,
        message: missingMessage,
        willCreate: true,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    const { dbAdapter } = await utils.getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: false, // a probe must never create the target
      skipModuleInit: true, // never ensure system tables during a probe
      readOnlyProbe: true, // skip connect-time schema bootstrap (PG/MariaDB)
    });

    const health = await dbAdapter.getConnectionHealth();
    if (!health.success) {
      await dbAdapter.disconnect();
      const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
      return new SetupDatabaseError(
        classifyDatabaseError(health.message, dbConfig.type, dbConfig),
      ).toClientPayload();
    }

    const isEmptyRes = await dbAdapter.isEmpty();
    if (isEmptyRes.success && !isEmptyRes.data && !allowOverwrite && !wizardOwned) {
      // In test mode, the test harness resets the DB before each file — skip the
      // emptiness warning to avoid false positives from test collection seeding.
      const isTest = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
      if (!isTest) {
        await dbAdapter.disconnect();
        const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
        return new SetupDatabaseError(
          classifyDatabaseError(new Error("Database not empty"), dbConfig.type, dbConfig),
        ).toClientPayload();
      }
    }

    // The probe stops here: modules/tables/private-config are provisioned by
    // `seedDatabase()` on the explicit Next step (or `completeSetup()`).
    const willCreate = isEmptyRes.success && isEmptyRes.data === true;
    await dbAdapter.disconnect();
    return {
      success: true,
      message: willCreate
        ? "Database connected. System tables and data will be initialized when you continue setup."
        : wizardOwned
          ? "Database connected — created by this setup session. Its tables hold your setup data."
          : "Database connected successfully!",
      willCreate,
      wizardOwned,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    // A missing target is not an error *if* the credentials are valid: setup will
    // create it at the explicit provisioning step. "Database does not exist" alone
    // is not that proof — with a non-existent role and a dummy password it still
    // produced a false success — so the credentials are proven against a
    // maintenance database before `willCreate` is promised. A failed proof reports
    // the real error through the normal classification path.
    if (isMissingDatabaseError(err, dbConfig.type)) {
      const proof = isMaintenanceProbeEngine(dbConfig.type)
        ? await proveCredentialsOnMaintenanceDatabase(dbConfig)
        : ({ ok: true } as const);

      if (proof.ok) {
        return {
          success: true,
          message: missingMessage,
          willCreate: true,
          latencyMs: Math.round(performance.now() - start),
        };
      }

      const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
      const proofError = proof.error ?? err;
      return new SetupDatabaseError(
        classifyDatabaseError(proofError, dbConfig.type, dbConfig),
        proofError,
      ).toClientPayload();
    }
    const { classifyDatabaseError, SetupDatabaseError } = await import("./error-classifier");
    return new SetupDatabaseError(
      classifyDatabaseError(err, dbConfig.type, dbConfig),
      err,
    ).toClientPayload();
  }
}

export async function seedDatabase(configData: DbConfig, systemData: SystemSettings = {}) {
  const rawPort = configData.port;
  let parsedPort: number | undefined;
  if (rawPort !== "" && rawPort !== null && rawPort !== undefined) {
    const n = Number(rawPort);
    if (!Number.isNaN(n)) parsedPort = n;
  }
  const normalizedConfig = { ...configData, port: parsedPort };

  const { success, output: dbConfig } = safeParse(databaseConfigSchema, normalizedConfig);
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
    const { getSetupDatabaseAdapter } = await import("./setup-utils");
    const { setupManager } = await import("./setup-manager");

    let dbAdapter: Awaited<ReturnType<typeof getSetupDatabaseAdapter>>["dbAdapter"];
    try {
      ({ dbAdapter } = await getSetupDatabaseAdapter(dbConfig, {
        createIfMissing: true,
      }));
    } catch (err) {
      // Explicit provisioning step: PostgreSQL does not create a missing database
      // on connect (MariaDB does, SQLite/Mongo create lazily). The connection
      // probe deliberately never does this, so create + retry once here.
      if (!isMissingDatabaseError(err, dbConfig.type)) throw err;
      await createDatabase(dbConfig);
      ({ dbAdapter } = await getSetupDatabaseAdapter(dbConfig, { createIfMissing: true }));
    }
    // Step 0 seedDatabase() runs WITHOUT preset collections — only system data
    // (settings, roles, themes). The user hasn't chosen their blueprint yet.
    // Preset collections are seeded later in completeSetup() at step 2.
    const { criticalPromise, backgroundTask } = await initSystemFast(
      dbAdapter,
      null,
      systemData.demoMode || false,
      null,
    );
    setupManager.startSeeding(async () => {
      await criticalPromise;
      setupManager.startBackgroundWork(async () => {
        await backgroundTask();
        await dbAdapter.disconnect();
      });
    });
    // This session created/seeded the target: a later re-test must not offer to
    // permanently delete the wizard's own database (SV-003).
    wizardOwnedDatabases.add(databaseFingerprint(dbConfig));
    return {
      success: true,
      message: "Database configuration saved. Seeding started!",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errMsg,
      code: errMsg.includes("Cannot overwrite") ? "SETUP_ALREADY_COMPLETE" : undefined,
    };
  }
}

export async function completeSetup(
  database: DbConfig,
  admin: AdminUser,
  system: SystemSettings = {},
  emailSettings: Record<string, unknown> = {},
) {
  if (!safeParse(setupAdminSchema, admin).success)
    return { success: false, error: "Invalid admin data" };

  // 🛡️ Fail-closed defense: We deliberately do NOT use isSetupComplete() here.
  // The shallow isSetupComplete() check returns true as soon as seedDatabase writes private.ts,
  // which incorrectly blocks this function from creating the admin user in step 2.
  // Instead, the true defense against Admin Takeover is the adminCount > 0 check below.
  const { setupManager } = await import("./setup-manager");

  // The connection probe is read-only; provisioning runs on the wizard's explicit
  // Next step. A resuming/API-driven flow can reach Complete without that click,
  // so make sure the deferred seed (private config + system tables/settings/roles/
  // themes) actually ran before the writes below depend on it.
  if (!setupManager.hasStarted) {
    const seeded = await seedDatabase(database, system);
    if (!seeded.success) {
      return {
        success: false,
        error: "error" in seeded ? seeded.error : "Database initialization failed",
      };
    }
  }

  if (process.env.TEST_MODE === "true" || database.type === "sqlite") {
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

  const { initializeWithConfig, dbAdapter: ga } = await loadDbModule();
  let dbAdapter: IDBAdapter | undefined;
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
        await import("./setup-utils")
      ).getSetupDatabaseAdapter(database as never, { createIfMissing: true })
    ).dbAdapter;
  }

  if (!dbAdapter) {
    return { success: false, error: "Database adapter failed to initialize" };
  }

  let effectiveTenantId: string | null = null;
  const { legalPageBody, marketFromForm } = await import("./market");
  const market = marketFromForm(system);

  // Seed preset collections once the user has chosen their blueprint (step 2).
  // Step 0 seedDatabase() always runs with preset "blank" — collections are applied here only.
  if (system.preset && system.preset !== "blank") {
    const { seedPresetCollections } = await import("./seed");

    // In multi-tenant mode, resolve the primary tenant ID so collection files
    // are written to config/{tenant}/collections/ instead of flat config/collections/
    if (system.multiTenant && dbAdapter.system?.tenants) {
      const primaryTenantId = (
        system.siteName ? system.siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : generateUUID()
      ) as DatabaseId;

      // Create the primary tenant if it doesn't exist
      try {
        const existing = await dbAdapter.system.tenants.getById(primaryTenantId);
        if (!existing.success || !existing.data) {
          const createResult = await dbAdapter.system.tenants.create({
            _id: primaryTenantId,
            name: system.siteName || "Primary",
            ownerId: primaryTenantId,
            status: "active",
            plan: "enterprise",
            quota: {
              maxUsers: 99999,
              maxStorageBytes: 999999999999,
              maxCollections: 9999,
              maxApiRequestsPerMonth: 999999,
            },
            usage: {
              usersCount: 1,
              storageBytes: 0,
              collectionsCount: 0,
              apiRequestsMonth: 0,
              lastUpdated: new Date(),
            },
          });
          if (createResult.success) {
            logger.info(`[Setup] Created primary tenant: ${primaryTenantId}`);
            effectiveTenantId = primaryTenantId;
          } else {
            logger.warn(
              `[Setup] Failed to create primary tenant: ${createResult.error?.message || "Unknown error"}, falling back to flat config`,
            );
          }
        } else {
          effectiveTenantId = primaryTenantId;
        }
      } catch (e) {
        logger.warn("[Setup] Failed to create primary tenant, falling back to flat config:", e);
      }
    }

    await seedPresetCollections(dbAdapter, system.preset, effectiveTenantId, undefined, {
      replaceAll: true,
    });
    try {
      const { refreshContent } = await loadEngineServerModule();
      await refreshContent(effectiveTenantId ?? null, { mode: "schemas", adapter: dbAdapter });
    } catch (e) {
      logger.warn("[Setup] Content refresh after preset seeding failed:", e);
    }

    if (system.preset === "website") {
      const { seedWebsiteStarterPages } = await import("./seed");
      await seedWebsiteStarterPages(dbAdapter, {
        siteName: system.siteName || "SveltyCMS",
        legalTitle: market.legalTitle,
        legalSlug: market.legalSlug,
        legalBody: legalPageBody(system.siteName || "SveltyCMS", market.homeCountry),
      });

      // The blueprint promises "taken to your new site", but a seeded `home` page
      // only renders at `/` while the public site starter is on. `SITE_STARTER_ENABLED`
      // defaults to false so headless presets stay headless (SV-046); write it through
      // the normal settings writer so guests get the homepage instead of `/login`.
      // `isSiteStarterEnabled()` reads the global scope (no tenant argument), so the
      // flag is written there — a tenant-scoped row would never be consulted.
      try {
        const { setPublicSetting, invalidateSettingsCache } = await loadSettingsServiceModule();
        await setPublicSetting("SITE_STARTER_ENABLED", true);
        invalidateSettingsCache();
      } catch (err) {
        logger.warn(
          "[Setup] Failed to enable the public site starter for the website preset:",
          err,
        );
      }
    }

    if (system.preset === "ecommerce") {
      const { seedEcommerceDefaults } = await import("./seed");
      await seedEcommerceDefaults(dbAdapter, {
        tenantId: effectiveTenantId,
        market: {
          homeCountry: market.homeCountry,
          taxRate: market.taxRate,
          reducedRate: market.reducedRate,
          label: market.storeLanguage === "de" ? "MwSt" : "VAT",
        },
      });
    }
  }

  if (dbAdapter) {
    const { persistInstallMarket } = await import("./seed");
    await persistInstallMarket(dbAdapter, market, { tenantId: effectiveTenantId });
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
      if (system.systemLanguages?.length) {
        try {
          const { syncInlangSystemLocales } = await import("./sync-inlang-locales.server");
          const inlang = await syncInlangSystemLocales(system.systemLanguages);
          if (inlang.added.length) {
            logger.info(
              `[Setup] Inlang locales added: ${inlang.added.join(", ")} (translated=${inlang.translated}, compiled=${inlang.compiled})`,
            );
          }
          if (inlang.error) {
            logger.warn("[Setup] Inlang catalog sync warning:", inlang.error);
          }
        } catch (e) {
          logger.warn(
            "[Setup] Inlang catalog sync failed (setup continues with EN/DE catalogs):",
            e,
          );
        }
      }
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
          // Demo visitors each get a seeded ephemeral tenant, so DEMO always
          // implies tenant isolation even if the wizard toggle was left off.
          multiTenant: system.multiTenant || system.demoMode,
          demoMode: system.demoMode,
        });
      } catch (modeError) {
        logger.error("Failed to update architectural modes in private.ts:", modeError);
      }

      // Invalidate settings cache + reload private config to pick up MULTI_TENANT/DEMO changes
      const { invalidateSettingsCache } = await loadSettingsServiceModule();
      invalidateSettingsCache();
      const { clearPrivateConfigCache, loadPrivateConfig } =
        await import("@src/databases/config-state");
      clearPrivateConfigCache();
      await loadPrivateConfig(true);
      const { resetMultiTenantCache } = await import("@utils/tenant-isolation.server");
      resetMultiTenantCache();
    } catch (e) {
      logger.error("Failed to save custom system preferences during setup:", e);
    }
  }

  const { Auth } = await import("@src/databases/auth");
  const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
  const auth = new Auth(dbAdapter, getDefaultSessionStore());

  const existing = await auth.getUserByEmail(
    { email: admin.email, tenantId: undefined },
    withSystemScope("bootstrap"),
  );
  // Defense: if any admin already exists in DB, refuse (config/private.ts missing/corrupt case)
  try {
    const adminCountResult = await dbAdapter.auth.getUserCount(
      { role: "admin" },
      withSystemScope("bootstrap"),
    );
    const adminCount =
      typeof adminCountResult === "number"
        ? adminCountResult
        : adminCountResult?.success
          ? adminCountResult.data
          : 0;
    if (adminCount > 0 && !existing) {
      return {
        success: false,
        error: "Database contains registered administrator accounts. Setup cannot be re-run.",
        code: "SETUP_ALREADY_COMPLETE",
      };
    }
  } catch {
    /* count unavailable — continue carefully */
  }

  let session: { _id: string; user_id: string } | null = null;
  if (existing) {
    // Only allow password reset path during first-time setup for the bootstrap admin email
    await auth.updateUserPassword(admin.email, admin.password, {
      ...withSystemScope("setup"),
    });
    await auth.updateUser(
      existing._id,
      {
        username: admin.username,
        role: "admin",
        isRegistered: true,
        isAdmin: true,
        ...(effectiveTenantId ? { tenantId: effectiveTenantId as DatabaseId } : {}),
      },
      { ...withSystemScope("setup"), allowPrivilegeEscalation: true },
    );
    session = await auth.createSession(
      {
        user_id: existing._id,
        expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
        ...(effectiveTenantId ? { tenantId: effectiveTenantId as DatabaseId } : {}),
      },
      withSystemScope("bootstrap"),
    );
  } else {
    const r = await auth.createUserAndSession(
      {
        username: admin.username,
        email: admin.email,
        password: admin.password,
        role: "admin",
        isRegistered: true,
        ...(effectiveTenantId ? { tenantId: effectiveTenantId as DatabaseId } : {}),
      },
      {
        expires: new Date(Date.now() + 86400000).toISOString() as ISODateString,
        ...(effectiveTenantId ? { tenantId: effectiveTenantId as DatabaseId } : {}),
      },
      withSystemScope("bootstrap"),
    );
    if (!r.success)
      return {
        success: false,
        error: r.error?.message || "User creation failed",
      };
    session = r.data.session;
  }

  if (!session) return { success: false, error: "Session creation failed" };

  if (system.preset === "website") {
    try {
      const { pluginRegistry } = await import("@src/plugins/registry");
      const adminUserId = String((session as { user_id?: string }).user_id || "");
      await pluginRegistry.togglePlugin(
        "editable-website",
        true,
        "default",
        adminUserId,
        dbAdapter,
      );
      logger.info(
        "[Setup] Auto-enabled Editable Website plugin for Website Starter (trial active)",
      );
    } catch (e) {
      logger.warn("[Setup] Failed to auto-enable Editable Website plugin:", e);
    }
  }

  // 🚀 Prime the in-memory session cache so getUserFromSession gets an instant hit,
  // bypassing the sqlite-proxy validateSession query entirely.
  try {
    const user = await auth.getUserById(session.user_id as DatabaseId);
    if (user) {
      const { primeSessionMemoryCache } = await loadHandleAuthenticationModule();
      primeSessionMemoryCache(session._id, user);
      logger.info(`[Setup] Primed session cache for ${user.email}`);
    }
  } catch (e) {
    logger.warn("[Setup] Failed to prime session cache:", e);
  }

  const { SESSION_COOKIE_NAME } = await loadAuthConstantsModule();
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

  // Prefer /login after setup: session cookie is set and the route is cold-boot safe.
  // /config/collectionbuilder often 500s while the content engine warms (breaks E2E).
  // In TEST_MODE always use /login so e2e-prep is deterministic.
  let redirectPath = "/login";
  const isTest =
    process.env.TEST_MODE === "true" ||
    process.env.BENCHMARK === "true" ||
    process.env.NODE_ENV === "test";
  if (!isTest) {
    try {
      const { getCachedFirstCollectionPath, invalidateFirstCollectionPathCache } =
        await import("@utils/server/collection-utils.server");
      // The wizard may have run before in this process and left a 5-minute
      // memo of the OLD first collection. Drop it so the redirect reflects the
      // collections seeded in THIS run — a stale path sends a fresh install to
      // a route that no longer exists (observed: re-running setup with a
      // different/blank preset redirected to the previous install's collection).
      invalidateFirstCollectionPathCache();
      const path = await getCachedFirstCollectionPath("en", effectiveTenantId);
      if (path) redirectPath = path;
    } catch {
      // Collections may not be seeded yet — keep /login
    }
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
    // 🧠 HARDWARE-AWARE SETUP: the profile detected at boot tells the wizard how
    // the host will be tuned (threads, sharp, DB pool, workers) — surfaced so the
    // operator can see the machine the CMS adapted to and override via env if needed.
    hardware: describeHardware(),
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
    // Cold path: only the wizard's SMTP self-test needs the transport package.
    const { default: nodemailer } = await import("nodemailer");
    const t = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
      connectionTimeout: 10000,
    });
    await t.sendMail({
      from: cfg.from || cfg.user,
      to: cfg.testEmail,
      subject: "SveltyCMS Email Test",
      text: "Test email from SveltyCMS setup wizard.",
    });
    return { success: true, message: "Test email sent!" };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
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
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function probeRedis() {
  const { checkRedis } = await import("./setup-utils");
  return checkRedis();
}

// ── internal helpers ──
async function dropDatabase(db: DatabaseConfig) {
  // Pre-auth wizard input reaches raw DDL below — the identifier allowlist is
  // applied per SQL-engine branch. SQLite's "name" is a filename and MongoDB's
  // is a URI segment, so neither is a SQL identifier.
  if (db.type === "mongodb" || db.type === "mongodb+srv") {
    const m = (await import("mongoose")).default;
    const uri = db.host.includes("://")
      ? db.host
      : `mongodb://${db.user ? `${db.user}:${db.password}@` : ""}${db.host}:${db.port || 27017}/${db.name}`;
    const c = await m.createConnection(uri).asPromise();
    await c.dropDatabase();
    await c.close();
  } else if (db.type === "mariadb") {
    const { assertSafeSqlIdentifier } = await import("@databases/core/relational-utils");
    assertSafeSqlIdentifier(db.name, "database name");
    const m = await import("mysql2/promise");
    const c = await m.createConnection({
      host: db.host,
      port: Number(db.port) || undefined,
      user: db.user,
      password: db.password,
    });
    await c.query(`DROP DATABASE IF EXISTS \`${db.name}\``);
    await c.end();
  } else if (db.type === "postgresql") {
    const { assertSafeSqlIdentifier } = await import("@databases/core/relational-utils");
    assertSafeSqlIdentifier(db.name, "database name");
    const p = (await import("postgres")).default;
    const s = p({
      host: db.host,
      port: Number(db.port) || undefined,
      user: db.user,
      password: db.password,
      database: "postgres",
    });
    // SQL-escape value + identifiers — db.name comes from operator config but is
    // interpolated into a raw statement (postgres.js unsafe has no identifier binding)
    const escSql = (v: string) => v.replace(/'/g, "''");
    const escId = (v: string) => v.replace(/"/g, '""');
    await s
      .unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${escSql(db.name)}'`,
      )
      .catch(() => {
        logger.debug("PG terminate backend failed silently during database drop");
      });
    try {
      await s.unsafe(`DROP DATABASE IF EXISTS "${escId(db.name)}" WITH (FORCE)`);
    } catch {
      await s.unsafe(`DROP DATABASE IF EXISTS "${escId(db.name)}"`);
    }
    await s.end();
  } else if (db.type === "sqlite") {
    // SQLite's "database" is a file plus its -wal/-shm sidecars — remove them.
    const { buildDatabaseConnectionString } = await import("./setup-utils");
    const p = buildDatabaseConnectionString(db);
    for (const file of [p, `${p}-wal`, `${p}-shm`]) {
      if (!existsSync(file)) continue;
      let deleted = false;
      for (let attempt = 0; attempt < 5 && !deleted; attempt++) {
        try {
          unlinkSync(file);
          deleted = true;
        } catch {
          if (attempt < 4) await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }
}
async function createDatabase(db: DatabaseConfig) {
  // Same per-engine allowlist as dropDatabase — db.name must never reach raw DDL
  // unvalidated (SQLite's name is a filename, not a SQL identifier).
  // Only the explicit provisioning step (seedDatabase) calls this; connection
  // probes report a missing target instead of creating it.
  if (db.type === "sqlite") {
    const { buildDatabaseConnectionString } = await import("./setup-utils");
    mkdirSync(dirname(buildDatabaseConnectionString(db)), { recursive: true });
  } else if (db.type === "postgresql") {
    const { assertSafeSqlIdentifier } = await import("@databases/core/relational-utils");
    assertSafeSqlIdentifier(db.name, "database name");
    const p = (await import("postgres")).default;
    const s = p({
      host: db.host,
      port: Number(db.port) || undefined,
      user: db.user,
      password: db.password,
      database: "postgres",
    });
    await s.unsafe(`CREATE DATABASE "${db.name}"`);
    await s.end();
  } else if (db.type === "mariadb") {
    const { assertSafeSqlIdentifier } = await import("@databases/core/relational-utils");
    assertSafeSqlIdentifier(db.name, "database name");
    const m = await import("mysql2/promise");
    const c = await m.createConnection({
      host: db.host,
      port: Number(db.port) || undefined,
      user: db.user,
      password: db.password,
    });
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${db.name}\``);
    await c.end();
  }
}
