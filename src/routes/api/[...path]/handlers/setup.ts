/**
 * @file src/routes/api/[...path]/handlers/setup.ts
 * @description Dedicated setup and initialization handler for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "./base";
import { safeParse } from "valibot";
import { databaseConfigSchema } from "@src/databases/schemas";
import { setupAdminSchema } from "@utils/schemas";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import type { ISODateString } from "@src/databases/db-interface";
import { setupManager } from "@src/routes/setup/setup-manager";
import { dev } from "$app/environment";

export async function handleSetupRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url } = event;
  const action = segments[1] as string;

  // 🛡️ ENHANCEMENT: Check if setup is complete before allowing any API calls.
  const { isSetupComplete } = await import("@src/utils/setup-check");
  if (isSetupComplete()) {
    throw new AppError(
      "CMS Setup already complete. Please use the Admin panel for configuration.",
      403,
      "SETUP_ALREADY_COMPLETE",
    );
  }

  // Validate that action is one we handle
  const validActions = ["status", "test-db", "seed-db", "complete", "reinitialize"];
  if (!validActions.includes(action)) {
    throw new AppError(`Setup endpoint /api/setup/${action} requires 'status' check first`, 404);
  }

  // --- GET /api/setup/status ---
  if (action === "status" && request.method === "GET") {
    const isInitialized = !!(await import("@config/private")).privateEnv?.DB_TYPE;
    return successResponse(event, {
      status: isInitialized ? "ready" : "pending",
      initialized: isInitialized,
    });
  }

  // --- POST /api/setup/test-db ---
  if (action === "test-db" && request.method === "POST") {
    const configData = await request.json();

    // Coerce port to number
    if (configData.port === "" || configData.port === null) {
      configData.port = undefined;
    } else if (configData.port !== undefined && typeof configData.port === "string") {
      configData.port = Number(configData.port);
    }

    const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
    if (!(success && dbConfig)) {
      throw new AppError("Invalid database configuration", 400, "VALIDATION_ERROR", issues);
    }

    // Use the utility function to get an isolated adapter instance
    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    let adapterWrapper: Awaited<ReturnType<typeof getSetupDatabaseAdapter>> | undefined;
    try {
      adapterWrapper = await getSetupDatabaseAdapter(dbConfig, {
        createIfMissing: true,
      });
      const dbAdapter = adapterWrapper.dbAdapter;

      // Test connection health
      if (!(await dbAdapter.getConnectionHealth())) {
        throw new AppError("Initial connection test failed.", 400);
      }

      const healthCheck = await dbAdapter.getConnectionHealth();
      if (!healthCheck.success) {
        throw new AppError(`Connection failed: ${healthCheck.message}`, 400, "DB_CONNECT_FAILED");
      }
    } catch (e) {
      if (adapterWrapper?.dbAdapter?.disconnect) {
        await adapterWrapper.dbAdapter.disconnect();
      }
      console.error("Database setup test error:", e);
      throw new AppError(
        `Failed to connect/test DB: ${e instanceof Error ? e.message : String(e)}`,
        400,
        "DB_CONNECT_ERROR",
      );
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

  // --- POST /api/setup/seed-db ---
  if (action === "seed-db" && request.method === "POST") {
    const { config: dbConfig } = await request.json();

    // 1. Write private config and invalidate cache first
    const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");
    await writePrivateConfig(dbConfig);

    const { invalidateSetupCache } = await import("@src/utils/setup-check");
    invalidateSetupCache(true);

    // 2. Initialize adapter and run seeding
    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    const { initSystemFast } = await import("@src/routes/setup/seed");
    const adapterWrapper = await getSetupDatabaseAdapter(dbConfig, {
      createIfMissing: true,
    });
    const dbAdapter = adapterWrapper.dbAdapter;

    const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

    setupManager.startSeeding(async () => {
      // Wait for all necessary infrastructure to be seeded before proceeding
      await criticalPromise;
      setupManager.startBackgroundWork(backgroundTask);
    });

    return successResponse(event, {
      success: true,
      message: "Database seeding process initiated successfully",
    });
  }

  // --- POST /api/setup/complete ---
  if (action === "complete" && request.method === "POST") {
    const { database, admin, system = {} } = await request.json();

    // 1. Wait for critical seeding to finish before finalizing setup
    await setupManager.waitTillDone();

    // 2. Get adapter and keep it alive for authentication
    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    const adapterWrapper = await getSetupDatabaseAdapter(database, {
      createIfMissing: true,
    });
    const dbAdapter = adapterWrapper.dbAdapter;

    const adminValidation = safeParse(setupAdminSchema, admin);
    if (!adminValidation.success) {
      // Clean up adapter before throwing
      await dbAdapter.disconnect();
      throw new AppError("Invalid administrator data provided", 400, "ADMIN_VALIDATION_FAILED");
    }

    // 3. Authentication Setup
    const { Auth } = await import("@src/databases/auth");
    const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
    const setupAuth = new Auth(dbAdapter, getDefaultSessionStore());

    // Create Admin User & Session
    const authResult = await setupAuth.createUserAndSession(
      {
        username: admin.username,
        email: admin.email,
        password: admin.password,
        role: "admin" as any,
        isAdmin: true, // 🚀 Explicitly mark first user as admin
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

    const session = authResult.data.session;
    const isSecure = url.protocol === "https:" || (url.hostname !== "localhost" && !dev);
    // 🛡️ Prefix consistency: use __Host- on secure connections (prevents subdomain cookie tossing)
    const cookieName = isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;

    event.cookies.set(cookieName, session._id as string, {
      path: "/",
      httpOnly: true,
      sameSite: isSecure ? "strict" : "lax",
      secure: isSecure,
      maxAge: 60 * 60 * 24,
    });

    // Finalize system with configuration and initialize the core DB adapter instance for subsequent requests.
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

    return successResponse(event, {
      success: true,
      message: "SveltyCMS setup complete and environment initialized.",
    });
  }

  // --- POST /api/setup/reinitialize ---
  if (action === "reinitialize" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return successResponse(event, await cms.system.reinitialize(body.force ?? true));
  }

  throw new AppError(
    `Setup endpoint /api/setup/${action} not implemented or method forbidden`,
    404,
  );
}
