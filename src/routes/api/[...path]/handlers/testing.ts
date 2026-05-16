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
  const { request } = event;

  try {
    const params = await request.json().catch(() => ({}));
    const action = params.action || event.url.searchParams.get("action");

    if (action === "reset") {
      logger.info(`[TestingHandler] RESET TRIGGERED for tenant: ${tenantId}`);

      // 1. Wipe Database (Collections + Data)
      if (cms.db?.reset) {
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

      return rawResponse({ success: true, message: "System reset successfully" });
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
      return rawResponse({ success: true, message: "System reinitialized successfully" });
    }

    // 🚀 HARDENING: Wait for database to be ready
    const { isDbConnected, getDbInitPromise, getDb } = await import("@src/databases/db");
    if (!isDbConnected()) {
      logger.info("[testing] DB not connected, waiting for initialization...");
      await getDbInitPromise().catch(() => {});

      // Secondary poll for safety
      let retries = 10;
      while (!isDbConnected() && retries-- > 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const initializedAdapter = getDb();
    if (!initializedAdapter || !isDbConnected()) {
      throw new AppError("Database connection not established", 503);
    }

    if (action === "ping") {
      return rawResponse({ success: true, message: "Testing API is online" });
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

      return rawResponse({ success: results.every((r) => r.success), results });
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
