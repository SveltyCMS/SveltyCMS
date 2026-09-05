/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder.server.ts
 * @description Collection Builder server functions — permission-gated remotes via LocalCMS.
 *
 * ### Features:
 * - `executeGuiStructureSave` — unified gui-save path (upsert, manifest, SSE)
 * - `saveContentStructure` / `deleteContentNodes` — permission-gated remotes
 * - Preset installation with content refresh
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error, fail } from "@sveltejs/kit";
import type { ContentNodeOperation } from "@src/content/types";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import {
  executeGuiStructureSave,
  getCollectionBuilderCms,
  serializeStructureNodes,
} from "./collectionbuilder-local.server";
import { parseIdList, parseOperations } from "./collectionbuilder-utils";

/** @deprecated Use `ContentNodeOperation` from `@src/content/types` */
export type UpsertOperation = ContentNodeOperation;

export { executeGuiStructureSave, serializeStructureNodes } from "./collectionbuilder-local.server";

function requirePermission(event: RequestEvent) {
  const user = getAuthenticatedUser(event.locals);
  const { roles: tenantRoles, isAdmin } = event.locals as App.Locals;
  if (!hasCollectionBuilderPermission(user, tenantRoles, isAdmin))
    throw error(403, "Insufficient permissions");
}

export async function saveContentStructure(
  event: RequestEvent,
  operations: ContentNodeOperation[],
) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;

  const parsed = parseOperations(operations);
  if (!parsed) return fail(400, { message: "Invalid operations" });

  try {
    return await executeGuiStructureSave(tenantId, parsed);
  } catch (err) {
    logger.error("Error saving structure:", err);
    return fail(500, { message: "Failed to save structure" });
  }
}

export async function deleteContentNodes(event: RequestEvent, ids: string[]) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;

  const parsed = parseIdList(ids);
  if (!parsed) return fail(400, { message: "Invalid IDs" });

  try {
    const cms = await getCollectionBuilderCms(tenantId);
    const result = await cms.contentStructure.deleteByIds(parsed, { tenantId });
    if (!result.found) return fail(404, { message: "No matching nodes found" });
    return {
      success: true,
      contentStructure: serializeStructureNodes(result.result.contentStructure ?? []),
    };
  } catch (err) {
    logger.error("Error deleting nodes:", err);
    return fail(500, { message: "Failed to delete" });
  }
}

/** Shared preset installer — allowlisted ids only, no raw filesystem copy. */
export async function installPresetCollections(
  tenantId: string | null,
  presetId: string,
  opts?: { rejectDemo?: boolean },
) {
  if (!presetId || presetId === "blank" || (opts?.rejectDemo && presetId === "demo")) {
    return fail(400, { message: "Invalid preset ID" });
  }

  const { PRESETS } = await import("@src/routes/setup/presets");
  const preset = PRESETS.find((p) => p.id === presetId);

  if (!preset || !preset.collections || preset.collections.length === 0) {
    return fail(404, {
      message: `No collections defined for preset "${presetId}"`,
    });
  }

  const { writePresetCollectionFiles } =
    await import("@src/routes/setup/preset-collections.server");
  await writePresetCollectionFiles(preset.collections, { tenantId });

  const cms = await getCollectionBuilderCms(tenantId);
  await cms.content.refresh(tenantId);

  const created = preset.collections.map((c) => c.name);
  return {
    success: true,
    message: `Created ${created.length} collections: ${created.join(", ")}`,
    collections: created,
  };
}

export async function installPreset(event: RequestEvent, presetId: string) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;
  return installPresetCollections(tenantId, presetId);
}

export async function installTemplateCollections(event: RequestEvent, presetId: string) {
  requirePermission(event);
  const tenantId = (event.locals as App.Locals).tenantId ?? null;
  return installPresetCollections(tenantId, presetId, { rejectDemo: true });
}
