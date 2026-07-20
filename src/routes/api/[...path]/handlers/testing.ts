/**
 * @file src/routes/api/[...path]/handlers/testing.ts
 * @description State-management handler for integration testing (Reset, Seed, Reinitialize).
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { contentSystem } from "@src/content/index.server";
import type { DatabaseId } from "@src/databases/db-interface";
import type { RequestEvent } from "@sveltejs/kit";
import fs from "node:fs";
import fsp from "node:fs/promises";
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
 * Explicit Set-Cookie for session tokens.
 * Playwright APIRequestContext sometimes omits Set-Cookie from response.headers()
 * when cookies only flow through SvelteKit's cookies.set merge — dual-write so
 * E2E extractAndSaveSession / applySessionCookie can always see the header.
 */
function sessionCookieHeader(
  name: string,
  value: string,
  opts: { secure: boolean; sameSite: "Strict" | "Lax"; maxAge: number },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

async function setTestingSessionCookie(
  event: RequestEvent,
  sessionId: string,
): Promise<{ cookieName: string; isSecure: boolean; setCookieHeader: string }> {
  const { getSessionCookieName, isSecureCookieContext } =
    await import("@src/databases/auth/constants");
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const cookieName = getSessionCookieName(isSecure);
  const sameSite = isSecure ? "strict" : "lax";
  const maxAge = 60 * 60 * 24;
  event.cookies.set(cookieName, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite,
    secure: isSecure,
    maxAge,
  });
  return {
    cookieName,
    isSecure,
    setCookieHeader: sessionCookieHeader(cookieName, sessionId, {
      secure: isSecure,
      sameSite: isSecure ? "Strict" : "Lax",
      maxAge,
    }),
  };
}

/**
 * Invalidate all caches (setup, cache-service, auth, API spec, theme).
 */
async function invalidateAllCaches(tenantId: DatabaseId) {
  const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
  invalidateSetupCache(false, null);

  try {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    await cacheService.invalidateAll();

    const { securityResponseService } = await import("@src/services/security/response-service");
    securityResponseService.reset();

    const { invalidateUserCountCache, invalidateRolesCache } =
      await import("@src/hooks/handle-authorization");
    await invalidateUserCountCache(tenantId);
    await invalidateRolesCache(tenantId);

    const { apiSpecService } = await import("@services/system/api-spec-service");
    await apiSpecService.invalidateCache(tenantId);

    const { ThemeManager } = await import("@src/databases/theme-manager");
    const themeManager = ThemeManager.getInstance();
    if (themeManager.isInitialized()) {
      await themeManager.refresh();
    }
  } catch (err) {
    console.warn(`[TestingHandler] Non-fatal cache invalidation error: ${err}`);
  }
}

/**
 * Wipe the media folder and recreate it empty.
 */
async function wipeMediaFolder() {
  const { getPublicSettingSync } = await import("@src/services/core/settings-service");
  const mediaRoot = getPublicSettingSync("MEDIA_FOLDER") || "mediaFolder";
  const fullMediaRoot = path.resolve(process.cwd(), mediaRoot);
  if (fs.existsSync(fullMediaRoot)) {
    try {
      await fsp.rm(fullMediaRoot, { recursive: true, force: true });
      await fsp.mkdir(fullMediaRoot, { recursive: true });
    } catch (err) {
      console.warn(`[TestingHandler] Failed to clear media folder: ${err}`);
    }
  }
}

/**
 * Reset system state stores and rate limit buckets.
 */
async function resetSystemStores() {
  const { resetSystemState } = await import("@src/stores/system/state.svelte.ts");
  resetSystemState();
  const { resetInitializationState } = await import("@src/hooks/handle-system-state");
  resetInitializationState();
  try {
    const { resetRateLimitBuckets } = await import("@src/hooks/handle-rate-limit");
    resetRateLimitBuckets();
  } catch (err) {
    console.warn(`[TestingHandler] Failed to reset rate limit buckets: ${err}`);
  }
}

/**
 * MASTER TESTING HANDLER
 * Provides seed/reset helpers for E2E and integration runners.
 *
 * 🛡️ SECURITY (fail-closed — same bar as test-bypass.server):
 * - Disabled when NODE_ENV=production (hard 403)
 * - Requires explicit TEST_MODE / PLAYWRIGHT / BENCHMARK flag (not bare NODE_ENV=test)
 * - Requires matching x-test-secret (timing-safe)
 * - Production builds strip this module via testBackdoorStripperPlugin + verify-prod-build-backdoor
 *
 * Seed actions (seed-webhook, seed-automation, enable-plugin, etc.) inherit this gate —
 * they are NOT available as unauthenticated or production backdoors.
 */
