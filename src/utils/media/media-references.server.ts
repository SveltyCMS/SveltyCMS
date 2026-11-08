/**
 * @file src/utils/media/media-references.server.ts
 * @description In-memory reverse index and usage query service for media assets.
 *
 * Features:
 * - O(1) media reference lookup across published and draft collections
 * - Parallel collection scanning with canonical physical table resolution
 * - Fast batch published ID collection for media gallery badges
 * - Legacy reference enrichment for backwards compatibility
 */

import { logger } from "@src/utils/logger";
import { collectionTableName } from "@src/databases/core/collection-name";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { MediaReferenceIndex, MediaReference } from "./media-reference-index";

let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

export interface ReferenceIndexTenantState {
  referenceIndex: MediaReferenceIndex;
  entryStatusMap: Map<string, string>;
  entryNameMap: Map<string, string>;
  rebuildInflight: Promise<void> | null;
}

export interface ReferencesContext {
  db: IDBAdapter;
  getTenantState(tenantId?: DatabaseId | null): ReferenceIndexTenantState;
}

/** Enrich index references with legacy fields for backward compatibility. */
function enrichReferences(
  refs: MediaReference[],
  entryNameMap: Map<string, string>,
): MediaReference[] {
  for (const ref of refs) {
    ref.fieldName = ref.fieldPath.split(".")[0] || ref.fieldPath;
    ref.entryName = entryNameMap.get(ref.entryId) || ref.entryId;
  }
  return refs;
}

/**
 * Rebuilds the in-memory reference index by scanning all collection entries in parallel.
 */
async function executeRebuildReferenceIndex(
  db: IDBAdapter,
  tenantId: DatabaseId | null | undefined,
  state: {
    referenceIndex: MediaReferenceIndex;
    entryStatusMap: Map<string, string>;
    entryNameMap: Map<string, string>;
  },
): Promise<void> {
  const { scanCompiledCollections } = await loadEngineServerModule();
  const schemas = await scanCompiledCollections();
  const allEntries: Array<{
    collectionId: string;
    collectionName: string;
    entryId: string;
    data: Record<string, unknown>;
    status?: string;
  }> = [];

  await Promise.all(
    schemas.map(async (schema) => {
      const collectionName = collectionTableName(schema._id as string);
      const collectionLabel = schema.name || schema._id || "";
      try {
        const res = await db.crud.findMany(collectionName, {}, { tenantId: tenantId });
        if (res.success && Array.isArray(res.data)) {
          for (const entry of res.data) {
            const entryAny = entry as unknown as Record<string, unknown>;
            const entryId = entryAny._id?.toString() ?? "";
            allEntries.push({
              collectionId: schema._id ?? "",
              collectionName: collectionLabel,
              entryId,
              data: entryAny,
              status: entryAny.status as string | undefined,
            });
            const entryName =
              entryAny.name || entryAny.title || entryAny.slug || entryAny._id || entryId;
            state.entryNameMap.set(entryId, String(entryName));
            if (entryAny.status) {
              state.entryStatusMap.set(entryId, entryAny.status as string);
            }
          }
        }
      } catch (err) {
        logger.error(`[MediaService] Error scanning ${collectionName} for references:`, err);
      }
    }),
  );

  state.referenceIndex.rebuild(allEntries);
  state.referenceIndex.markBuilt();
}

async function ensureReferenceIndex(
  ctx: ReferencesContext,
  tenantId?: DatabaseId | null,
): Promise<ReferenceIndexTenantState> {
  const state = ctx.getTenantState(tenantId);
  if (state.referenceIndex.isBuilt()) return state;
  if (!state.rebuildInflight) {
    state.rebuildInflight = executeRebuildReferenceIndex(ctx.db, tenantId, state).finally(() => {
      state.rebuildInflight = null;
    });
  }
  await state.rebuildInflight;
  return state;
}

export async function executeGetMediaReferences(
  ctx: ReferencesContext,
  mediaId: string,
  tenantId?: DatabaseId | null,
): Promise<MediaReference[]> {
  try {
    const state = await ensureReferenceIndex(ctx, tenantId);
    return enrichReferences(state.referenceIndex.getReferences(mediaId), state.entryNameMap);
  } catch (err) {
    logger.error(`[MediaService] Error scanning usage references:`, err);
    return [];
  }
}

export async function executeGetPublishedReferencedIds(
  ctx: ReferencesContext,
  mediaIds: string[],
  tenantId?: DatabaseId | null,
): Promise<string[]> {
  if (mediaIds.length === 0) return [];
  try {
    const state = await ensureReferenceIndex(ctx, tenantId);
    return state.referenceIndex.collectPublishedIds(
      mediaIds,
      (entryId) => state.entryStatusMap.get(entryId) === "publish",
    );
  } catch (err) {
    logger.error(`[MediaService] Error collecting published media ids:`, err);
    return [];
  }
}

export async function executeIsReferencedByPublishedContent(
  ctx: ReferencesContext,
  mediaId: string,
  tenantId?: DatabaseId | null,
): Promise<{ referenced: boolean; references: MediaReference[] }> {
  try {
    const references = await executeGetPublishedReferences(ctx, mediaId, tenantId);
    return {
      referenced: references.length > 0,
      references,
    };
  } catch (err) {
    logger.error(`[MediaService] Error checking published references:`, err);
    return { referenced: false, references: [] };
  }
}

export async function executeGetPublishedReferences(
  ctx: ReferencesContext,
  mediaId: string,
  tenantId?: DatabaseId | null,
): Promise<MediaReference[]> {
  try {
    const state = await ensureReferenceIndex(ctx, tenantId);
    const allRefs = state.referenceIndex.getReferences(mediaId);
    return enrichReferences(
      allRefs.filter((ref) => state.entryStatusMap.get(ref.entryId) === "publish"),
      state.entryNameMap,
    );
  } catch (err) {
    logger.error(`[MediaService] Error scanning published references:`, err);
    return [];
  }
}
