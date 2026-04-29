/**
 * @file src/routes/(app)/config/collectionbuilder/+page.server.ts
 * @description Server-side logic for Collection Builder page authentication and authorization.
 *
 * Updates:
 * - Uses the enhanced functional contentSystem facade.
 * - Optimized data fetching from the database for organizational changes.
 */

// System Logger
import { contentSystem } from "@src/content/index.server";
// Auth - Use cached roles from locals instead of global config
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { error, fail, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const { user, roles: tenantRoles, isAdmin, tenantId } = locals;

    // User authentication already done by handleAuthorization hook
    if (!user) {
      logger.warn("User not authenticated, redirecting to login");
      throw redirect(302, "/login");
    }

    // Check user permission for collection builder using cached roles from locals
    const hasCollectionBuilderPermission = hasPermissionWithRoles(
      user,
      "config:collectionbuilder",
      tenantRoles,
    );

    if (!hasCollectionBuilderPermission) {
      logger.warn("Permission denied for collection builder", {
        userId: user._id,
      });
      throw error(403, "Insufficient permissions");
    }

    // Ensure content system is initialized for this tenant
    if (!contentSystem.isInitialized) {
      await contentSystem.initialize(tenantId, true);
    }

    // Fetch the initial content structure directly from database for organizational work
    const contentStructure = await contentSystem.getContentStructureFromDatabase("flat", tenantId);

    // Serialize and sanitize structures for client-side usage
    const serializedStructure = contentStructure.map((node: any) => {
      // Deep clone and strip non-serializable properties (like validationSchema functions)
      const sanitizedNode = JSON.parse(JSON.stringify(node));

      return {
        ...sanitizedNode,
        _id: sanitizedNode._id.toString(),
        ...(sanitizedNode.parentId ? { parentId: sanitizedNode.parentId.toString() } : {}),
      };
    });

    // Return user data with proper admin status and the content structure
    const { _id, ...rest } = user;
    return {
      user: {
        id: _id.toString(),
        ...rest,
        isAdmin, // Add the properly calculated admin status
      },
      contentStructure: serializedStructure,
    };
  } catch (err) {
    if (err instanceof Error && "status" in err) {
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};

export const actions: Actions = {
  deleteCollections: async ({ request, locals }) => {
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
    const formData = await request.formData();
    const items = JSON.parse(formData.get("items") as string);

    if (!(items && Array.isArray(items))) {
      return fail(400, { message: "Invalid items for save" });
    }

    try {
      await contentSystem.upsertContentNodes(items, locals.tenantId);
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
    const formData = await request.formData();
    const presetId = formData.get("presetId") as string;

    if (!presetId || presetId === "blank") {
      return fail(400, { message: "Invalid preset ID parameter" });
    }

    try {
      const { resolve } = await import("node:path");
      const { cpSync, existsSync, mkdirSync } = await import("node:fs");
      const { compile } = await import("@utils/compilation/compile");

      const presetDir = resolve(process.cwd(), "src", "presets", presetId);
      const targetDir = locals.tenantId
        ? resolve(process.cwd(), "config", locals.tenantId, "collections")
        : resolve(process.cwd(), "config", "collections");

      if (!existsSync(presetDir)) {
        return fail(404, { message: "Preset directory not found" });
      }

      mkdirSync(targetDir, { recursive: true });
      cpSync(presetDir, targetDir, { recursive: true, force: true });

      // Trigger compilation and refresh manager
      await compile();
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
