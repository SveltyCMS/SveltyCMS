/**
 * @file src/routes/(app)/config/collectionbuilder/+page.server.ts
 * @description Server-side logic for Collection Builder page authentication and authorization.
 *
 * Updates:
 * - Uses the enhanced functional contentSystem facade.
 * - Centralized permission checking for all actions using a helper function.
 * - Standardized error handling for consistency across load/actions.
 */

// System Logger
import { contentSystem } from "@src/content/index.server";
// Auth - Use cached roles from locals instead of global config
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { error, fail, redirect, isRedirect, isHttpError } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import type { Actions, PageServerLoad } from "./$types";
// 🚀 PERFORMANCE: Move static node module imports to the top level
import path from "node:path";
import fs from "node:fs";

/**
 * @internal Helper function to enforce collection builder permissions.
 * @throws {Error} If user lacks required permission or is not logged in.
 */
function requireCollectionBuilderPermission(locals: any): void {
  const { user, roles: tenantRoles, isAdmin } = locals;
  if (!user) {
    throw error(401, "Authentication required");
  }
  if (!hasCollectionBuilderPermission(user, tenantRoles, isAdmin)) {
    logger.warn("[CollectionBuilder] Permission denied for action.", {
      userId: user._id,
    });
    throw error(403, "Insufficient permissions to manage collections");
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  logger.info("[CB-DEBUG] Load function started");
  try {
    logger.info("[CB-DEBUG] locals keys: " + Object.keys(locals).join(", "));
    const { user, isAdmin, tenantId } = locals;
    logger.info(`[CB-DEBUG] user=${!!user}, isAdmin=${isAdmin}, tenantId=${tenantId}`);

    // User authentication already done by handleAuthorization hook. We assume `user` exists here due to the hook.
    if (!user) {
      logger.warn("User not authenticated, redirecting to login");
      throw redirect(302, "/login");
    }

    // Use centralized guard function (redundant but explicit for load context)
    requireCollectionBuilderPermission(locals);
    logger.info("[CB-DEBUG] Permission check passed");

    // Ensure content system is initialized for this tenant
    if (!contentSystem.isInitialized) {
      logger.info("[CB-DEBUG] Content system NOT initialized, initializing...");
      await contentSystem.initialize(tenantId, true);
      logger.info("[CB-DEBUG] Content system initialized");
    } else {
      logger.info("[CB-DEBUG] Content system already initialized");
    }

    // Fetch the initial content structure directly from database for organizational work
    logger.info("[CB-DEBUG] Fetching content structure from database...");
    let contentStructure = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
    logger.info(`[CB-DEBUG] Content structure fetched: ${contentStructure?.length ?? 0} nodes`);

    // 🚑 SELF-HEALING: If no content nodes in DB but system was already marked as
    // initialized (e.g. from a prior skipReconciliation setup), trigger a full refresh.
    if ((!contentStructure || contentStructure.length === 0) && contentSystem.isInitialized) {
      logger.warn(
        "[CollectionBuilder] No content nodes found despite system being initialized. Triggering refresh...",
      );
      await contentSystem.refresh(tenantId, false, false);
      contentStructure = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
      logger.info(
        "[CollectionBuilder] After refresh, found",
        contentStructure?.length || 0,
        "content nodes",
      );
    }

    if (!Array.isArray(contentStructure)) {
      logger.error("[CollectionBuilder] contentStructure is not an array!", {
        type: typeof contentStructure,
        value: contentStructure,
      });
    }

    // Serialize and sanitize structures for client-side usage
    const serializedStructure = (contentStructure || []).map((node: any) => {
      try {
        // Deep clone and strip non-serializable properties (like validationSchema functions)
        const sanitizedNode = JSON.parse(JSON.stringify(node));

        if (!sanitizedNode._id) {
          logger.warn("[CollectionBuilder] Node missing _id!", { node });
        }

        return {
          ...sanitizedNode,
          _id: sanitizedNode._id?.toString() || "missing-id",
          ...(sanitizedNode.parentId ? { parentId: sanitizedNode.parentId.toString() } : {}),
        };
      } catch (mapErr) {
        logger.error("[CollectionBuilder] Error mapping node:", {
          error: mapErr instanceof Error ? mapErr.message : String(mapErr),
          node,
        });
        return {
          _id: "error-node",
          name: "Error Node",
          nodeType: "category" as const,
          path: "/error",
          order: 0,
          translations: [],
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };
      }
    });

    // Return user data with proper admin status and the content structure
    const { _id, ...rest } = user;

    if (!_id) {
      logger.error("[CollectionBuilder] user._id is missing!", { user });
    }

    return {
      user: {
        id: _id?.toString() || "missing-user-id",
        ...rest,
        isAdmin, // Add the properly calculated admin status
      },
      contentStructure: serializedStructure,
    };
  } catch (err) {
    // Re-throw SvelteKit's special error/redirect objects (they are NOT instanceof Error)
    if (isRedirect(err) || isHttpError(err)) {
      throw err;
    }
    if (err instanceof Error && "status" in err) {
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message, {
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw error(500, message);
  }
};

export const actions: Actions = {
  deleteCollections: async ({ request, locals }) => {
    // 🛡️ SECURITY FIX: Use centralized permission check
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const ids = JSON.parse(formData.get("ids") as string);

    if (!(ids && Array.isArray(ids))) {
      return fail(400, { message: "Invalid IDs for deletion" });
    }

    try {
      // Find paths for IDs to handle deletion via reconciler
      const currentStructure = await contentSystem.getContentStructureFromDatabase(
        "flat",
        locals.tenantId,
      );
      const pathsToDelete = currentStructure
        .filter((node: any) => ids.includes(node._id.toString()))
        .map((node: any) => node.path);

      const operations = (pathsToDelete as string[]).map((path: string) => ({
        type: "delete" as const,
        node: { path } as any,
      }));

      await contentSystem.upsertContentNodes(operations, locals.tenantId);

      // ✨ FORCE REFRESH: Ensure the system and navigation caches are updated immediately
      await contentSystem.refresh(locals.tenantId);

      return { success: true };
    } catch (err) {
      logger.error("Error deleting collections:", err);
      return fail(500, { message: "Failed to delete collections" });
    }
  },

  saveConfig: async ({ request, locals }) => {
    // 🛡️ SECURITY FIX: Use centralized permission check
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const items = JSON.parse(formData.get("items") as string);

    if (!(items && Array.isArray(items))) {
      return fail(400, { message: "Invalid items for save" });
    }

    try {
      await contentSystem.upsertContentNodes(items, locals.tenantId);

      // Refresh with adapter to create physical data tables and sync the store
      const { getDb } = await import("@src/databases/db");
      const db = getDb();
      await contentSystem.refresh(locals.tenantId, false, false, db);

      const updatedStructure = await contentSystem.getContentStructureFromDatabase(
        "flat",
        locals.tenantId,
      );
      const serializedStructure = updatedStructure.map((node: any) => ({
        ...node,
        _id: node._id.toString(),
        ...(node.parentId ? { parentId: node.parentId.toString() } : {}),
      }));

      return { success: true, contentStructure: serializedStructure };
    } catch (err) {
      logger.error("Error saving config:", err);
      return fail(500, { message: "Failed to save configuration" });
    }
  },

  loadPreset: async ({ request, locals }) => {
    // 🛡️ SECURITY FIX: Use centralized permission check
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const presetId = formData.get("presetId") as string;

    if (!presetId || presetId === "blank") {
      return fail(400, { message: "Invalid preset ID parameter" });
    }

    try {
      // 🚀 PERFORMANCE FIX: Use top-level imports for node modules (path and fs)
      const { resolve } = path;
      const { cpSync, existsSync, mkdirSync } = fs;

      // The full absolute paths are complex to manage. We rely on relative resolution from the script's location.
      const presetDir = resolve(process.cwd(), "src", "presets", presetId);
      const expectedPresetBase = resolve(process.cwd(), "src", "presets");

      if (!presetDir.startsWith(expectedPresetBase) || !existsSync(presetDir)) {
        return fail(404, { message: "Preset directory not found" });
      }

      // Define target path relative to the project root (using locals.tenantId or default config/collections)
      const targetDir = locals.tenantId
        ? resolve(process.cwd(), "config", locals.tenantId, "collections")
        : resolve(process.cwd(), "config", "collections");

      mkdirSync(targetDir, { recursive: true });
      cpSync(presetDir, targetDir, { recursive: true, force: true });

      // Trigger compilation and refresh manager
      await contentSystem.refresh(locals.tenantId);

      return {
        success: true,
        message: `Preset ${presetId} installed successfully`,
      };
    } catch (err) {
      logger.error("❌ Failed to install preset:", err);
      return fail(500, { message: "Failed to install preset" });
    }
  },
};
