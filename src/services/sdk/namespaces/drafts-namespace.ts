/**
 * @file src/services/sdk/namespaces/drafts-namespace.ts
 * @description Draft/live separation for the LocalCMS SDK.
 *
 * Autosave writes a `content_drafts` row and never touches the live entry; the
 * editor keeps calling `collections.update()` only on an explicit Save/Publish.
 *
 * Registration: `LocalCMS.drafts` (top-level namespace, like `media` / `system`).
 * Every method is collection-scoped, author-scoped and tenant-scoped, and reuses
 * the same schema resolution + ownership/access-rule gate as
 * `CollectionsNamespace.update()` — a caller who may not write an entry may not
 * park a draft against it either.
 *
 * ### Features:
 * - `saveDraft` upserts the newest draft for `(contentId, authorId)` and bumps `version`
 * - A new unsaved entry gets no placeholder id: the draft row's own UUID becomes
 *   `contentId` and `data.__draft = { kind: "new" }` marks it resumable
 * - Legacy drafts (`collectionId` null) stay reachable by entry id
 * - Discard one draft or every draft for an entry, always author-scoped
 */

import { AppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type {
  ContentDraft,
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
} from "@src/databases/db-interface";
import type { CollectionsNamespace } from "./collections-namespace";
import type { LocalApiOptions } from "./types";

/** Draft statuses accepted by the `content_drafts.status` enum. */
const DRAFT_STATUSES = new Set<ContentDraft["status"]>(["draft", "review", "archived"]);

/** The adapter column name for the draft table (no domain adapter exposes it otherwise). */
const DRAFT_COLLECTION = "content_drafts";

/** Autosave payload: `entryId` targets a live entry, omitted for an unsaved one. */
export interface SaveDraftPayload {
  /** Live entry id. Omit for an entry that has never been saved. */
  entryId?: string;
  /** Widget payload to persist. Never written to the live row by this namespace. */
  data: Record<string, unknown>;
  /** Defaults to `"draft"`. */
  status?: ContentDraft["status"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNewEntryDraft(draft: ContentDraft | null): boolean {
  const marker = (draft?.data as { __draft?: { kind?: unknown } } | undefined)?.__draft;
  return marker?.kind === "new";
}

/** Tag a draft as belonging to an entry that has no live row yet. */
function withNewEntryMarker(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, __draft: { kind: "new" } };
}

/**
 * `__draft` is SveltyCMS's own marker, never an editable widget field: an entry
 * draft that still carries it would leak the marker into the live row on publish.
 */
function withoutDraftMarker(data: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(data, "__draft")) return data;
  const { __draft: _marker, ...rest } = data;
  return rest;
}

function authorIdOf(user: unknown, system?: boolean): DatabaseId {
  if (system) return "system" as DatabaseId;
  const id = (user as { _id?: unknown } | null | undefined)?._id;
  if (typeof id !== "string" || id.length === 0) {
    raise(401, "Authentication required.", "UNAUTHORIZED");
  }
  return id as DatabaseId;
}

/**
 * Collection-scoped draft operations.
 *
 * Registered on `LocalCMS` as `cms.drafts` and reached over HTTP through
 * `/api/collections/:collectionId/drafts` (see the collections route handler).
 */
export class DraftsNamespace {
  constructor(
    private readonly _dbAdapter: IDBAdapter,
    private readonly _collections: CollectionsNamespace,
  ) {}

  /**
   * Resolve the collection and fail closed on an unauthenticated caller. For an
   * existing entry the same ownership/access-rule gate as `update()` runs; a
   * new-entry draft has no live row, so its gate is skipped.
   */
  private async _assertCollectionAccess(
    collectionId: string,
    entryId: string | undefined,
    options: LocalApiOptions,
    skipEntryGate: boolean,
  ): Promise<void> {
    if (typeof collectionId !== "string" || collectionId.length === 0) {
      raise(400, "Collection id is required.", "COLLECTION_ID_REQUIRED");
    }
    if (!options.user && !options.system) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    await this._collections.getSchema(collectionId, options.tenantId);
    if (entryId && !skipEntryGate) {
      await this._collections.assertEntryWriteAccess(collectionId, entryId, options);
    }
  }

  /**
   * Persist a draft without touching the live entry.
   *
   * Resuming a new-entry draft means passing the `contentId` returned by the
   * previous save as `entryId`; the `__draft.kind = "new"` marker is preserved
   * automatically, so the draft never turns into an "entry" draft by accident.
   */
  async saveDraft(
    collectionId: string,
    payload: SaveDraftPayload,
    options: LocalApiOptions = {},
  ): Promise<DatabaseResult<ContentDraft>> {
    try {
      const { user, tenantId, system } = options;
      if (!isRecord(payload?.data)) {
        raise(400, "Draft data must be an object.", "DRAFT_DATA_REQUIRED");
      }
      if (payload.status !== undefined && !DRAFT_STATUSES.has(payload.status)) {
        raise(400, `Unknown draft status '${String(payload.status)}'.`, "DRAFT_STATUS_INVALID");
      }
      const entryId =
        typeof payload.entryId === "string" && payload.entryId.length > 0
          ? payload.entryId
          : undefined;
      const authorId = authorIdOf(user, system);

      // A draft written for a new entry has no live row to own; its id doubles as
      // the entry id on resume, so the marker check must run before the gate.
      let resumeNewEntry = false;
      if (entryId) {
        const existing = await this._dbAdapter.content.drafts.getLatestForContent(
          entryId as DatabaseId,
          { tenantId, authorId },
        );
        if (!existing.success) {
          raise(500, existing.message ?? "Draft lookup failed.", "DRAFT_LOOKUP_FAILED");
        }
        resumeNewEntry = isNewEntryDraft(existing.data);
      }

      await this._assertCollectionAccess(collectionId, entryId, options, resumeNewEntry);

      const data =
        !entryId || resumeNewEntry
          ? withNewEntryMarker(payload.data)
          : withoutDraftMarker(payload.data);

      return this._dbAdapter.content.drafts.upsertDraft(
        {
          authorId,
          collectionId: collectionId as DatabaseId,
          ...(entryId ? { contentId: entryId as DatabaseId } : {}),
          data,
          status: payload.status ?? "draft",
          tenantId,
        },
        { tenantId },
      );
    } catch (err) {
      rethrow(err);
      logger.debug(`[Drafts] saveDraft failed for ${collectionId}:`, err);
      throw err;
    }
  }

  /**
   * Latest draft for the caller.
   *
   * With `entryId` → the newest draft for that entry. Without it → the newest
   * draft for an entry that was never created (new-entry kind).
   */
  async getDraft(
    collectionId: string,
    entryId?: string,
    options: LocalApiOptions = {},
  ): Promise<DatabaseResult<ContentDraft | null>> {
    try {
      const { user, tenantId, system } = options;
      await this._assertCollectionAccess(collectionId, undefined, options, true);
      const authorId = authorIdOf(user, system);

      return entryId
        ? this._dbAdapter.content.drafts.getLatestForContent(entryId as DatabaseId, {
            tenantId,
            authorId,
          })
        : this._dbAdapter.content.drafts.getLatestForCollection(
            collectionId as DatabaseId,
            authorId,
            { tenantId, kind: "new" },
          );
    } catch (err) {
      rethrow(err);
      logger.debug(`[Drafts] getDraft failed for ${collectionId}:`, err);
      throw err;
    }
  }

  /**
   * Delete one draft. Another author's draft is reported as absent (404), not
   * forbidden, so the endpoint does not disclose draft ids.
   */
  async discardDraft(
    collectionId: string,
    draftId: string,
    options: LocalApiOptions = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      if (typeof draftId !== "string" || draftId.length === 0) {
        raise(400, "Draft id is required.", "DRAFT_ID_REQUIRED");
      }
      const { user, tenantId, system } = options;
      await this._assertCollectionAccess(collectionId, undefined, options, true);
      const authorId = authorIdOf(user, system);

      const found = await this._dbAdapter.crud.findOne(
        DRAFT_COLLECTION,
        { _id: draftId } as never,
        { tenantId: tenantId as DatabaseId },
      );
      const row = found.success ? (found.data as Record<string, unknown> | null) : null;
      if (
        !row ||
        (row.authorId !== undefined && String(row.authorId) !== authorId && !system) ||
        (row.collectionId != null && String(row.collectionId) !== collectionId)
      ) {
        raise(404, "Draft not found.", "NOT_FOUND");
      }

      const deleted = await this._dbAdapter.content.drafts.delete(draftId as DatabaseId, {
        tenantId: tenantId as DatabaseId,
      });
      if (!deleted.success) {
        return {
          success: false,
          message: deleted.message,
          error: deleted.error,
        } as DatabaseResult<{ deletedCount: number }>;
      }
      return { success: true, data: { deletedCount: 1 } };
    } catch (err) {
      rethrow(err);
      logger.debug(`[Drafts] discardDraft failed for ${collectionId}/${draftId}:`, err);
      throw err;
    }
  }

  /** Delete every draft the caller owns for an entry. */
  async discardDraftsForEntry(
    collectionId: string,
    entryId: string,
    options: LocalApiOptions = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      if (typeof entryId !== "string" || entryId.length === 0) {
        raise(400, "Entry id is required.", "ENTRY_ID_REQUIRED");
      }
      const { user, tenantId, system } = options;
      await this._assertCollectionAccess(collectionId, undefined, options, true);
      const authorId = authorIdOf(user, system);

      return this._dbAdapter.content.drafts.deleteForContent(entryId as DatabaseId, {
        tenantId,
        authorId,
      });
    } catch (err) {
      rethrow(err);
      logger.debug(`[Drafts] discardDraftsForEntry failed for ${collectionId}/${entryId}:`, err);
      throw err;
    }
  }
}
