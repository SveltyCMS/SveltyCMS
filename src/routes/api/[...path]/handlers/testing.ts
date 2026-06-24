/**
 * @file src/routes/api/[...path]/handlers/testing.ts
 * @description State-management handler for integration testing (Reset, Seed, Login, Reinitialize).
 *
 * Provides deterministic test infrastructure:
 * - reset: Wipes database, caches, media, and resets system state
 * - seed: Creates admin user + roles + collections, returns session cookie
 * - login: Creates a session for any user, returns set-cookie header
 * - create-user: Provisions additional test users with specified roles
 *
 * All actions require TEST_MODE=true and valid x-test-secret.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { contentSystem } from "@src/content/index.server";
import type { DatabaseId, ISODateString } from "@src/databases/db-interface";
import type { RequestEvent } from "@sveltejs/kit";
import fs from "node:fs";
import path from "node:path";
import { generateUUID } from "@utils/native-utils";

/**
 * Standard testing response helper
 */
function rawResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * MASTER TESTING HANDLER
 * Provides backdoors for test runners to reset state, seed users, and verify internals.
 * 🛡️ This handler is only active when TEST_MODE=true or in authorized benchmark runs.
 */
export async function handleTestingRoutes(
  event: RequestEvent,
  cms: any,
  tenantId: DatabaseId,
  _segments: string[],
) {
  // 🛡️ Strictly enforce environment and cryptographic token verification
  const isTestMode =
    process.env.TEST_MODE === "true" ||
    process.env.BENCHMARK === "true" ||
    process.env.NODE_ENV === "test";

  const requestSecret =
    event.request.headers.get("x-test-secret") || event.request.headers.get("X-Test-Secret");

  const { getTestSecret } = await import("@src/utils/setup-check");
  const expectedSecret = process.env.TEST_API_SECRET || getTestSecret();

  if (!isTestMode || !expectedSecret || !requestSecret) {
    throw new AppError("Unauthorized: Testing endpoints are disabled", 401, "UNAUTHORIZED");
  }

  // 🛡️ TIMING-SAFE: Use constant-time comparison to prevent timing side-channel attacks
  const { timingSafeEqual } = await import("node:crypto");
  const encoder = new TextEncoder();
  const secretBuffer = encoder.encode(requestSecret);
  const expectedBuffer = encoder.encode(expectedSecret);

  if (
    secretBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(secretBuffer, expectedBuffer)
  ) {
    throw new AppError("Unauthorized: Testing endpoints are disabled", 401, "UNAUTHORIZED");
  }

  if (process.env.BENCHMARK_DEBUG === "true") {
    process.stderr.write(
      `🚀 handleTestingRoutes ENTERED: ${event.url.searchParams.get("action")}\n`,
    );
  }
  const { request } = event;
  try {
    const params = await request.json().catch(() => ({}));
    const action = params.action || event.url.searchParams.get("action");

    // 🚀 Robust Parameter Logging (to stderr for benchmark visibility)
    process.stderr.write(
      `[TestingHandler] action: ${action}, collectionId: ${params.collectionId || "N/A"}, tenant: ${tenantId}\n`,
    );
    if (process.env.BENCHMARK_DEBUG === "true") {
      process.stderr.write(`[TestingHandler] Params: ${JSON.stringify(params)}\n`);
    }

    if (action === "reset-to-state") {
      const targetState = params.state || event.url.searchParams.get("state");

      if (!targetState || !["setup", "ready"].includes(targetState)) {
        throw new AppError("state must be 'setup' or 'ready'", 400);
      }

      // Always wipe the DB first
      if (cms.db?.clearDatabase) {
        await cms.db.clearDatabase();
      } else if (cms.db?.reset) {
        await cms.db.reset();
      }

      if (targetState === "setup") {
        // --- Transition to SETUP mode ---
        // Delete config/private.test.ts so isSetupComplete() returns false
        const { invalidateSetupCache } = await import("@src/utils/setup-check");
        const configPath = path.resolve(process.cwd(), "config", "private.test.ts");
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          logger.info("[TestingHandler] Deleted private.test.ts for SETUP transition");
        }
        invalidateSetupCache(false, null);
        (globalThis as any).__SVELTY_SETUP_COMPLETE__ = false;
        (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = null;

        const { resetSystemState } = await import("@src/stores/system/state.svelte.ts");
        resetSystemState();
        const { resetInitializationState } = await import("@src/hooks/handle-system-state");
        resetInitializationState();

        return rawResponse({
          success: true,
          message: "System transitioned to SETUP state",
        });
      }

      // --- Transition to READY mode ---
      // Create config file if it doesn't exist (so DB can reconnect on restart)
      const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");

      try {
        await writePrivateConfig({
          type: "sqlite",
          host: "localhost",
          port: 0,
          name: process.env.DB_NAME || "sveltycms_e2e.db.sqlite",
          user: "",
          password: "",
        });
        logger.info("[TestingHandler] Created private.test.ts for READY transition");
      } catch (writeErr: any) {
        logger.warn(
          `[TestingHandler] Non-fatal: could not write private.test.ts: ${writeErr.message}`,
        );
      }

      // Seed default settings and roles (best-effort — after clearDatabase, adapter may
      // need table re-creation; forced-complete below handles any edge cases).
      const seedEmail = params.email || "admin@test.com";
      const seedPassword = params.password || "Password123!";

      try {
        const { seedRoles, seedSettings } = await import("@src/routes/setup/seed");
        await seedSettings(cms.db, tenantId);
        await seedRoles(cms.db, tenantId);
      } catch (err: any) {
        logger.warn(`[TestingHandler] Non-fatal seed error: ${err.message}`);
      }

      const { Auth } = await import("@src/databases/auth");
      const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
      const setupAuth = new Auth(cms.db, getDefaultSessionStore());
      await setupAuth.createUserAndSession(
        {
          email: seedEmail,
          password: seedPassword,
          username: "admin",
          role: "admin",
          isAdmin: true,
          isRegistered: true,
          emailVerified: true,
        },
        {
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
          tenantId,
        },
        { bypassTenantCheck: true },
      );

      // Initialize content system (collection tables + content_nodes)
      try {
        await contentSystem.initialize(tenantId, { force: true });
        logger.info("[TestingHandler] Content system initialized for READY transition");
      } catch (initErr: any) {
        logger.warn(`[TestingHandler] Non-fatal content init error: ${initErr.message}`);
      }

      // Mark setup as complete
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(false, true);
      (globalThis as any).__SVELTY_SETUP_COMPLETE__ = true;
      (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = true;

      const { setSystemState } = await import("@src/stores/system/state.svelte.ts");
      setSystemState("READY", "Testing API reset-to-state ready");

      return rawResponse({
        success: true,
        message: "System transitioned to READY state",
      });
    }

    if (action === "reset") {
      process.stderr.write(`[TestingHandler] RESET TRIGGERED for tenant: ${tenantId}\n`);

      // 1. Wipe Database (Collections + Data)
      if (cms.db?.clearDatabase) {
        await cms.db.clearDatabase();
      } else if (cms.db?.reset) {
        await cms.db.reset();
      }

      // 2. Wipe Media Folder
      const { getPublicSettingSync } = await import("@src/services/core/settings-service");
      const mediaRoot = getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder";
      const fullMediaRoot = path.resolve(process.cwd(), mediaRoot);
      if (fs.existsSync(fullMediaRoot)) {
        try {
          fs.rmSync(fullMediaRoot, { recursive: true, force: true });
          fs.mkdirSync(fullMediaRoot, { recursive: true });
        } catch (err) {
          console.warn(`[TestingHandler] Failed to clear media folder: ${err}`);
        }
      }

      // Invalidate cache to reflect empty DB
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(false, null);

      try {
        const { cacheService } = await import("@src/databases/cache/cache-service");
        await cacheService.invalidateAll();

        try {
          const { securityResponseService } =
            await import("@src/services/security/response-service");
          securityResponseService.reset();
        } catch (err) {
          console.warn(`[TestingHandler] Failed to reset security response service: ${err}`);
        }

        const { invalidateUserCountCache, invalidateRolesCache } =
          await import("@src/hooks/handle-authorization");
        await invalidateUserCountCache(tenantId);
        await invalidateRolesCache(tenantId);

        // Invalidate OpenAPI spec cache
        const { apiSpecService } = await import("@services/system/api-spec-service");
        await apiSpecService.invalidateCache(tenantId);

        const { ThemeManager } = await import("@src/databases/theme-manager");
        const themeManager = ThemeManager.getInstance();
        if (themeManager.isInitialized()) {
          await themeManager.refresh();
        }
      } catch (err) {
        console.warn(`[TestingHandler] Failed to invalidate authorization/api-spec caches: ${err}`);
      }

      // ✨ Fix: Reset system state store so the system transitions back to SETUP/INITIALIZING
      const { resetSystemState } = await import("@src/stores/system/state.svelte.ts");
      resetSystemState();
      const { resetInitializationState } = await import("@src/hooks/handle-system-state");
      resetInitializationState();

      // 🧪 Ensure setup is marked as incomplete for deterministic wizard testing
      (globalThis as any).__SVELTY_SETUP_COMPLETE__ = false;
      (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = null;

      return rawResponse({
        success: true,
        message: "System reset successfully",
      });
    }

    if (action === "seed") {
      const { email, password, username } = params;
      if (!email || !password) throw new AppError("Email and password required for seeding", 400);

      logger.debug("Seeding test user", { email, tenantId });

      // Seed roles if needed (settings are already seeded by system boot or reset-to-state)
      // Using try/catch because roles may already exist, and this is a convenience seed
      // in beforeEach — failure shouldn't cascade to the test.
      try {
        const { seedRoles } = await import("@src/routes/setup/seed");
        await seedRoles(cms.db, tenantId);
      } catch (err: any) {
        logger.debug(
          `[TestingHandler] Role seeding skipped (likely already seeded): ${err.message}`,
        );
      }

      // 🛡️ IDEMPOTENT SEED: If a user with this email already exists, remove them first
      // so that repeated calls (e.g., per-test beforeEach) always succeed.
      const { Auth } = await import("@src/databases/auth");
      const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
      const setupAuth = new Auth(cms.db, getDefaultSessionStore());

      try {
        const existingUser = await setupAuth.getUserByEmail({ email, tenantId });
        if (existingUser?._id) {
          logger.debug(`[TestingHandler] Removing existing user ${email} before re-seed`);
          await setupAuth.deleteUserAndSessions(existingUser._id, tenantId);
        }
      } catch (lookupErr: any) {
        logger.warn(`[TestingHandler] User lookup during seed failed: ${lookupErr.message}`);
      }

      const authResult = await setupAuth.createUserAndSession(
        {
          email,
          password: password,
          username: username || email.split("@")[0],
          role: "admin",
          isAdmin: true,
          isRegistered: true,
          emailVerified: true,
        },
        {
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
          tenantId,
        },
        { bypassTenantCheck: true },
      );

      if (!authResult.success || !authResult.data) {
        throw new AppError("Failed to create admin user during seed", 500, "ADMIN_CREATION_FAILED");
      }

      // Prime the in-memory session cache so the next request gets an instant hit
      const session = authResult.data.session;
      const user = authResult.data.user;
      const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
      primeSessionMemoryCache(session._id as string, user);

      // Set session cookie on the response
      const sc = setupAuth.createSessionCookie(session._id);
      const cookieHeader = `${sc.name}=${sc.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;

      logger.debug("Seed user creation result", {
        success: authResult.success,
        userId: user?._id,
      });

      // Seed default theme
      const { DEFAULT_THEME } = await import("@src/databases/theme-manager");
      const safeTheme = JSON.parse(JSON.stringify(DEFAULT_THEME));
      await cms.db.system.themes.ensure(safeTheme);

      const { ThemeManager } = await import("@src/databases/theme-manager");
      const themeManager = ThemeManager.getInstance();
      if (themeManager.isInitialized()) {
        await themeManager.refresh();
      }

      // Seed dynamic collection schemas from the filesystem into the database
      try {
        await contentSystem.initialize(tenantId, { force: true });
      } catch (err: any) {
        logger.warn(`[TestingHandler] Non-fatal collection seeding error: ${err.message}`);
      }

      // Mark setup as complete — forces system to COMPLETE state
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(false, true);
      (globalThis as any).__SVELTY_SETUP_COMPLETE__ = true;

      // Transition system state to READY for deterministic testing
      const { setSystemState } = await import("@src/stores/system/state.svelte.ts");
      setSystemState("READY", "Test seed completed");

      // Invalidate roles and user count caches so they are reloaded after seeding
      try {
        const { invalidateUserCountCache, invalidateRolesCache } =
          await import("@src/hooks/handle-authorization");
        await invalidateUserCountCache(tenantId);
        await invalidateRolesCache(tenantId);
      } catch (err: any) {
        logger.warn(
          `[TestingHandler] Non-fatal cache invalidation error during seeding: ${err.message}`,
        );
      }

      // Return session cookie + user data for immediate use by Playwright
      const response = rawResponse({
        success: true,
        message: "System seeded successfully",
        sessionId: session._id,
        userId: user._id,
        email,
      });
      response.headers.append("Set-Cookie", cookieHeader);
      // Also set a custom header for easy extraction by Playwright auth helpers
      response.headers.set("x-test-session-id", session._id as string);
      return response;
    }

    if (action === "login") {
      const { email, password } = params;
      if (!email || !password) throw new AppError("Email and password required for login", 400);

      logger.debug("Test login: creating session for", { email, tenantId });

      // Authenticate via the Auth module
      const { Auth } = await import("@src/databases/auth");
      const { getDefaultSessionStore } = await import("@src/databases/auth/session-manager");
      const setupAuth = new Auth(cms.db, getDefaultSessionStore());

      const authnResult = await setupAuth.authenticate(email, password, { tenantId });
      if (!authnResult.success || !authnResult.data) {
        throw new AppError(
          `Test login failed: ${authnResult.message || "Invalid credentials"}`,
          401,
          "TEST_LOGIN_FAILED",
        );
      }

      const authenticatedUser = authnResult.data;

      // Create a fresh session
      const sessionResult = await setupAuth.createSession({
        user_id: authenticatedUser._id as DatabaseId,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() as ISODateString,
        tenantId,
      });

      if (!sessionResult || !sessionResult._id) {
        throw new AppError("Failed to create session during test login", 500);
      }

      // Prime the in-memory session cache
      const { primeSessionMemoryCache } = await import("@src/hooks/handle-authentication");
      primeSessionMemoryCache(sessionResult._id as string, authenticatedUser);

      // Set session cookie on the response
      const sc = setupAuth.createSessionCookie(sessionResult._id);
      const cookieHeader = `${sc.name}=${sc.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;

      const response = rawResponse({
        success: true,
        message: "Test login successful",
        sessionId: sessionResult._id,
        userId: authenticatedUser._id,
        email: authenticatedUser.email,
      });
      response.headers.append("Set-Cookie", cookieHeader);
      response.headers.set("x-test-session-id", sessionResult._id as string);
      return response;
    }

    if (action === "reinitialize") {
      // Trigger system reload (full crawl/reconciliation)
      await contentSystem.initialize(tenantId, { force: true });
      return rawResponse({
        success: true,
        message: "System reinitialized successfully",
      });
    }

    // 🚀 HARDENING: Wait for database to be ready
    const { isDbConnected, getDbInitPromise, getDb } = await import("@src/databases/db");
    if (!isDbConnected()) {
      logger.info("[testing] DB not connected, waiting for initialization...");
      await getDbInitPromise().catch((err) => {
        logger.error("[testing] getDbInitPromise failed:", err);
      });

      // Secondary poll for safety
      let retries = 15; // Increased for Windows/Slow DBs
      while (!isDbConnected() && retries-- > 0) {
        logger.info(`[testing] Polling for DB connection... (${15 - retries}/15)`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const initializedAdapter = getDb();
    if (!initializedAdapter || !isDbConnected()) {
      const adapterStatus = initializedAdapter ? "exists" : "null";
      const connectedStatus = isDbConnected() ? "true" : "false";
      logger.error(`[testing] 503 ERROR: adapter=${adapterStatus}, isConnected=${connectedStatus}`);
      throw new AppError(
        `Database connection not established. adapter=${adapterStatus}, isConnected=${connectedStatus}`,
        503,
      );
    }

    if (action === "ping") {
      return rawResponse({ success: true, message: "Testing API is online" });
    }

    if (action === "health-deep") {
      try {
        const { getDb } = await import("@src/databases/db");
        const db = getDb();
        if (!db) throw new Error("DB adapter null");

        // Lightweight checks
        const checks = await Promise.all([
          db.crud.count("benchmark_authors", {}).catch(() => ({ data: -1 })),
          db.crud.count("benchmark_posts", {}).catch(() => ({ data: -1 })),
        ]);
        return rawResponse({ success: true, checks });
      } catch (err: any) {
        return rawResponse(
          {
            success: false,
            message: err.message,
          },
          500,
        );
      }
    }

    if (action === "benchmark-ready") {
      // Signal that the system is fully warmed and consistent
      return rawResponse({
        success: true,
        ready: true,
        metrics: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      });
    }

    if (action === "sdk-call") {
      const methodPath = params.method;
      const args = Array.isArray(params.args) ? params.args : [];
      if (!methodPath || typeof methodPath !== "string") {
        throw new AppError("method is required for sdk-call", 400);
      }

      const allowedRoots = new Set(["db", "auth", "collections", "system"]);
      const segments = methodPath.split(".").filter(Boolean);
      if (segments.length < 2 || !allowedRoots.has(segments[0])) {
        throw new AppError(`Unsupported sdk-call method: ${methodPath}`, 400);
      }

      let target: any = cms;
      for (const segment of segments.slice(0, -1)) {
        target = target?.[segment];
      }

      const methodName = segments.at(-1) as string;
      const method = target?.[methodName];
      if (typeof method !== "function") {
        throw new AppError(`SDK method not found: ${methodPath}`, 400);
      }

      const result = await method.apply(target, args);
      return rawResponse({ success: true, data: result });
    }

    if (action === "create-collection" || action === "bulk-create-collections") {
      const schemas =
        action === "bulk-create-collections"
          ? params.schemas
          : [params.schema || params.data || params];
      if (!Array.isArray(schemas)) throw new AppError("Invalid schemas format", 400);

      const results = [];
      for (const schema of schemas) {
        const collectionId = schema._id || schema.id || schema.name;
        try {
          logger.info(`[testing] Provisioning collection: ${collectionId}...`);
          await initializedAdapter.collection.createModel(schema);
          logger.info(`[testing] Model created for: ${collectionId}`);

          if (initializedAdapter.content?.nodes?.upsertContentStructureNode) {
            logger.info(
              `[testing] Upserting content node for ${collectionId} (tenant: ${tenantId})`,
            );
            const node: any = {
              _id: collectionId,
              path: `/collection/${(schema.name || collectionId).toLowerCase()}`,
              name: schema.name || collectionId,
              nodeType: "collection",
              collectionDef: { ...schema, _id: collectionId },
              status: "publish",
              source: "api",
              tenantId,
            };
            const upsertRes =
              await initializedAdapter.content.nodes.upsertContentStructureNode(node);
            logger.info(
              `[testing] Content node upsert result for ${collectionId}: ${upsertRes.success ? "OK" : "FAILED"}`,
            );
            if (!upsertRes.success) {
              logger.error(
                `[testing] Upsert failed for ${collectionId}: ${upsertRes.message || "unknown"}`,
              );
            }
          }
          results.push({ id: collectionId, success: true });
        } catch (e: any) {
          logger.error(`[testing] Failed to provision ${collectionId}:`, e.message);
          results.push({
            id: collectionId,
            success: false,
            error: e.message,
          });
        }
      }

      // Allow MongoDB write concerns to flush before cache refresh
      if (initializedAdapter.type === "mongodb") {
        await new Promise((r) => setTimeout(r, 100));
      }
      // 🚀 BATCH SYNC: Refresh once for all collections
      const { refreshCollectionsCache } = await import("@src/content/content-service.server");
      await refreshCollectionsCache(tenantId, initializedAdapter);

      // 🚀 INVALIDATE OpenAPI spec cache so new collections appear in the API spec
      const { apiSpecService } = await import("@services/system/api-spec-service");
      await apiSpecService.invalidateCache(tenantId);

      // 🚀 SDK CACHE CLEAR: Force the shared CMS instance to drop stale schemas
      if (cms.collections?.refresh) {
        await cms.collections.refresh(tenantId as any, true);
      }

      return rawResponse({ success: results.every((r) => r.success), results });
    }

    if (action === "seed-throughput-docs") {
      const count = params.count || 1000;
      const collectionId = params.collectionId || "BenchmarkStable";
      const adapter = initializedAdapter;

      // Ensure collection exists
      try {
        await adapter.collection.createModel({
          _id: collectionId,
          name: collectionId,
          fields: [
            {
              db_fieldName: "title",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "count",
              widget: { Name: "Input" },
              type: "number",
            },
          ],
        });
      } catch {
        /* already exists */
      }

      // Clear existing throughput docs to prevent UNIQUE constraint violations
      try {
        await adapter.crud.deleteMany(
          collectionId,
          {},
          {
            tenantId,
            permanent: true,
          },
        );
      } catch (err: any) {
        logger.warn(
          `[testing] Failed to clear collection ${collectionId} before seeding: ${err.message}`,
        );
      }

      // Seed in batches
      const BATCH = 100;
      let seeded = 0;
      for (let i = 0; i < count; i += BATCH) {
        const docs = [];
        for (let j = i; j < Math.min(i + BATCH, count); j++) {
          docs.push({
            _id: `tp-${j}`,
            title: `Throughput Doc ${j}`,
            count: 0,
            tenantId,
          });
        }
        await adapter.crud.insertMany(collectionId, docs, {
          tenantId,
        });
        seeded += docs.length;
      }

      return rawResponse({ success: true, seeded, collectionId });
    }

    if (action === "create-redirect") {
      const { from, to, status } = params;
      const source = from || params.source;
      const target = to || params.target;
      if (!source || !target) throw new AppError("source and target required", 400);

      try {
        await initializedAdapter.crud.insert("redirectsMV", {
          _id: (source.replace(/\//g, "_") || generateUUID()) as any,
          source,
          target,
          type: status || params.type || 301,
          active: true,
          tenantId,
        } as any);

        // Clear redirect cache
        const { invalidateRedirectCache } = await import("@src/hooks/handle-redirects");
        invalidateRedirectCache(tenantId);

        return rawResponse({ success: true });
      } catch (err: any) {
        return rawResponse(
          {
            success: false,
            message: err.message,
          },
          500,
        );
      }
    }

    if (action === "insert") {
      const collectionId = params.collectionId || params.collection;
      const data = params.data;

      if (!collectionId) throw new AppError("collection or collectionId required", 400);
      if (!data || typeof data !== "object") throw new AppError("data payload required", 400);

      const result = await initializedAdapter.crud.insert(collectionId, data, {
        tenantId,
        bypassTenantCheck: true,
      });

      const responseBody = result.success
        ? {
            success: true,
            data: result.data,
            message: "Insert successful",
          }
        : {
            success: false,
            message: result.message,
          };

      return rawResponse(responseBody, result.success ? 200 : 400);
    }

    if (action === "update") {
      const collectionId = params.collectionId || params.collection;
      const id = params.id;
      const data = params.data;

      if (!collectionId) throw new AppError("collection or collectionId required", 400);
      if (!id) throw new AppError("id required", 400);
      if (!data || typeof data !== "object") throw new AppError("data payload required", 400);

      const result = await initializedAdapter.crud.update(collectionId, id, data, {
        tenantId,
        bypassTenantCheck: true,
      });

      const responseBody = result.success
        ? {
            success: true,
            data: result.data,
            message: "Update successful",
          }
        : {
            success: false,
            message: result.message,
          };

      return rawResponse(responseBody, result.success ? 200 : 400);
    }

    if (action === "delete") {
      const collectionId = params.collectionId || params.collection;
      const id = params.id;

      if (!collectionId) throw new AppError("collection or collectionId required", 400);
      if (!id) throw new AppError("id required", 400);

      const result = await initializedAdapter.crud.delete(collectionId, id, {
        tenantId,
        bypassTenantCheck: true,
        permanent: true,
      });

      return rawResponse(
        {
          success: result.success,
          message: result.success ? "Delete successful" : result.message,
        },
        result.success ? 200 : 400,
      );
    }

    if (action === "clear-collection") {
      const collectionId = params.collectionId || event.url.searchParams.get("collectionId");
      if (!collectionId) throw new AppError("collectionId required", 400);

      const db = cms.db || initializedAdapter;

      try {
        let tableName;
        try {
          const schema = await cms.collections.getSchema(collectionId, tenantId);
          tableName = cms.collections.getCollectionName(schema._id);
        } catch {
          // 🚀 RESILIENCE: Fallback to naming convention if schema is missing from cache (common during hot-reloads)
          tableName = `collection_${collectionId.replace(/-/g, "")}`;
          if (process.env.BENCHMARK_DEBUG === "true") {
            process.stderr.write(
              `[TestingHandler] clear-collection: Schema missing for ${collectionId}, using fallback: ${tableName}\n`,
            );
          }
        }

        // 🛡️ HARDENING: Standardize tenantId for the delete operation
        const effectiveTenantId = tenantId || "default";

        await db.crud.deleteMany(
          tableName,
          {},
          {
            tenantId: effectiveTenantId as DatabaseId,
            permanent: true,
          },
        );

        // 🚀 CACHE INVALIDATION: Force SDK to drop any cached schemas or entries for this collection
        await cms.collections.refresh(effectiveTenantId as DatabaseId, true);

        return rawResponse({
          success: true,
          message: `Collection ${collectionId} cleared from ${tableName}.`,
        });
      } catch (err: unknown) {
        logger.error(
          `[TestingHandler] clear-collection error for ${collectionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return rawResponse(
          {
            success: false,
            message: err instanceof Error ? err.message : String(err),
          },
          200,
        );
      }
    }

    if (action === "bulk-seed") {
      const { collectionId, data } = params;
      if (!collectionId || !Array.isArray(data)) throw new AppError("Invalid data", 400);

      const { LocalCMS } = await import("@src/services/sdk");
      const localCms = new LocalCMS(initializedAdapter);

      const result = await localCms.collections.bulkCreate(collectionId, data, {
        tenantId,
        skipValidation: true,
        system: true,
      });
      return rawResponse(result);
    }

    if (action === "get-user") {
      const { email } = params;
      const result = await cms.auth.listUsers({ tenantId });
      const user = result.data.find((u: any) => u.email === email);
      return rawResponse({ success: !!user, user });
    }

    if (action === "get-user-count") {
      const result = await cms.db.auth.getUserCount({}, { tenantId });
      const count = result.success ? result.data : 0;
      return rawResponse({ success: true, count });
    }

    if (action === "create-user") {
      const { email, password, username, role = "editor" } = params;
      if (!email || !password) throw new AppError("Email and password required", 400);

      const result = await cms.auth.createUser(
        {
          email,
          password,
          username: username || email.split("@")[0],
          role,
          isRegistered: true,
          emailVerified: true,
        },
        { tenantId },
      );

      return rawResponse({
        success: result.success,
        message: result.success ? "User created" : (result as any).message,
        data: result.success ? result.data : undefined,
      });
    }

    if (action === "emit-event") {
      const { event: eventName, data } = params;
      if (!eventName) throw new AppError("Event name required", 400);

      const payload = { ...data, tenantId: tenantId || "default" };

      // 🚀 DUEL-PATH: Publish both via EventBus (internal listeners) AND globalPlatform (WebSocket)
      // This ensures delivery regardless of whether the platform bridge is initialized
      const { eventBus } = await import("@utils/event-bus");
      eventBus.emit(eventName, payload);

      // Direct WebSocket broadcast via svelte-realtime platform
      const { getGlobalPlatform } = await import("@src/live/ws-platform");
      const globalPlatform = getGlobalPlatform();
      if (globalPlatform) {
        const topic = `system_events:${tenantId || "default"}`;
        try {
          (globalPlatform as any).publish(topic, "create", {
            id: crypto.randomUUID(),
            event: eventName,
            data: payload,
            timestamp: Date.now(),
            tenantId: tenantId || "default",
          });
        } catch (err: any) {
          // Non-critical: EventBus path may still work
          if (process.env.BENCHMARK_DEBUG === "true") {
            process.stderr.write(
              `[TestingHandler] globalPlatform.publish failed: ${err.message}\n`,
            );
          }
        }
      } else if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(
          `[TestingHandler] globalPlatform is null — WebSocket broadcast skipped\n`,
        );
      }

      return rawResponse({ success: true });
    }

    if (action === "emit-ping") {
      // 🚀 DUEL-PATH: Both EventBus and direct WebSocket broadcast
      const payload = {
        type: "ping",
        timestamp: new Date().toISOString(),
        tenantId: tenantId || "default",
      };

      // Internal PubSub for service listeners
      const { pubSub } = await import("@src/services/background/pub-sub");
      pubSub.publish("entryUpdated", payload as any);

      // Direct WebSocket broadcast for connected clients
      const { getGlobalPlatform } = await import("@src/live/ws-platform");
      const globalPlatform = getGlobalPlatform();
      if (globalPlatform) {
        const topic = `system_events:${tenantId || "default"}`;
        try {
          (globalPlatform as any).publish(topic, "update", {
            id: crypto.randomUUID(),
            event: "benchmark.ping",
            data: payload,
            timestamp: Date.now(),
            tenantId: tenantId || "default",
          });
        } catch {
          /* non-critical */
        }
      }

      return rawResponse({ success: true });
    }

    if (action === "wipe-user" || action === "gdpr-wipe") {
      const { userId } = params;
      if (!userId) throw new AppError("userId required for wipe", 400);

      logger.info(`[GDPR] Performing deep wipe for user: ${userId}`);

      try {
        await cms.db.crud.deleteMany("audit_logs", { actorId: userId } as any, {
          bypassTenantCheck: true,
        });
        await cms.db.crud.deleteMany("auth_sessions", { user_id: userId } as any, {
          bypassTenantCheck: true,
        });
        await cms.db.crud.deleteMany("auth_tokens", { user_id: userId } as any, {
          bypassTenantCheck: true,
        });
        await cms.db.crud.delete("auth_users", userId, {
          permanent: true,
          bypassTenantCheck: true,
        });

        return rawResponse({ success: true, message: "GDPR wipe completed" });
      } catch (err: any) {
        throw new AppError(`Wipe failed: ${err.message}`, 500);
      }
    }

    if (action === "benchmark-seed") {
      const AUTHOR_COUNT = params.authorCount || 10;
      const POSTS_PER_AUTHOR = params.postsPerAuthor || 5;

      // Phase 1: Create benchmark collections in parallel
      const collectionSchemas = [
        {
          _id: "benchmark_authors",
          name: "benchmark_authors",
          fields: [
            {
              db_fieldName: "_id",
              label: "ID",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "name",
              label: "Name",
              widget: { Name: "Input" },
              type: "string",
            },
          ],
        },
        {
          _id: "benchmark_posts",
          name: "benchmark_posts",
          fields: [
            {
              db_fieldName: "_id",
              label: "ID",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "title",
              label: "Title",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "author",
              label: "Author",
              widget: { Name: "Relation" },
              type: "string",
              relation: "benchmark_authors",
            },
          ],
        },
        {
          _id: "BenchmarkStable",
          name: "BenchmarkStable",
          fields: [
            {
              db_fieldName: "_id",
              label: "ID",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "title",
              label: "Title",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "content",
              label: "Content",
              widget: { Name: "RichText" },
              type: "string",
            },
            {
              db_fieldName: "count",
              label: "Count",
              widget: { Name: "Input" },
              type: "number",
            },
          ],
        },
        {
          _id: "redirects",
          name: "redirects",
          fields: [
            {
              db_fieldName: "_id",
              label: "ID",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "source",
              label: "Source",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "target",
              label: "Target",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "type",
              label: "Type",
              widget: { Name: "Input" },
              type: "number",
            },
          ],
        },
      ];

      await Promise.all(
        collectionSchemas.map(async (schema) => {
          try {
            await initializedAdapter.collection.createModel(schema);
          } catch {
            /* already exists */
          }
        }),
      );

      // Phase 2: Seed data using LocalCMS for zero-latency writes
      const { LocalCMS } = await import("@src/services/sdk");
      const localCms = new LocalCMS(initializedAdapter);

      // Seed authors
      const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
        _id: `author-${i + 1}`,
        name: `Author ${i + 1}`,
        tenantId,
      }));
      await localCms.collections.bulkCreate("benchmark_authors", authors, {
        tenantId,
        skipValidation: true,
        system: true,
      });

      // Seed posts
      const posts = authors.flatMap((author, ai) =>
        Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => ({
          title: `Post ${pi + 1} by Author ${ai + 1}`,
          author: author._id,
          tenantId,
        })),
      );
      await localCms.collections.bulkCreate("benchmark_posts", posts, {
        tenantId,
        skipValidation: true,
        system: true,
      });

      // Seed stable entry and redirects in parallel
      await Promise.all([
        localCms.collections.create(
          "BenchmarkStable",
          {
            _id: "bench-shared-001",
            title: "Stable Benchmark Entry",
            content: "This is a stable entry for REST and API performance testing.",
            count: 1,
            tenantId,
          },
          { tenantId, skipValidation: true, system: true },
        ),
        localCms.collections.bulkCreate(
          "redirects",
          [
            {
              _id: "bench-redirect-1",
              source: "/old-path-1",
              target: "/new-path-1",
              type: 301,
              tenantId,
            },
            {
              _id: "bench-redirect-2",
              source: "/old-path-2",
              target: "/new-path-2",
              type: 301,
              tenantId,
            },
          ],
          { tenantId, skipValidation: true, system: true },
        ),
      ]);

      return rawResponse({
        success: true,
        message: `Seeded ${authors.length} authors + ${posts.length} posts + stable entry + 2 redirects`,
        counts: {
          authors: authors.length,
          posts: posts.length,
          stable: 1,
          redirects: 2,
        },
      });
    }

    throw new AppError(`Unknown action: ${action}`, 400);
  } catch (err: any) {
    if (err instanceof AppError) {
      return rawResponse({ success: false, message: err.message, code: err.code }, err.status);
    }

    logger.error("[TestingHandler] Error:", err);
    return rawResponse(
      {
        success: false,
        message: err.message || "Internal error in testing handler",
        stack:
          process.env.NODE_ENV === "development" || process.env.BENCHMARK_MODE === "true"
            ? err.stack
            : undefined,
      },
      500,
    );
  }
}
