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
import { error, fail, isRedirect, isHttpError } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { Actions, PageServerLoad } from "./$types";
import { serializeStructureNodes } from "./collectionbuilder-local.server";
import { parseIdList, parseJsonArray, parseOperations } from "./collectionbuilder-utils";

/**
 * @internal Helper function to enforce collection builder permissions.
 * @throws {Error} If user lacks required permission or is not logged in.
 */
function requireCollectionBuilderPermission(locals: App.Locals): void {
  const user = getAuthenticatedUser(locals);
  const { roles: tenantRoles, isAdmin } = locals;
  if (!hasCollectionBuilderPermission(user, tenantRoles, isAdmin)) {
    logger.warn("[CollectionBuilder] Permission denied for action.", {
      userId: user._id,
    });
    throw error(403, "Insufficient permissions to manage collections");
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const { isAdmin, tenantId } = locals;

    requireCollectionBuilderPermission(locals);

    if (!contentSystem.isInitialized) {
      await contentSystem.initialize(tenantId, true);
    }

    let contentStructure = await contentSystem.getContentStructureFromDatabase("flat", tenantId);

    // Self-heal empty DB after a skipReconciliation setup — one full refresh only.
    if ((!contentStructure || contentStructure.length === 0) && contentSystem.isInitialized) {
      logger.warn(
        "[CollectionBuilder] No content nodes found despite system being initialized. Triggering refresh...",
      );
      await contentSystem.refresh(tenantId, false, false);
      contentStructure = await contentSystem.getContentStructureFromDatabase("flat", tenantId);
    }

    if (!Array.isArray(contentStructure)) {
      logger.error("[CollectionBuilder] contentStructure is not an array!", {
        type: typeof contentStructure,
      });
    }

    const serializedStructure = serializeStructureNodes(contentStructure || []);
    const userId = user._id?.toString();

    return {
      user: {
        id: userId || "missing-user-id",
        email: user.email,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
        locale: user.locale,
        isAdmin,
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
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const ids = parseIdList(parseJsonArray(formData.get("ids")));

    if (!ids) {
      return fail(400, { message: "Invalid IDs for deletion" });
    }

    try {
      const currentStructure = await contentSystem.getContentStructureFromDatabase(
        "flat",
        locals.tenantId,
      );
      const idSet = new Set(ids);
      const operations = (currentStructure || [])
        .filter((node: { _id?: { toString(): string }; path?: string }) =>
          idSet.has(node._id?.toString() ?? ""),
        )
        .map((node: { path?: string }) => ({
          type: "delete" as const,
          node: { path: node.path ?? "" },
        }));

      await contentSystem.upsertContentNodes(operations, locals.tenantId);
      await contentSystem.refresh(locals.tenantId);

      return { success: true };
    } catch (err) {
      logger.error("Error deleting collections:", err);
      return fail(500, { message: "Failed to delete collections" });
    }
  },

  saveConfig: async ({ request, locals }) => {
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const operations = parseOperations(parseJsonArray(formData.get("items")));

    if (!operations) {
      return fail(400, { message: "Invalid items for save" });
    }

    try {
      const { executeGuiStructureSave } = await import("./collectionbuilder.server");
      return await executeGuiStructureSave(locals.tenantId ?? null, operations);
    } catch (err) {
      logger.error("Error saving config:", err);
      return fail(500, { message: "Failed to save configuration" });
    }
  },

  loadPreset: async ({ request, locals }) => {
    requireCollectionBuilderPermission(locals);

    const formData = await request.formData();
    const presetId = String(formData.get("presetId") ?? "").trim();

    try {
      const { installPresetCollections } = await import("./collectionbuilder.server");
      return await installPresetCollections(locals.tenantId ?? null, presetId);
    } catch (err) {
      logger.error("Failed to install preset:", err);
      return fail(500, { message: "Failed to install preset" });
    }
  },
};
