/**
 * @file src/routes/api/[...path]/handlers/setup.ts
 * @description First-time setup and initialization — database testing, seeding, admin creation, and reinitialization.
 *
 * Responsibilities:
 * - Setup completion gating (403 once setup is done, except reinitialize)
 * - Database connection testing with adapter isolation
 * - Database seeding with critical + background task orchestration
 * - Admin user creation with secure session cookie
 * - System reinitialization for recovery scenarios
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "./base";
import { safeParse } from "valibot";
import { databaseConfigSchema, type DatabaseConfig } from "@src/databases/schemas";
import { setupAdminSchema } from "@utils/schemas";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import type { ISODateString } from "@src/databases/db-interface";
import { setupManager } from "@src/routes/setup/setup-manager";
import { dev } from "$app/environment";

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function handleSetupRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url } = event;
  const action = segments[1] as string;

  try {
    // ── Setup completion gating ──
    // Only "reinitialize" is allowed after setup completes — everything else returns 403.
    const { isSetupComplete } = await import("@src/utils/server/setup-check");
    if (isSetupComplete() && action !== "reinitialize") {
      throw new AppError(
        "Setup is already complete. Use the Admin panel for further configuration.",
        403,
        "SETUP_ALREADY_COMPLETE",
      );
    }

    // ── Route by action ──
    switch (action) {
      case "status":
        return request.method === "GET" ? handleSetupStatus(event) : notAllowed();

      case "test-db":
        return request.method === "POST" ? handleTestDatabase(event) : notAllowed();

      case "seed-db":
        return request.method === "POST" ? handleSeedDatabase(event) : notAllowed();

      case "complete":
        return request.method === "POST" ? handleCompleteSetup(event, cms, url) : notAllowed();

      case "reinitialize":
        return request.method === "POST" ? handleReinitialize(event, cms) : notAllowed();

      default:
        throw new AppError(`Setup action '${action}' not implemented`, 404);
    }
  } catch (err: any) {
    console.error(`[SetupRoute Error] ${action}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Setup operation failed", 500);
  }
}

// ─── Setup Handlers ──────────────────────────────────────────────────────────

/** Returns setup status — whether the system has been configured. */
async function handleSetupStatus(event: RequestEvent) {
  const isInitialized = !!(await import("@config/private")).privateEnv?.DB_TYPE;
  return successResponse(event, {
    status: isInitialized ? "ready" : "pending",
    initialized: isInitialized,
  });
}

/**
 * Tests a database configuration by creating an isolated adapter connection,
 * checking health, and cleanly disconnecting.
 */
async function handleTestDatabase(event: RequestEvent) {
  const configData = await event.request.json();

  // Normalize port
  if (configData.port === "" || configData.port === null) {
    configData.port = undefined;
  } else if (typeof configData.port === "string") {
    configData.port = Number(configData.port);
  }

  // Validate port range (1-65535)
  if (typeof configData.port === "number" && isFinite(configData.port)) {
    if (configData.port < 1 || configData.port > 65535) {
      throw new AppError(
        `Invalid port number: ${configData.port}. Must be between 1 and 65535.`,
        400,
      );
    }
  }

  const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
  if (!success || !dbConfig) {
    throw new AppError("Invalid database configuration", 400, "VALIDATION_ERROR", issues);
  }

  const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
  let adapterWrapper: Awaited<ReturnType<typeof getSetupDatabaseAdapter>> | undefined;

  try {
    adapterWrapper = await getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: true,
    });
    const dbAdapter = adapterWrapper.dbAdapter;

    const healthCheck = await dbAdapter.getConnectionHealth();
    if (!healthCheck.success) {
      throw new AppError(`Connection failed: ${healthCheck.message}`, 400, "DB_CONNECT_FAILED");
    }
  } catch (e: any) {
    console.error("Database setup test error:", e);
    throw new AppError(`Failed to connect/test DB: ${e.message}`, 400, "DB_CONNECT_ERROR");
  } finally {
    if (adapterWrapper?.dbAdapter?.disconnect) {
      await adapterWrapper.dbAdapter.disconnect();
    }
  }

  return successResponse(event, {
    success: true,
    message: "Database connection and schema tested successfully",
  });
}

/**
 * Initiates database seeding.
 * Writes the private config, invalidates the setup cache, initializes the
 * adapter, and starts the critical seeding process with background task support.
 */
