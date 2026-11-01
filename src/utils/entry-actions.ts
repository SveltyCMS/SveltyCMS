/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on collection entries.
 */

import type { StatusType } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
// ParaglideJS
import {
  button_cancel,
  clone_entry_error,
  clone_entry_no_selection_error,
  delete_entry_error,
  delete_entry_no_selection_error,
  entry_deleted_success,
} from "@src/paraglide/messages";
import { collections, setCollectionValue, setMode } from "@src/stores/collection-store.svelte.ts";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { DEFAULT_THEMES, showCloneModal, showConfirm } from "@utils/modal.svelte";
import {
  batchDeleteEntries,
  batchUpdateEntries,
  createClones,
  createEntry,
  deleteEntry,
  invalidateCollectionCache,
  updateEntry,
} from "./api";
import { entryMessages } from "./entry-actions-messages";
import { logger } from "./logger";

/**
 * Delete intent → transport flag.
 *
 * `USE_ARCHIVE_ON_DELETE` is the site switch for *restorable* deletes ("Archive files
 * instead of permanent deletion"): on → the row is soft-deleted (`isDeleted`) and lands
 * in Config → Trash, off → a real DELETE. It must never be read as "set status=archive":
 * that is a content status (see setEntriesStatus), not a delete.
 *
 * `true` here means IRREVERSIBLE: `crud.deleteMany`/`crud.delete` issue a real DELETE, and
 * /api/trash/restore has nothing left to restore. Two paths reach it without the user
 * having asked for "permanent":
 *
 * 1. `USE_ARCHIVE_ON_DELETE` off OR undefined → every Delete becomes permanent, including
 *    a non-admin's Delete in the entry editor. The base implementation always soft-deleted
 *    from the editor (and only the list offered a permanent variant), so an install that
 *    never sets the switch now destroys rows from the editor on the first click.
 * 2. The Archived view: a row that is already `status: "archive"` is deleted permanently
 *    by design (entry-list.svelte passes `showDeleted` through as `permanentRequest`),
 *    because the Trash only ever holds `isDeleted` rows and would not list it.
 */
function resolvePermanentDelete(explicitPermanent: boolean): boolean {
  return explicitPermanent || !publicEnv.USE_ARCHIVE_ON_DELETE;
}

/**
 * Error code the bulk endpoint answers with when the schema sets `disableBulkDelete`
 * (src/services/sdk/namespaces/collections-namespace.ts:1782, twin at
 * src/routes/api/[...path]/handlers/collections.ts:805).
 *
 * The switch forbids the BATCH endpoint, not deletion — its own message says "use
 * individual delete instead". Treating it as a hard failure is what killed list Delete
 * entirely on those schemas.
 */
const BULK_DELETE_DISABLED = "BULK_DELETE_DISABLED";

// Sets the status for one or more entries
export async function setEntriesStatus(
  entryIds: string[],
  status: StatusType,
  onSuccess: () => void,
  payload: Record<string, unknown> = {},
) {
  if (!entryIds.length) {
    return;
  }
  const collId = collections.active?._id;
  if (!collId) {
    return;
  }

  const result = await batchUpdateEntries(collId, {
    ids: entryIds,
    status,
    ...payload,
  });
  if (result.success) {
    // Use centralized messaging
    const count = entryIds.length;
    let message: string;

    switch (status) {
      case StatusTypes.archive:
        message = entryMessages.entriesArchived(count);
        break;
      case StatusTypes.publish:
        message = entryMessages.entriesPublished(count);
        break;
      case StatusTypes.unpublish:
        message = entryMessages.entriesUnpublished(count);
        break;
      case StatusTypes.draft:
        message = entryMessages.entriesUpdated(count, StatusTypes.draft);
        break;
      default:
        message = entryMessages.entriesUpdated(count, status);
    }

    toast.success({ description: message });
    onSuccess();
  } else {
    toast.error({
      description: result.error || entryMessages.updateFailed("update"),
    });
  }
}

