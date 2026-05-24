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
  process.stderr.write(`🚀 handleTestingRoutes ENTERED: ${event.url.searchParams.get("action")}\n`);
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

      // ✨ Fix: Reset system state store so the system transitions back to SETUP/INITIALIZING
      const { resetSystemState } = await import("@src/stores/system/state.svelte");
      resetSystemState();

      return rawResponse({
        success: true,
        message: "System reset successfully",
      });
    }

    if (action === "seed") {
      const { email, password, username } = params;
      if (!email || !password) throw new AppError("Email and password required for seeding", 400);

      logger.debug("Seeding test user", { email, tenantId });

      // Create admin user
      const result = await cms.auth.createUser(
        {
          email,
          password,
          username,
          role: "admin",
          isRegistered: true,
          emailVerified: true,
        },
        { tenantId },
      );

      logger.debug("Seed user creation result", {
        success: result.success,
        error: (result as any).message,
      });

      // Seed default theme
      const { DEFAULT_THEME } = await import("@src/databases/theme-manager");

      // 🚀 HARDENING: Ensure all DEFAULT_THEME properties are strings or null (no undefined)
      const safeTheme = JSON.parse(JSON.stringify(DEFAULT_THEME));
      await cms.db.system.themes.ensure(safeTheme);

      // ✨ Fix: Invalidate setup cache so the system recognizes it is now COMPLETE
      const { invalidateSetupCache } = await import("@src/utils/setup-check");
      invalidateSetupCache(false, true);

      return rawResponse({
        success: result.success,
        message: result.success ? "System seeded successfully" : (result as any).message,
        data: result.success ? result.data : null,
      });
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
        return rawResponse({ success: false, message: err.message }, 500);
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

          if (initializedAdapter.content?.nodes?.upsertContentStructureNode) {
            if (process.env.BENCHMARK_DEBUG === "true") {
              console.log(
                `[testing] Upserting collection node for ${collectionId} (tenant: ${tenantId})`,
              );
            }
            const node: any = {
              _id: collectionId,
              path: `/collection/${(schema.name || collectionId).toLowerCase()}`,
              name: schema.name || collectionId,
              nodeType: "collection",
              collectionDef: { ...schema, _id: collectionId },
              status: "published",
              source: "api",
              tenantId,
            };
            await initializedAdapter.content.nodes.upsertContentStructureNode(node);
          }
          results.push({ id: collectionId, success: true });
        } catch (e: any) {
          logger.error(`[testing] Failed to provision ${collectionId}:`, e.message);
          results.push({ id: collectionId, success: false, error: e.message });
        }
      }

      // 🚀 BATCH SYNC: Refresh once for all collections
      const { refreshCollectionsCache } = await import("@src/content/content-service.server");
      await refreshCollectionsCache(tenantId, initializedAdapter);

      // 🚀 SDK CACHE CLEAR: Force the shared CMS instance to drop stale schemas
      if (cms.collections?.refresh) {
        await cms.collections.refresh(tenantId as any, true);
      }

      return rawResponse({ success: results.every((r) => r.success), results });
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
        return rawResponse({ success: false, message: err.message }, 500);
      }
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
      } catch (err: any) {
        logger.error(`[TestingHandler] clear-collection error for ${collectionId}: ${err.message}`);
        return rawResponse({ success: false, message: err.message }, 200);
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
      const { globalPlatform } = await import("@src/hooks.ws");
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
      const { globalPlatform } = await import("@src/hooks.ws");
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