async function handleSeedDatabase(event: RequestEvent) {
  const { config: dbConfig } = await event.request.json();

  // Validate that the target database is not already seeded with admins (Setup Hijack Protection)
  await verifyDatabaseUnseeded(dbConfig);

  // Write private config and invalidate cache
  const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");
  await writePrivateConfig(dbConfig);

  const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
  invalidateSetupCache(true);

  // Initialize adapter and start seeding
  const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
  const { initSystemFast } = await import("@src/routes/setup/seed");
  const adapterWrapper = await getSetupDatabaseAdapter(dbConfig, {
    createIfMissing: true,
  });
  const dbAdapter = adapterWrapper.dbAdapter;

  const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

  setupManager.startSeeding(async () => {
    await criticalPromise;
    setupManager.startBackgroundWork(backgroundTask);
  });

  return successResponse(event, {
    success: true,
    message: "Database seeding process initiated successfully",
  });
}

/**
 * Completes the setup process:
 * 1. Waits for critical seeding to finish
 * 2. Creates the admin user with a session
 * 3. Sets the secure session cookie
 * 4. Initializes the system with the final configuration
 */
async function handleCompleteSetup(event: RequestEvent, _cms: LocalCMS, url: URL) {
  const { database, admin, system = {} } = await event.request.json();

  // Validate that the target database is not already seeded with admins (Setup Hijack Protection)
  await verifyDatabaseUnseeded(database);

  // Wait for critical seeding to finish
  await setupManager.waitTillDone();

  // Get adapter and keep it alive for authentication
  const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
  const adapterWrapper = await getSetupDatabaseAdapter(database, {
    createIfMissing: true,
  });
  const dbAdapter = adapterWrapper.dbAdapter;

  // Validate admin data
  const adminValidation = safeParse(setupAdminSchema, admin);
  if (!adminValidation.success) {
    await dbAdapter.disconnect();
    throw new AppError("Invalid administrator data provided", 400, "ADMIN_VALIDATION_FAILED");
  }

  // Create admin user and session
  const { Auth } = await import("@src/databases/auth");
  const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
  const setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

  const authResult = await setupAuth.createUserAndSession(
    {
      username: admin.username,
      email: admin.email,
      password: admin.password,
      role: "admin" as any,
      isAdmin: true,
      isRegistered: true,
    },
    {
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
    },
    { bypassTenantCheck: true },
  );

  if (!authResult.success || !authResult.data) {
    throw new AppError("Failed to create admin user during setup", 500, "ADMIN_CREATION_FAILED");
  }

  // Set secure session cookie
  const session = authResult.data.session;
  const isSecure = url.protocol === "https:" || (url.hostname !== "localhost" && !dev);
  const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

  event.cookies.set(cookieName, session._id as string, {
    path: "/",
    httpOnly: true,
    sameSite: isSecure ? "strict" : "lax",
    secure: isSecure,
    maxAge: 60 * 60 * 24, // 24 hours
  });

  // Finalize system configuration
  const { initializeWithConfig } = await import("@src/databases/db");
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
  } as any);

  // Invalidate setup cache so the system performs a fresh deep check on the next request
  const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
  invalidateSetupCache(true);

  return successResponse(event, {
    success: true,
    message: "SveltyCMS setup complete and environment initialized.",
  });
}

/** Reinitializes the system (allowed after setup is complete — recovery tool). */
async function handleReinitialize(event: RequestEvent, cms: LocalCMS) {
  const body = await event.request.json().catch(() => ({}));
  return successResponse(event, await cms.system.reinitialize(body.force ?? true));
}

// ─── Internal ────────────────────────────────────────────────────────────────

function notAllowed(): never {
  throw new AppError("Method not allowed", 405);
}

// Check database state to verify no existing administrators are registered.
// This prevents Setup hijacking if config/private.ts is lost or corrupted.
async function verifyDatabaseUnseeded(dbConfig: DatabaseConfig) {
  const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
  let adapterWrapper;
  try {
    adapterWrapper = await getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: false,
    });
    const dbAdapter = adapterWrapper.dbAdapter;
    const adminCountResult = await dbAdapter.auth.getUserCount(
      { role: "admin" },
      { bypassTenantCheck: true },
    );

    const count =
      typeof adminCountResult === "number"
        ? adminCountResult
        : adminCountResult?.success
          ? adminCountResult.data
          : 0;
    if (count > 0) {
      throw new AppError(
        "Database contains registered administrator accounts. Setup cannot be re-run.",
        403,
        "SETUP_ALREADY_COMPLETE",
      );
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    // Database or table not existing is expected and safe to seed
  } finally {
    if (adapterWrapper?.dbAdapter?.disconnect) {
      await adapterWrapper.dbAdapter.disconnect();
    }
  }
}