export async function handleTestingRoutes(
  event: RequestEvent,
  cms: any,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { assertTestingApiAllowed } = await import("@utils/test-bypass.server");
  const gate = assertTestingApiAllowed(event.request);
  if (!gate.allowed) {
    throw new AppError(gate.message, gate.status, gate.code);
  }

  const runtimeEnv = (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env;

  if (runtimeEnv?.BENCHMARK_DEBUG === "true") {
    process.stderr.write(
      `🚀 handleTestingRoutes ENTERED: ${event.url.searchParams.get("action")}\n`,
    );
  }
  const { request } = event;
  try {
    const params = await request.json().catch(() => ({}));
    const action = params.action || event.url.searchParams.get("action");

    // Avoid logging secrets; only action names + tenant for benchmark visibility
    if (runtimeEnv?.TEST_MODE === "true" || runtimeEnv?.BENCHMARK_DEBUG === "true") {
      process.stderr.write(
        `[TestingHandler] action: ${action}, collectionId: ${params.collectionId || "N/A"}, tenant: ${tenantId}\n`,
      );
    }
    if (process.env.BENCHMARK_DEBUG === "true") {
      process.stderr.write(`[TestingHandler] Params: ${JSON.stringify(params)}\n`);
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

    if (action === "reset-to-state") {
      const { state, email, password } = params;
      if (!state || (state !== "setup" && state !== "ready")) {
        throw new AppError("State must be 'setup' or 'ready'", 400);
      }

      // Step 1: Wipe DB / media / caches (common to both states)
      if (initializedAdapter.clearDatabase) {
        await initializedAdapter.clearDatabase();
      } else if ((initializedAdapter as any).reset) {
        await (initializedAdapter as any).reset();
      }

      // Wipe media and caches (common to both states)
      await wipeMediaFolder();
      await invalidateAllCaches(tenantId);
      await resetSystemStores();

      const isTest = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
      const configFileName = isTest ? "private.test.ts" : "private.ts";
      const privateConfigPath = path.join(process.cwd(), "config", configFileName);

      if (state === "setup") {
        // Delete private config file
        if (fs.existsSync(privateConfigPath)) {
          try {
            await fsp.unlink(privateConfigPath);
          } catch (err) {
            console.warn(`[TestingHandler] Failed to delete config file: ${err}`);
          }
        }
        return rawResponse({ success: true, message: "Transitioned to setup mode" });
      }

      if (state === "ready") {
        // Transition to ready mode
        // 1. Write mock private config if missing
        if (!fs.existsSync(privateConfigPath)) {
          const { writePrivateConfig } = await import("@src/routes/setup/write-private-config");
          const dbType = process.env.DB_TYPE || "sqlite";
          const dummyConfig = {
            type: dbType as any,
            host: process.env.DB_HOST || "localhost",
            port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
            name: process.env.DB_NAME || "sveltycms_test",
            user: process.env.DB_USER || "",
            password: process.env.DB_PASSWORD || "",
          };
          await writePrivateConfig(dummyConfig);
        }

        // Invalidate cache with complete state
        const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
        invalidateSetupCache(false, true);

        // 2. Seed roles
        try {
          const { seedRoles } = await import("@src/routes/setup/seed");
          await seedRoles(initializedAdapter, tenantId);
        } catch (err: any) {
          logger.warn(`[TestingHandler] Role seeding error: ${err.message}`);
        }

        // 3. Create admin user
        const seedEmail = email || "admin@test.com";
        const seedPassword = password || "Password123!";
        const result = await cms.auth.createUser(
          {
            email: seedEmail,
            password: seedPassword,
            username: "admin",
            role: "admin",
            isRegistered: true,
            emailVerified: true,
          },
          { tenantId },
        );

        // 4. Seed default theme and refresh ThemeManager
        const { DEFAULT_THEME, ThemeManager } = await import("@src/databases/theme-manager");
        const safeTheme = JSON.parse(JSON.stringify(DEFAULT_THEME));
        await initializedAdapter.system.themes.ensure(safeTheme);
        const themeManager = ThemeManager.getInstance();
        if (themeManager.isInitialized()) {
          await themeManager.refresh();
        }

        // 5. Seed dynamic collections
        try {
          await contentSystem.initialize(tenantId, { force: true });
        } catch (err: any) {
          logger.warn(`[TestingHandler] Collection seeding error: ${err.message}`);
        }

        // Sync content store + SDK schema cache
        const { refreshContent } = await import("@src/content/engine.server");
        await refreshContent(tenantId, {
          mode: "schemas",
          adapter: initializedAdapter,
        });
        if (cms.collections?.refresh) {
          await cms.collections.refresh(tenantId as any, true);
        }

        return rawResponse({
          success: result.success,
          message: result.success
            ? "Transitioned to ready mode and seeded successfully"
            : (result as any).message,
        });
      }
    }

    if (action === "reset") {
      process.stderr.write(`[TestingHandler] RESET TRIGGERED for tenant: ${tenantId}\n`);

      // 1. Wipe Database (Collections + Data)
      if (initializedAdapter.clearDatabase) {
        await initializedAdapter.clearDatabase();
      } else if ((initializedAdapter as any).reset) {
        await (initializedAdapter as any).reset();
      }

      // Re-initialize adapter default collections/roles if available (e.g. MongoDB roles seed)
      try {
        if (typeof (initializedAdapter as any).ensureAuth === "function") {
          await (initializedAdapter as any).ensureAuth();
        }
        if (typeof (initializedAdapter as any).ensureSystem === "function") {
          await (initializedAdapter as any).ensureSystem();
        }
      } catch (err) {
        console.warn(
          `[TestingHandler] Non-fatal database initialization error after reset: ${err}`,
        );
      }

      // 2. Wipe media and reset caches + state
      await wipeMediaFolder();
      await invalidateAllCaches(tenantId);
      await resetSystemStores();

      return rawResponse({
        success: true,
        message: "System reset successfully",
      });
    }

    if (action === "seed") {
      const { email, password, username } = params;
      if (!email || !password) throw new AppError("Email and password required for seeding", 400);

      logger.debug("Seeding test user", { email, tenantId });

      // Seed default roles if missing (crucial after database reset/wipe)
      try {
        const { seedRoles } = await import("@src/routes/setup/seed");
        await seedRoles(initializedAdapter, tenantId);
      } catch (err: any) {
        logger.warn(`[TestingHandler] Non-fatal role seeding error: ${err.message}`);
      }

      // Idempotent seed: createUser then update-by-email on conflict.
      // NEVER wipe auth_users here — chromium shards call seed in parallel and a
      // full DELETE invalidates every other worker's admin session mid-test.
      // Use action=reset when a true clean slate is required (serial auth-setup).

      const seedOpts = { tenantId } as any;
      let result: any = await cms.auth.createUser(
        {
          email,
          password,
          username: username || email.split("@")[0],
          role: "admin",
          isAdmin: true,
          isRegistered: true,
          emailVerified: true,
        },
        seedOpts,
      );
      if (!result?.success) {
        // User likely already exists — update password/role instead.
        const existing = await cms.auth.getUserByEmail(email, seedOpts);
        if (existing?.success && existing?.data) {
          await cms.auth.updateUserAttributes(
            (existing.data as { _id: string })._id,
            {
              password,
              username: username || email.split("@")[0],
              role: "admin",
              isAdmin: true,
              isRegistered: true,
              emailVerified: true,
            },
            seedOpts,
          );
          result = { success: true, data: existing.data };
        }
      }

      logger.debug("Seed user creation result", {
        success: result.success,
        error: (result as any).message,
      });

      // Seed default theme
      const { DEFAULT_THEME } = await import("@src/databases/theme-manager");

      // 🚀 HARDENING: Ensure all DEFAULT_THEME properties are strings or null (no undefined)
      const safeTheme = JSON.parse(JSON.stringify(DEFAULT_THEME));
      await initializedAdapter.system.themes.ensure(safeTheme);

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

      // ✨ Fix: Invalidate setup cache so the system recognizes it is now COMPLETE
      const { invalidateSetupCache } = await import("@src/utils/server/setup-check");
      invalidateSetupCache(false, true);

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

      if (!result?.success) {
        return rawResponse({
          success: false,
          message: (result as any)?.message || "Seed failed",
          data: null,
        });
      }

      // Optional session (createSession:true) for auth-setup storageState capture.
      // Default is user-only so firstuser UI login tests can still open /login.
      let sessionId: string | undefined;
      const wantSession =
        params.createSession === true || params.createSession === "true" || params.session === true;
      let seedSetCookie: string | undefined;
      if (wantSession) {
        try {
          const loginResult = await cms.auth.login({ email, password }, { tenantId });
          if (loginResult.success && loginResult.data?.session?._id) {
            sessionId = loginResult.data.session._id;
            const cookie = await setTestingSessionCookie(event, sessionId!);
            seedSetCookie = cookie.setCookieHeader;
          }
        } catch (err: any) {
          logger.warn(`[TestingHandler] Non-fatal seed login/session error: ${err.message}`);
        }
      }

      const seedHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionId) {
        seedHeaders["x-test-session-id"] = sessionId;
        if (seedSetCookie) seedHeaders["Set-Cookie"] = seedSetCookie;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "System seeded successfully",
          data: result.data,
          token: sessionId,
        }),
        {
          status: 200,
          headers: seedHeaders,
        },
      );
    }

    if (action === "login") {
      const { email, password } = params;
      if (!email || !password) throw new AppError("Email and password required", 400);

      const loginResult = await cms.auth.login({ email, password }, { tenantId });
      if (!loginResult.success) {
        return rawResponse({ success: false, message: loginResult.message }, 401);
      }

      const { user, session } = loginResult.data;

      // Dual-write: event.cookies (SvelteKit) + explicit Set-Cookie for Playwright
      const cookie = await setTestingSessionCookie(event, session._id);

      return new Response(
        JSON.stringify({
          success: true,
          user: {
            _id: user._id,
            email: user.email,
            username: user.username,
            role: user.role,
          },
          token: session._id,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-test-session-id": session._id,
            "Set-Cookie": cookie.setCookieHeader,
          },
        },
      );
    }

    if (action === "reinitialize") {
      // Trigger system reload (full crawl/reconciliation)
      await contentSystem.initialize(tenantId, { force: true });
      return rawResponse({
        success: true,
        message: "System reinitialized successfully",
      });
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
      const { refreshContent } = await import("@src/content/engine.server");
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter: initializedAdapter,
      });

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
      // listUsers is wrapped by safeCall: { success, data: { data: [...], pagination } }
      const users = result.success ? result.data?.data : result.data;
      const user = Array.isArray(users) ? users.find((u: any) => u.email === email) : undefined;
      return rawResponse({ success: !!user, user });
    }

    if (action === "get-user-count") {
      const result = await cms.db.auth.getUserCount({}, { tenantId });
      const count = result.success ? result.data : 0;
      return rawResponse({ success: true, count });
    }

    /**
     * set-setting — update a private/public setting for E2E fixtures (e.g. USE_2FA).
     * Body: { action, key, value, scope?: "private" | "public" }
     */
    if (action === "set-setting") {
      const { key, value } = params;
      if (!key || typeof key !== "string") {
        throw new AppError("key is required", 400);
      }
      const { setPrivateSetting } = await import("@src/services/core/settings-service");
      await setPrivateSetting(key as any, value as any, tenantId as any);
      return rawResponse({ success: true, key, value });
    }

    /**
     * bulk-create-users — seed N unique users for pagination E2E.
     * Body: { action, count?: number, role?: string, prefix?: string }
     */
    if (action === "bulk-create-users") {
      const count = Math.min(Math.max(Number(params.count) || 12, 1), 50);
      const role = params.role || "editor";
      const prefix = params.prefix || `bulk_${Date.now()}`;
      const password = params.password || "BulkUser123!";
      const created: string[] = [];
      for (let i = 0; i < count; i++) {
        const email = `${prefix}_${i}@example.com`;
        const result = await cms.auth.createUser(
          {
            email,
            password,
            username: `${prefix}_${i}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40),
            role,
            isRegistered: true,
            emailVerified: true,
          },
          { tenantId },
        );
        if (result.success) created.push(email);
      }
      return rawResponse({ success: true, created: created.length, emails: created });
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

    if (action === "prepare-test-user") {
      const { email, password, username, role = "editor" } = params;
      if (!email || !password) throw new AppError("Email and password required", 400);

      const listResult = await cms.auth.listUsers({ tenantId, limit: 500 });
      const users = listResult.success ? listResult.data?.data : [];
      let user = Array.isArray(users)
        ? users.find((candidate: { email?: string }) => candidate.email === email)
        : undefined;

      if (!user) {
        const createResult = await cms.auth.createUser(
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
        if (!createResult.success) {
          throw new AppError(
            (createResult as { message?: string }).message || "Create failed",
            400,
          );
        }
        user = createResult.data;
      } else if (user.blocked) {
        const unblockResult = await cms.auth.batchAction([user._id], "unblock", { tenantId });
        if (!unblockResult.success) {
          throw new AppError(unblockResult.message || "Unblock failed", 500);
        }
        user = { ...user, blocked: false };
      }

      return rawResponse({ success: true, user });
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

    if (action === "seed-website-starter") {
      const { seedWebsiteStarterBlueprint } =
        await import("@src/services/site/website-starter-seed.server");
      try {
        const result = await seedWebsiteStarterBlueprint(initializedAdapter, {
          siteName: (params.siteName as string) || "E2E Test Site",
          tenantId,
          enablePlugin: params.enablePlugin !== false,
          adminUserId: params.userId as string | undefined,
        });
        return rawResponse({ success: true, ...result });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new AppError(`Website Starter seed failed: ${message}`, 500);
      }
    }

    if (action === "seed-unified-data-hub") {
      const { seedUnifiedDataHub } = await import("@plugins/unified-data-hub/server/hub-test-seed");
      try {
        // String(null) === "null" was poisoning connector/schema tenantId rows so
        // listVirtualCollections({ tenantId: null }) could never find them.
        const hubTenantId =
          tenantId == null || tenantId === ("" as any) || String(tenantId) === "null"
            ? "global"
            : String(tenantId);
        const result = await seedUnifiedDataHub(initializedAdapter, hubTenantId, {
          fixture: params.fixture || "postgres",
          rowCount: params.rowCount ?? 100,
          connectorId: params.connectorId,
          collectionId: params.collectionId,
          userId: params.userId,
        });
        return rawResponse({ success: true, tenantId: hubTenantId, ...result });
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("POSTGRES_FIXTURE_UNAVAILABLE")) {
          return rawResponse(
            { success: false, code: "POSTGRES_FIXTURE_UNAVAILABLE", message },
            503,
          );
        }
        throw new AppError(message, 500);
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

      for (const schema of collectionSchemas) {
        localCms.collections.registerSchema(schema._id, schema as any, tenantId);
      }

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

      // Seed stable entry and redirects in parallel (upsert stable entry for re-runs)
      const stablePayload = {
        _id: "bench-shared-001",
        title: "Stable Benchmark Entry",
        content: "This is a stable entry for REST and API performance testing.",
        count: 1,
        tenantId,
      };
      await Promise.all([
        initializedAdapter.crud
          .upsert(
            "BenchmarkStable" as any,
            { _id: "bench-shared-001" } as any,
            stablePayload as any,
            { tenantId, bypassTenantCheck: true } as any,
          )
          .then(async (res) => {
            if (!res.success) {
              await localCms.collections.create("BenchmarkStable", stablePayload, {
                tenantId,
                skipValidation: true,
                system: true,
              });
            }
          }),
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

      // Sync content store + SDK schema cache so PATCH/GET see API-seeded entries immediately
      const { refreshContent } = await import("@src/content/engine.server");
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter: initializedAdapter,
      });
      if (cms.collections?.refresh) {
        await cms.collections.refresh(tenantId as any, true);
      }

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

    // ── Config route E2E seeds (webhooks / automations) ───────────────────
    if (action === "seed-webhook") {
      const { webhookService } = await import("@src/services/background/webhook-service");
      const stamp = generateUUID().slice(0, 8);
      const webhook = await webhookService.saveWebhook(
        {
          id: params.id as string | undefined,
          name: (params.name as string) || `E2E Webhook ${stamp}`,
          url: (params.url as string) || `https://example.com/e2e-hook/${stamp}`,
          events: (params.events as any) || ["entry:publish"],
          active: params.active !== false,
          secret: (params.secret as string) || `e2e-secret-${stamp}`,
        },
        String(tenantId),
      );
      return rawResponse({ success: true, webhook, data: webhook });
    }

    if (action === "delete-webhook") {
      const id = params.id as string;
      if (!id) throw new AppError("id required for delete-webhook", 400);
      const { webhookService } = await import("@src/services/background/webhook-service");
      await webhookService.deleteWebhook(id, String(tenantId));
      return rawResponse({ success: true, deleted: id });
    }

    if (action === "seed-automation") {
      const { automationService } =
        await import("@src/services/background/automation/automation-service");
      const stamp = generateUUID().slice(0, 8);
      const flow = await automationService.saveFlow(
        {
          id: params.id as string | undefined,
          name: (params.name as string) || `E2E Automation ${stamp}`,
          description: (params.description as string) || "Seeded for E2E deep flow",
          active: params.active !== false,
          trigger: params.trigger || { type: "manual", events: [] },
          operations: params.operations || [
            {
              id: generateUUID(),
              type: "log",
              config: { message: "E2E seed log: {{ trigger.event }}", level: "info" },
            },
          ],
        },
        String(tenantId),
      );
      return rawResponse({ success: true, flow, data: flow });
    }

    if (action === "delete-automation") {
      const id = params.id as string;
      if (!id) throw new AppError("id required for delete-automation", 400);
      const { automationService } =
        await import("@src/services/background/automation/automation-service");
      await automationService.deleteFlow(id, String(tenantId));
      return rawResponse({ success: true, deleted: id });
    }

    if (action === "seed-workflow") {
      const { workflowService } = await import("@src/services/background/workflow-service");
      const stamp = generateUUID().slice(0, 8);
      const collectionId =
        (params.collectionId as string) || (params.collection as string) || `e2e_col_${stamp}`;
      const adminUser = {
        _id: (params.userId as string) || "system",
        role: "admin",
        isAdmin: true,
        email: "e2e@sveltycms.test",
      } as any;
      const definition = {
        _id: params.id as string | undefined,
        collectionId,
        name: (params.name as string) || `E2E Workflow ${stamp}`,
        description: params.description as string | undefined,
        states: (params.states as any[]) || [
          { id: "draft", label: "Draft", color: "#94a3b8", isInitial: true },
          { id: "review", label: "In Review", color: "#fbbf24" },
          { id: "published", label: "Published", color: "#22c55e", isFinal: true },
        ],
        transitions: (params.transitions as any[]) || [
          { id: "t1", from: "draft", to: "review", label: "Submit" },
          { id: "t2", from: "review", to: "published", label: "Approve" },
          { id: "t3", from: "review", to: "draft", label: "Reject" },
        ],
      };
      const saved = await workflowService.saveWorkflow(definition, adminUser, String(tenantId));
      return rawResponse({ success: true, workflow: saved, data: saved });
    }

    if (action === "delete-workflow") {
      const id = params.id as string;
      if (!id) throw new AppError("id required for delete-workflow", 400);
      const { workflowService } = await import("@src/services/background/workflow-service");
      const adminUser = {
        _id: "system",
        role: "admin",
        isAdmin: true,
        email: "e2e@sveltycms.test",
      } as any;
      await workflowService.deleteWorkflow(id, adminUser, String(tenantId));
      return rawResponse({ success: true, deleted: id });
    }

    if (action === "enable-plugin") {
      const pluginId = (params.pluginId || params.id) as string;
      if (!pluginId) throw new AppError("pluginId required for enable-plugin", 400);
      // Fail closed on weird ids (path traversal / injection surface)
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(pluginId)) {
        throw new AppError("Invalid pluginId", 400, "INVALID_PLUGIN_ID");
      }
      try {
        const { pluginRegistry } = await import("@src/plugins");
        const enabled = params.enabled !== false;
        const ok = await pluginRegistry.togglePlugin(
          pluginId,
          enabled,
          String(tenantId),
          // Never accept client-supplied userId for audit attribution via testing API
          "system",
        );
        if (!ok) {
          return rawResponse(
            {
              success: false,
              code: "PLUGIN_UNAVAILABLE",
              message: `Plugin "${pluginId}" could not be toggled (missing or settings service unavailable)`,
              pluginId,
            },
            503,
          );
        }
        return rawResponse({ success: true, pluginId, enabled });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return rawResponse({ success: false, code: "PLUGIN_UNAVAILABLE", message, pluginId }, 503);
      }
    }

    /**
     * Seed a soft-deleted collection entry for trash restore E2E.
     * Creates collection model + content node if needed, inserts row, soft-deletes.
     */
    if (action === "seed-trash") {
      const collectionId = String(params.collectionId || "e2e_trash_fixture").replace(
        /[^a-zA-Z0-9_]/g,
        "_",
      );
      if (!collectionId || collectionId.length > 64) {
        throw new AppError("Invalid collectionId", 400);
      }
      const entryId = String(params.entryId || `trash_${generateUUID().slice(0, 12)}`);
      const title = String(params.title || `E2E Trash Item ${generateUUID().slice(0, 6)}`);
      const collectionName = `collection_${collectionId.replace(/-/g, "")}`;

      try {
        await initializedAdapter.collection.createModel({
          _id: collectionId,
          name: collectionId,
          fields: [
            {
              db_fieldName: "title",
              label: "Title",
              widget: { Name: "Input" },
              type: "string",
            },
          ],
        } as any);
      } catch {
        /* model may already exist */
      }

      if (initializedAdapter.content?.nodes?.upsertContentStructureNode) {
        await initializedAdapter.content.nodes.upsertContentStructureNode({
          _id: collectionId,
          path: `/collection/${collectionId.toLowerCase()}`,
          name: collectionId,
          nodeType: "collection",
          collectionDef: {
            _id: collectionId,
            name: collectionId,
            fields: [{ db_fieldName: "title", widget: { Name: "Input" }, type: "string" }],
          },
          status: "publish",
          source: "api",
          tenantId,
        } as any);
      }

      const { refreshContent } = await import("@src/content/engine.server");
      await refreshContent(tenantId, {
        mode: "schemas",
        adapter: initializedAdapter,
      });
      if (cms.collections?.refresh) {
        await cms.collections.refresh(tenantId as any, true);
      }

      const insertRes = await initializedAdapter.crud.insert(
        collectionName,
        {
          _id: entryId as any,
          title,
          status: "publish",
          tenantId,
        } as any,
        { tenantId },
      );
      if (!insertRes.success) {
        // Idempotent: try soft-delete if already exists
        logger.warn(`[testing] seed-trash insert: ${insertRes.message || "failed"}`);
      }

      const delRes = await initializedAdapter.crud.delete(collectionName, entryId as any, {
        tenantId,
        permanent: false,
        userId: "system" as any,
      });
      if (!delRes.success) {
        throw new AppError(`seed-trash soft-delete failed: ${delRes.message || "unknown"}`, 500);
      }

      return rawResponse({
        success: true,
        collectionId,
        entryId,
        title,
        collectionName,
      });
    }

    if (action === "purge-trash") {
      const collectionId = String(params.collectionId || "").replace(/[^a-zA-Z0-9_]/g, "_");
      const entryId = String(params.entryId || "");
      if (!collectionId || !entryId) {
        throw new AppError("collectionId and entryId required for purge-trash", 400);
      }
      const collectionName = `collection_${collectionId.replace(/-/g, "")}`;
      await initializedAdapter.crud.delete(collectionName, entryId as any, {
        tenantId,
        permanent: true,
        userId: "system" as any,
      });
      return rawResponse({ success: true, purged: entryId, collectionId });
    }

    // ── Password-reset / media gallery test seeds ───────────────────────────
    if (action === "seed-expired-password-reset") {
      const email = String(params.email || "admin@example.com")
        .toLowerCase()
        .trim();
      const { auth: authFacade } = await import("@src/databases/db");
      if (!authFacade) {
        throw new AppError("Auth facade unavailable for seed-expired-password-reset", 503);
      }

      const user = await authFacade.checkUser({ email });
      const userId = user?._id;
      if (!userId) {
        throw new AppError(`User not found for seed-expired-password-reset: ${email}`, 404);
      }

      // Expired 1 hour ago — consumeToken must return TOKEN_EXPIRED
      const expires = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const token = await authFacade.createToken({
        user_id: userId,
        expires,
        type: "password_reset",
        // Prefer user's tenant so isolation matches consumeToken lookups
        tenantId: (user as { tenantId?: string | null }).tenantId ?? tenantId,
      });

      if (!token || typeof token !== "string") {
        throw new AppError("Failed to create expired password_reset token", 500);
      }

      return rawResponse({
        success: true,
        token,
        email: user.email || email,
        userId: String(userId),
        expires,
        type: "password_reset",
      });
    }

    if (action === "seed-media-with-metadata") {
      const stamp = generateUUID().slice(0, 8);
      const email = String(params.email || "admin@example.com")
        .toLowerCase()
        .trim();
      let userId = "system";
      try {
        const listResult = await cms.auth.listUsers({ tenantId, limit: 100 });
        const users = listResult.success ? listResult.data?.data : listResult.data;
        const found = Array.isArray(users)
          ? users.find((u: { email?: string }) => u.email === email)
          : undefined;
        if (found?._id) userId = String(found._id);
      } catch {
        /* system owner is fine for gallery admin views */
      }

      const defaultItems = [
        {
          filename: `e2e-canon-${stamp}.png`,
          originalFilename: `e2e-canon-${stamp}.png`,
          hash: `e2ehashcanon${stamp}`,
          path: `global/e2e-canon-${stamp}.png`,
          size: 128,
          mimeType: "image/png",
          metadata: { camera: "Canon", iso: 400, tags: ["nature"] },
        },
        {
          filename: `e2e-nikon-${stamp}.png`,
          originalFilename: `e2e-nikon-${stamp}.png`,
          hash: `e2ehashnikon${stamp}`,
          path: `global/e2e-nikon-${stamp}.png`,
          size: 128,
          mimeType: "image/png",
          metadata: { camera: "Nikon", iso: 100, tags: ["studio"] },
        },
      ];

      const itemsIn = Array.isArray(params.items) ? params.items : defaultItems;
      const created: Array<{ _id: string; hash: string; filename: string; metadata: unknown }> = [];

      const upload = initializedAdapter.media?.files?.upload;
      if (typeof upload !== "function") {
        throw new AppError("media.files.upload unavailable", 500);
      }

      for (const raw of itemsIn) {
        const item = raw as Record<string, unknown>;
        const hash = String(item.hash || `e2ehash${generateUUID().slice(0, 10)}`);
        const filename = String(item.filename || `${hash}.png`);
        const file = {
          filename,
          originalFilename: String(item.originalFilename || filename),
          hash,
          path: String(item.path || `global/${filename}`),
          size: Number(item.size ?? 128),
          mimeType: String(item.mimeType || "image/png"),
          folderId: (item.folderId as string | null | undefined) ?? null,
          thumbnails: (item.thumbnails as Record<string, unknown>) || {},
          metadata: (item.metadata as Record<string, unknown>) || {},
          access: (item.access as string) || "public",
          createdBy: userId,
          updatedBy: userId,
        };
        const res = await upload(file as any, tenantId);
        if (!res?.success || !res.data) {
          throw new AppError(
            `seed-media-with-metadata upload failed: ${(res as any)?.message || "unknown"}`,
            500,
          );
        }
        const row = res.data as any;
        created.push({
          _id: String(row._id || row.id),
          hash: String(row.hash || hash),
          filename: String(row.filename || filename),
          metadata: row.metadata ?? file.metadata,
        });
      }

      return rawResponse({
        success: true,
        items: created,
        matchingHash: created[0]?.hash,
        nonMatchingHash: created[1]?.hash,
      });
    }

    // ── Plugin storage + transactional outbox (integration fixtures) ────────
    if (action === "plugin-storage-create") {
      const plugin = String(params.plugin || "test-plugin");
      const collection = String(params.collection || "default");
      // Prefer `payload` over `data` — `data` can collide with response envelopes / proxies
      const data =
        (params.payload as Record<string, unknown>) ||
        (params.recordData as Record<string, unknown>) ||
        (params.data as Record<string, unknown>) ||
        {};
      const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
      const store = new PluginStorageAdapterImpl(initializedAdapter);
      const record = await store.createRecord(plugin, collection, data, {
        tenantId: tenantId ? String(tenantId) : undefined,
      });
      // Always echo request payload on create (DB drivers may omit/double-encode `data`)
      const safe = {
        _id: String(record?._id || ""),
        plugin,
        collection,
        payload: data,
        data,
        recordData: data,
      };
      return rawResponse({ success: true, record: safe, ...safe });
    }

    if (action === "plugin-storage-get") {
      const plugin = String(params.plugin || "");
      const collection = String(params.collection || "");
      const recordId = String(params.recordId || params.id || "");
      if (!plugin || !collection || !recordId) {
        throw new AppError("plugin, collection, recordId required", 400);
      }
      const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
      const store = new PluginStorageAdapterImpl(initializedAdapter);
      const record = await store.getRecord(plugin, collection, recordId, {
        tenantId: tenantId ? String(tenantId) : undefined,
      });
      return rawResponse({ success: true, record, data: record });
    }

    if (action === "plugin-storage-list") {
      const plugin = String(params.plugin || "");
      const collection = String(params.collection || "");
      if (!plugin || !collection) throw new AppError("plugin and collection required", 400);
      const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
      const store = new PluginStorageAdapterImpl(initializedAdapter);
      const page = await store.listRecords(plugin, collection, {
        tenantId: tenantId ? String(tenantId) : undefined,
        limit: Number(params.limit) || 50,
        offset: Number(params.offset) || 0,
        filter: params.filter as Record<string, unknown> | undefined,
      });
      return rawResponse({ success: true, data: page.data, records: page.data, total: page.total });
    }

    if (action === "plugin-storage-delete") {
      const plugin = String(params.plugin || "");
      const collection = String(params.collection || "");
      const recordId = String(params.recordId || params.id || "");
      if (!plugin || !collection || !recordId) {
        throw new AppError("plugin, collection, recordId required", 400);
      }
      const { PluginStorageAdapterImpl } = await import("@src/plugins/storage");
      const store = new PluginStorageAdapterImpl(initializedAdapter);
      const ok = await store.deleteRecord(plugin, collection, recordId, {
        tenantId: tenantId ? String(tenantId) : undefined,
      });
      return rawResponse({ success: true, deleted: ok });
    }

    if (action === "outbox-emit") {
      const { outboxService } = await import("@src/services/outbox");
      const result = await outboxService.emit(
        String(params.eventType || "entry:create"),
        String(params.aggregateType || "entry"),
        String(params.aggregateId || generateUUID()),
        params.payload ?? { test: true },
        String(params.tenantId || tenantId || "default"),
      );
      if (!result.success) {
        // Outbox may be disabled in benchmark — surface clearly
        return rawResponse(
          {
            success: false,
            message: result.message,
            code: (result as any).error?.code,
          },
          400,
        );
      }
      return rawResponse({ success: true, event: result.data, data: result.data });
    }

    if (action === "outbox-process-batch") {
      const { outboxService } = await import("@src/services/outbox");
      const stats = await outboxService.processBatch(Number(params.batchSize) || 50);
      return rawResponse({ success: true, ...stats });
    }

    if (action === "outbox-pending-count") {
      const { outboxService } = await import("@src/services/outbox");
      const count = await outboxService.getPendingCount(
        params.tenantId ? String(params.tenantId) : undefined,
      );
      return rawResponse({ success: true, count });
    }

    if (action === "outbox-get") {
      const id = String(params.id || params.eventId || "");
      if (!id) throw new AppError("id required", 400);
      const res = await initializedAdapter.crud.findOne("svelty_outbox", { _id: id } as any, {
        tenantId,
      });
      return rawResponse({
        success: true,
        event: res.success ? res.data : null,
      });
    }

    if (action === "outbox-tx-rollback") {
      // Prove outbox row is not visible after a failed transaction (SQL adapters).
      // Mongo multi-doc transactions need a replica set — skip with reason if unsupported.
      const adapterType = String((initializedAdapter as any).type || "").toLowerCase();
      if (adapterType === "mongodb") {
        return rawResponse({
          success: true,
          skipped: true,
          reason: "MongoDB multi-doc transactions require replica set; skipped in CI",
        });
      }
      if (typeof (initializedAdapter as any).transaction !== "function") {
        return rawResponse({
          success: true,
          skipped: true,
          reason: "Adapter has no transaction()",
        });
      }

      const { outboxService, OUTBOX_COLLECTION } =
        await import("@src/services/outbox/outbox-service");
      const aggregateId = String(params.aggregateId || `rb-${generateUUID().slice(0, 8)}`);
      let emittedId: string | undefined;

      try {
        await (initializedAdapter as any).transaction(async (tx: any) => {
          const emitRes = await outboxService.emit(
            String(params.eventType || "entry:create"),
            "entry",
            aggregateId,
            { rollbackTest: true },
            String(tenantId || "default"),
            { transaction: tx },
          );
          if (emitRes.success && emitRes.data?._id) {
            emittedId = String(emitRes.data._id);
          }
          // Force rollback
          return { success: false, message: "forced rollback" };
        });
      } catch {
        /* expected on some adapters that throw on rollback */
      }

      // If emit returned an id, verify it is gone; else scan by aggregateId
      let eventFound = false;
      if (emittedId) {
        const found = await initializedAdapter.crud.findOne(
          OUTBOX_COLLECTION,
          { _id: emittedId } as any,
          { tenantId },
        );
        eventFound = !!(found.success && found.data);
      } else {
        const listed = await initializedAdapter.crud.findMany(
          OUTBOX_COLLECTION,
          { aggregateId } as any,
          { limit: 5, tenantId },
        );
        eventFound = !!(listed.success && Array.isArray(listed.data) && listed.data.length > 0);
      }

      return rawResponse({
        success: true,
        skipped: false,
        eventFound,
        emittedId: emittedId || null,
        aggregateId,
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