// Bulk edit fields for one or more entries
export async function bulkEditEntries(
  entryIds: string[],
  fields: Record<string, unknown>,
  onSuccess: () => void,
) {
  if (!entryIds.length) {
    return;
  }
  const collId = collections.active?._id;
  if (!collId) {
    return;
  }

  const result = await batchUpdateEntries(collId, {
    ids: entryIds,
    data: fields,
  });

  if (result.success) {
    const count = entryIds.length;
    toast.success({
      description: `${count} ${count === 1 ? "entry" : "entries"} updated successfully`,
    });
    onSuccess();
  } else {
    toast.error({
      description: result.error || result.message || "Failed to update entries",
    });
  }
}

/**
 * What one selection delete really achieved.
 *
 * `deleted` counts rows the API confirmed. It is the ONLY number a toast may quote —
 * the selection size is a request, not an outcome.
 */
interface DeleteOutcome {
  deleted: number;
  failed: number;
  /** First real error from the API, for the toast. */
  error?: string;
}

/**
 * Per-row DELETE for schemas that refuse the batch endpoint (`disableBulkDelete`).
 *
 * Sequential on purpose: a burst of N parallel DELETEs on a large selection is exactly
 * the traffic the per-client request limiter turns into 429 — and a limited row would be
 * reported as "still there" although nothing is wrong with it.
 */
async function deleteRowsIndividually(
  collectionId: string,
  entryIds: string[],
  permanent: boolean,
): Promise<DeleteOutcome> {
  let deleted = 0;
  let error: string | undefined;

  for (const entryId of entryIds) {
    try {
      const result = await deleteEntry(collectionId, entryId, { permanent });
      if (result.success) {
        deleted++;
      } else if (!error) {
        error = result.error || result.message || "Delete failed";
      }
    } catch (e) {
      error = error || (e as Error).message;
    }
  }

  return { deleted, failed: entryIds.length - deleted, error };
}

/**
 * Deletes one selection, reporting rows that really changed.
 *
 * Request counts for a selection of n rows:
 * - n === 1              → 1 request (`DELETE …/:id`). No schema disables the single
 *                          route, so a one-row delete never touches the bulk guard.
 * - n > 1, bulk allowed  → 1 request (`POST …/batch`) — the normal case, no N+1.
 * - n > 1, bulk disabled → 1 refused batch + n per-row DELETEs = n + 1 requests.
 *
 * The per-row path is not a general fallback: it runs only for BULK_DELETE_DISABLED,
 * where the server refuses the WHOLE selection before touching a row (nothing partial
 * to reconcile). Any other failure — 403 on permissions, 5xx, network — stays an error
 * instead of firing n more requests at an endpoint that just said no.
 */
async function deleteSelection(
  collectionId: string,
  entryIds: string[],
  permanent: boolean,
): Promise<DeleteOutcome> {
  if (entryIds.length === 1) {
    return deleteRowsIndividually(collectionId, entryIds, permanent);
  }

  let result: Awaited<ReturnType<typeof batchDeleteEntries>>;
  try {
    result = await batchDeleteEntries(collectionId, entryIds, { permanent });
  } catch (e) {
    return { deleted: 0, failed: entryIds.length, error: (e as Error).message };
  }

  if (result.success) {
    return { deleted: entryIds.length, failed: 0 };
  }

  if (result.code === BULK_DELETE_DISABLED) {
    return deleteRowsIndividually(collectionId, entryIds, permanent);
  }

  return {
    deleted: 0,
    failed: entryIds.length,
    error: result.error || result.message || "Delete failed",
  };
}

/**
 * Moves one or more entries to the Trash (default) or deletes them permanently.
 *
 * Callers pass a selection size; the toast quotes `DeleteOutcome.deleted`, so a refused
 * or partially failed selection can no longer end in a green "3 entries moved to the
 * Trash" while nothing (or one row) changed. `onSuccess` still runs when at least one row
 * changed, because the list has to drop the rows that ARE gone.
 */
