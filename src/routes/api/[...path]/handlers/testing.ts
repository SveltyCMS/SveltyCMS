/**
 * @file src/routes/api/[...path]/handlers/testing.ts
 * @description State-management handler for integration testing (Reset, Seed, Reinitialize).
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import { rawResponse } from "./base";
import { contentSystem } from "@src/content/index.server";
import type { DatabaseId } from "@src/content/types";
import * as fs from "node:fs";
import * as path from "node:path";
import { getPublicSettingSync } from "@src/services/core/settings-service";

export async function handleTestingRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  const secretHeader = request.headers.get("x-test-secret");
  const expectedSecret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  if (secretHeader !== expectedSecret) {
    throw new AppError("Unauthorized test API access", 401);
  }

  if (request.method !== "POST") throw new AppError("Method Not Allowed", 405);

  const { action, ...params } = await request.json().catch(() => ({}));

  if (action === "reset") {
    // Standardized database clear across all adapters
    await cms.db.clearDatabase();

    // 🚀 HARDENING: Clear Media Folder for test isolation
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

    return rawResponse(event, { success: true, message: "System reset successfully" });
  }

  if (action === "seed") {
    const { email, password, username } = params;
    if (!email || !password) throw new AppError("Email and password required for seeding", 400);

    const { logger } = await import("@utils/logger");
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
    await cms.db.system.themes.ensure(DEFAULT_THEME);

    // ✨ Fix: Invalidate setup cache so the system recognizes it is now COMPLETE
    const { invalidateSetupCache } = await import("@src/utils/setup-check");
    invalidateSetupCache(false, true);

    return rawResponse(event, {
      success: result.success,
      message: result.success ? "System seeded successfully" : (result as any).message,
      data: result.success ? result.data : null,
    });
  }

  if (action === "reinitialize") {
    // Trigger system reload (full crawl/reconciliation)
    await contentSystem.initialize(tenantId, false);
    return rawResponse(event, { success: true, message: "System reinitialized successfully" });
  }

  if (action === "create-collection") {
    const collectionId =
      params.collectionId || params.collection || params.schema?._id || params.name;
    const schema = params.schema || params.data || params;

    // 1. Force registration in DB adapter (so it can handle CRUD)
    const { dbAdapter } = await import("@src/databases/db");
    try {
      if (!dbAdapter) throw new Error("Database adapter not initialized");
      await dbAdapter.collection.createModel(schema);

      // ✨ PERSISTENCE FIX: Register the node in the DB so it survives server restarts
      // This is critical for benchmarks like "Enterprise Matrix" that restart the server to test cold starts.
      if (dbAdapter.content?.nodes?.upsertContentStructureNode) {
        const node: any = {
          _id: collectionId,
          path: `/collection/${(schema.name || collectionId).toLowerCase()}`,
          name: schema.name || collectionId,
          nodeType: "collection",
          collectionDef: { ...schema, _id: collectionId },
          status: "published",
          tenantId,
        };
        await dbAdapter.content.nodes.upsertContentStructureNode(node);

        // Force the content system to re-initialize and reconcile the newly created node
        // This is critical for benchmarks that seed data immediately after creating the collection
        await contentSystem.initialize(tenantId, false);
      }
    } catch (e: any) {
      // Ignore if already exists or fails, but log the error message for diagnostics
      console.warn(`[testing] create-collection persist warning for ${collectionId}: ${e.message}`);
    }

    // 2. Add to Content Store (immediate in-memory sync for the current process)
    const { contentStore } = await import("@src/stores/content-store.svelte");
    const existingNodes = contentStore.getAllNodes();

    // Check if it already exists to avoid duplicates
    const alreadyExists = existingNodes.some((n) => n._id === collectionId);
    if (!alreadyExists) {
      const newNode: any = {
        _id: collectionId,
        path: `/collection/${schema.slug || (schema.name as string)?.toLowerCase() || collectionId}`,
        name: schema.name || collectionId,
        nodeType: "collection",
        collectionDef: schema,
        tenantId,
      };
      contentStore.sync([...existingNodes, newNode]);
    }

    return rawResponse(event, { success: true });
  }

  if (action === "get-user") {
    const { email } = params;
    // AuthNamespace might not have getUserByEmail, use listUsers if available
    const result = await cms.auth.listUsers({ tenantId });
    const user = result.data.find((u: any) => u.email === email);
    return rawResponse(event, { success: !!user, user });
  }

  if (action === "get-user-count") {
    // Correctly access the auth adapter method
    const result = await cms.db.auth.getUserCount({}, { tenantId });
    const count = result.success ? result.data : 0;
    return rawResponse(event, { success: true, count });
  }

  if (action === "sdkCall" || action === "sdk-call") {
    let { namespace, method, args } = params;

    // Handle dotted method (e.g. "db.auth.createUser")
    if (method.includes(".")) {
      const parts = method.split(".");
      const fnName = parts.pop()!;
      let current: any = cms;
      for (const part of parts) {
        current = current[part];
        if (!current) break;
      }
      if (current && typeof current[fnName] === "function") {
        const result = await current[fnName](...(args || []));
        return rawResponse(event, { success: true, data: result });
      }
    }

    const ns = namespace ? (cms as any)[namespace] : cms;
    if (!ns || typeof ns[method] !== "function") {
      throw new AppError(
        `SDK Method "${namespace ? namespace + "." : ""}${method}" not found`,
        404,
      );
    }
    const result = await ns[method](...(args || []));
    return rawResponse(event, { success: true, data: result });
  }

  throw new AppError(`Test action "${action}" not implemented`, 404);
}
