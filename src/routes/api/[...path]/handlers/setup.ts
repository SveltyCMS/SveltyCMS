/**
 * @file src/routes/api/[...path]/handlers/setup.ts
 * @description Dedicated setup and initialization handler for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/local-cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "./base";
import { safeParse } from "valibot";
import { databaseConfigSchema } from "@src/databases/schemas";
import { setupAdminSchema } from "@utils/form-schemas";
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
  const action = segments[1];

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
    } else if (configData.port !== undefined) {
      configData.port = Number(configData.port);
    }

    const { success, issues, output: dbConfig } = safeParse(databaseConfigSchema, configData);
    if (!(success && dbConfig)) {
      throw new AppError("Invalid database configuration", 400, "VALIDATION_ERROR", issues);
    }

    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, { createIfMissing: true });

    const health = await dbAdapter.getConnectionHealth();
    await dbAdapter.disconnect();

    if (!health.success) {
      throw new AppError(`Connection failed: ${health.message}`, 400);
    }

    return successResponse(event, { success: true, message: "Database connected successfully" });
  }

  // --- POST /api/setup/seed-db ---
  if (action === "seed-db" && request.method === "POST") {
    const { config: dbConfig } = await request.json();

    // 1. Write private config
    const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");
    await writePrivateConfig(dbConfig);

    const { invalidateSetupCache } = await import("@src/utils/setup-check");
    invalidateSetupCache(true);

    // 2. Start seeding
    const { initSystemFast } = await import("@src/routes/setup/seed");
    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    const { dbAdapter } = await getSetupDatabaseAdapter(dbConfig, { createIfMissing: true });

    const { criticalPromise, backgroundTask } = await initSystemFast(dbAdapter);

    setupManager.startSeeding(async () => {
      await criticalPromise;
      setupManager.startBackgroundWork(backgroundTask);
    });

    return successResponse(event, { success: true, message: "Seeding started" });
  }

  // --- POST /api/setup/complete ---
  if (action === "complete" && request.method === "POST") {
    const { database, admin, system = {} } = await request.json();

    // Wait for critical seeding
    await setupManager.waitTillDone();

    const adminValidation = safeParse(setupAdminSchema, admin);
    if (!adminValidation.success) {
      throw new AppError("Invalid admin data", 400);
    }

    const { getSetupDatabaseAdapter } = await import("@src/routes/setup/utils");
    const { dbAdapter } = await getSetupDatabaseAdapter(database, { createIfMissing: true });

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
        isRegistered: true,
      },
      {
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
      },
      { bypassTenantCheck: true },
    );

    if (!authResult.success || !authResult.data) {
      throw new AppError("Failed to create admin user", 500);
    }

    const session = authResult.data.session;
    const isSecure = url.protocol === "https:" || (url.hostname !== "localhost" && !dev);

    event.cookies.set(SESSION_COOKIE_NAME, session._id as string, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: 60 * 60 * 24,
    });

    // Finalize system
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

    return successResponse(event, { success: true, message: "Setup complete" });
  }

  // --- POST /api/setup/reinitialize ---
  if (action === "reinitialize" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return successResponse(event, await cms.system.reinitialize(body.force ?? true));
  }

  throw new AppError(`Setup endpoint /api/setup/${action} not implemented`, 404);
}