export async function deleteEntries(
  entryIds: string[],
  isPermanentDelete: boolean,
  onSuccess: () => void,
) {
  if (!entryIds.length) {
    return;
  }
  const collId = collections.active?._id;
  if (!collId) {
    return;
  }

  const permanent = resolvePermanentDelete(isPermanentDelete);
  const failure = entryMessages.deleteFailed(permanent ? StatusTypes.delete : "trash");
  const describe = (count: number) =>
    permanent ? entryMessages.entriesDeleted(count) : entryMessages.entriesTrashed(count);

  const outcome = await deleteSelection(collId, entryIds, permanent);

  if (outcome.deleted === 0) {
    toast.error({ description: outcome.error || failure });
    return;
  }

  if (outcome.failed > 0) {
    toast.error({
      description: `${describe(outcome.deleted)} — ${outcome.failed} of ${entryIds.length} not deleted: ${outcome.error ?? failure}`,
    });
  } else {
    toast.success({ description: describe(outcome.deleted) });
  }
  onSuccess();
}

// Clones one or more entries
export async function cloneEntries(rawEntries: Record<string, unknown>[], onSuccess: () => void) {
  if (!rawEntries.length) {
    return;
  }
  const collId = collections.active?._id;
  if (!collId) {
    return;
  }

  const entriesToClone = rawEntries.map((entry) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, createdAt, updatedAt, ...rest } = entry;
    return { ...rest, clonedFrom: _id };
  });

  const result = await createClones(collId, entriesToClone);
  if (result.success) {
    toast.success("Entries cloned");
    onSuccess();
  } else {
    toast.error({ description: result.error || "Failed to clone entries" });
  }
}

// Saves a new or existing entry
export async function saveEntry(
  entryData: Record<string, unknown>,
  publish = false,
): Promise<boolean> {
  const collId = collections.active?._id;
  if (!collId) {
    toast.warning("Collection not found");
    return false;
  }

  const entryId = entryData._id as string | undefined;

  // Preserve user's chosen status unless explicitly publishing
  const payload = { ...entryData };
  if (publish) {
    payload.status = StatusTypes.publish;
  } else if (!payload.status) {
    // Use collection's default status if no status is specified (new entries)
    payload.status = collections.active?.status || StatusTypes.draft;
  }
  // Otherwise preserve the existing status from entryData

  const result = entryId
    ? await updateEntry(collId, entryId, payload)
    : await createEntry(collId, payload);

  if (result.success) {
    toast.success("Entry saved");
    if (result.data) {
      setCollectionValue(result.data as Record<string, unknown>);
    }
    // setMode('view'); // Handled by caller to ensure proper navigation flow
    invalidateCollectionCache(collId);

    // Trigger SvelteKit SSR reload - Handled by caller via goto(..., { refreshAll: true })
    // await invalidateAll();

    // Clear client-side cache in EntryList component
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("clearEntryListCache", {
          detail: { reason: "entry-saved", collectionId: collId },
        }),
      );
    }
    return true;
  }
  toast.error({ description: result.error || "Failed to save entry" });
  return false;
}

// Deletes the currently active entry after confirmation.
//
// One dialog, one action. The previous "Archive Entry" dialog moved the permanent delete
// onto the Cancel button and chained a second confirm from `onCancel`; that chain
// cancelled the dialog it was opened from, re-fired its onCancel and recursed until
// `RangeError: Maximum call stack size exceeded` (BUG M3). A two-button confirm cannot
// express a three-way choice, so Delete now has exactly one meaning: move the entry to the
// Trash when deletes are restorable, otherwise remove it for good.
export async function deleteCurrentEntry(isAdmin = false) {
  const entry = collections.activeValue;
  const coll = collections.active;
  if (!(entry?._id && coll?._id)) {
    toast.warning({ description: delete_entry_no_selection_error() });
    return;
  }

  // Type assertions after null check
  const collectionId = coll._id as string;
  const entryId = entry._id as string;

  const entryStatus: StatusType = (entry.status as StatusType) || StatusTypes.draft;
  const isArchived = entryStatus === StatusTypes.archive;

  // Archived entries stay admin-only: deleting one is final (they never sit in the Trash).
  if (isArchived && !isAdmin) {
    toast.warning({ description: entryMessages.onlyAdminsCanDelete() });
    return;
  }

  // An archived entry is already out of the collection, so "delete" there means permanent.
  showDeleteConfirmation(collectionId, entryId, {
    permanent: resolvePermanentDelete(isArchived),
  });
}

