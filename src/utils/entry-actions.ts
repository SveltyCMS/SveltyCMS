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
import { showCloneModal, showConfirm } from "@utils/modal.svelte";
import {
  batchDeleteEntries,
  batchUpdateEntries,
  createClones,
  createEntry,
  deleteEntry,
  invalidateCollectionCache,
  updateEntry,
  updateEntryStatus,
} from "./api";
import { entryMessages } from "./entry-actions-messages";
import { logger } from "./logger";

// Helper function to update entry status
async function updateStatus(collectionId: string, entryId: string, status: string) {
  const result = await updateEntryStatus(collectionId, entryId, status);
  if (!result.success) {
    throw new Error(result.error || "Failed to update status");
  }
  return result;
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

// Deletes or archives one or more entries with improved batch delete
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

  const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE && !isPermanentDelete;

  try {
    if (isArchiving) {
      // Archive entries by updating their status to 'archive'
      const result = await batchUpdateEntries(collId, {
        ids: entryIds,
        status: StatusTypes.archive,
      });
      if (result.success) {
        toast.success({
          description: entryMessages.entriesArchived(entryIds.length),
        });
        onSuccess();
      } else {
        toast.error({
          description: result.error || entryMessages.updateFailed(StatusTypes.archive),
        });
      }
    } else {
      // Use batch delete API if available, fallback to individual deletes
      try {
        const result = await batchDeleteEntries(collId, entryIds);
        if (result.success) {
          toast.success({
            description: entryMessages.entriesDeleted(entryIds.length),
          });
          onSuccess();
        } else {
          // Fallback to individual deletes if batch delete fails
          throw new Error("Batch delete not supported, falling back to individual deletes");
        }
      } catch (batchError) {
        // Fallback: delete entries one by one
        logger.warn("Batch delete failed, using chunked individual deletes:", batchError);
        // Chunk processing to avoid rate-limiting on massive selections
        const chunkSize = 10;
        for (let i = 0; i < entryIds.length; i += chunkSize) {
          const chunk = entryIds.slice(i, i + chunkSize);
          await Promise.all(chunk.map((entryId) => deleteEntry(collId, entryId)));
        }
        toast.success({
          description: entryMessages.entriesDeleted(entryIds.length),
        });
        onSuccess();
      }
    }
  } catch (e) {
    toast.error(
      `${entryMessages.deleteFailed(isArchiving ? StatusTypes.archive : StatusTypes.delete)}: ${(e as Error).message}`,
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

// Deletes the currently active entry after confirmation
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
  const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

  // Determine what options to show based on rules
  if (!useArchiving) {
    // USE_ARCHIVE_ON_DELETE: false - Always delete directly
    showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete);
  } else if (isArchived) {
    // Archived entry - only admins can permanently delete
    if (isAdmin) {
      showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete);
    } else {
      toast.warning("Only administrators can delete archived entries.");
    }
  } else {
    // Active entry (draft, clone, publish, unpublish, test)
    if (isAdmin) {
      // Admin can choose: show both options in one modal
      showAdminChoiceModal(collectionId, entryId);
    } else {
      // Non-admin can only archive
      showDeleteConfirmationModal(collectionId, entryId, StatusTypes.archive);
    }
  }
}

// Helper function to show admin choice modal (Archive or Delete options)
function showAdminChoiceModal(collectionId: string, entryId: string) {
  // First show archive option with Cancel leading to delete option
  showConfirm({
    title: "Archive Entry",
    body: `
			<div class="space-y-3">
				<p>Do you want to <strong class="text-warning-600">archive</strong> this entry?</p>
				<p class="text-sm text-surface-600 dark:text-surface-50">Archived entries are hidden from view but kept in the database and can be restored later.</p>
			</div>
		`,
    confirmText: "Archive",
    cancelText: "Show Delete Option",
    onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, StatusTypes.archive),
    onCancel: () =>
      void showConfirm({
        title: "Delete Entry Permanently",
        body: `
					<div class="space-y-3">
						<p>Do you want to <strong class="text-error-600">permanently delete</strong> this entry?</p>
						<p class="text-sm text-surface-600 dark:text-surface-50">This will completely remove the entry from the database. This action cannot be undone.</p>
					</div>
				`,
        confirmText: "Delete Permanently",
        onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete),
      }),
  });
}

// Helper function to show final confirmation modal
function showDeleteConfirmationModal(
  collectionId: string,
  entryId: string,
  action: typeof StatusTypes.archive | typeof StatusTypes.delete,
) {
  const isArchive = action === StatusTypes.archive;
  showConfirm({
    title: `Please Confirm <span class="text-error-500 font-bold">${isArchive ? "Archiving" : "Deletion"}</span>`,
    body: isArchive
      ? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
      : `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.`,
    confirmText: isArchive ? "Archive" : "Delete",
    cancelText: button_cancel(),
    onConfirm: async () => {
      try {
        if (isArchive) {
          await updateStatus(collectionId, entryId, StatusTypes.archive);
          setCollectionValue({
            ...collections.activeValue,
            status: StatusTypes.archive,
          });
          toast.success("Entry archived successfully.");
        } else {
          await deleteEntry(collectionId, entryId);
          toast.success({ description: entry_deleted_success() });
        }
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
