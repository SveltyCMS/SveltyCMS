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
 */
function resolvePermanentDelete(explicitPermanent: boolean): boolean {
  return explicitPermanent || !publicEnv.USE_ARCHIVE_ON_DELETE;
}

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

// Moves one or more entries to the Trash (default) or deletes them permanently.
// Exactly ONE request for the whole selection — no per-row fallback, which used to hide
// individual failures behind a success toast.
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

  try {
    const result = await batchDeleteEntries(collId, entryIds, { permanent });
    if (!result.success) {
      toast.error({
        description:
          result.error || entryMessages.deleteFailed(permanent ? StatusTypes.delete : "trash"),
      });
      return;
    }
    toast.success({
      description: permanent
        ? entryMessages.entriesDeleted(entryIds.length)
        : entryMessages.entriesTrashed(entryIds.length),
    });
    onSuccess();
  } catch (e) {
    toast.error(
      `${entryMessages.deleteFailed(permanent ? StatusTypes.delete : "trash")}: ${(e as Error).message}`,
    );
  }
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