// Single confirmation for the active entry: Trash (restorable) or permanent delete.
function showDeleteConfirmation(
  collectionId: string,
  entryId: string,
  options: { permanent: boolean },
) {
  const { permanent } = options;
  showConfirm({
    title: permanent ? "Delete Entry Permanently" : "Move Entry to Trash",
    body: permanent
      ? `This entry will be <span class="text-error-500 font-semibold">permanently deleted</span>. This action cannot be undone.`
      : `This entry will be moved to the <span class="text-warning-500 font-semibold">Trash</span> and hidden from the collection. You can restore it from Config → Trash.`,
    confirmText: permanent ? "Delete Permanently" : "Move to Trash",
    cancelText: button_cancel(),
    theme: permanent ? DEFAULT_THEMES.delete : DEFAULT_THEMES.archive,
    onConfirm: async () => {
      try {
        const result = await deleteEntry(collectionId, entryId, { permanent });
        if (!result.success) {
          throw new Error(result.error || result.message || "Delete failed");
        }
        toast.success({
          description: permanent ? entry_deleted_success() : "Entry moved to the Trash.",
        });
        setMode("view");
        setCollectionValue({});
        invalidateCollectionCache(collectionId);
      } catch (e) {
        toast.error({
          description: delete_entry_error({ error: (e as Error).message }),
        });
      }
    },
  });
}

// Clones the currently active entry with improved modal
export async function cloneCurrentEntry() {
  const entry = collections.activeValue;
  const coll = collections.active;
  if (!(entry && coll?._id)) {
    toast.warning({ description: clone_entry_no_selection_error() });
    return;
  }

  const collectionId = coll._id as string;

  showCloneModal({
    count: 1,
    onConfirm: async () => {
      try {
        const clonedPayload = structuredClone(entry);

        // Remove unique identifiers and timestamps
        clonedPayload._id = undefined;
        clonedPayload.createdAt = undefined;
        clonedPayload.updatedAt = undefined;

        // Set clone status and reference to original
        clonedPayload.status = StatusTypes.draft;
        clonedPayload.clonedFrom = entry._id;

        logger.debug("Cloning entry with payload:", clonedPayload);

        const result = await createEntry(collectionId, clonedPayload);
        if (result.success) {
          toast.success({ description: entryMessages.entryCloned() });
          invalidateCollectionCache(collectionId);
          setMode("view");
        } else {
          throw new Error(result.error || "Failed to create clone");
        }
      } catch (e) {
        toast.error({
          description: clone_entry_error({ error: (e as Error).message }),
        });
      }
    },
  });
}

// --- Entry Metadata Accumulator ---

interface MetaData {
  media_images_remove?: string[];
  [key: string]: unknown;
}

/** Per-entry metadata accumulator for tracking side-effects (e.g. media removal). */
export const meta_data = {
  meta_data: {} as MetaData,
  add(key: keyof MetaData, data: unknown) {
    // Smart Array Merging: combine arrays with deduplication
    if (Array.isArray(this.meta_data[key]) && Array.isArray(data)) {
      this.meta_data[key] = [...new Set([...(this.meta_data[key] as unknown[]), ...data])];
    } else {
      this.meta_data[key] = data;
    }
  },
  get(): MetaData {
    return this.meta_data;
  },
  clear() {
    this.meta_data = {};
  },
  is_empty(): boolean {
    return Object.keys(this.meta_data).length === 0;
  },
};
