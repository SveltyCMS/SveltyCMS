/**
 * @file tests/unit/utils/delete-entry-trash-flow.test.ts
 * @description Delete behaviour for BUG M3 (editor) and BUG M5 (list).
 *
 * M3: Delete in the entry editor opens exactly ONE confirmation and issues no request
 *     until the user confirms; cancelling issues none and opens no second dialog.
 * M5: Delete in the list moves the rows to the Trash (soft delete) with a single batch
 *     request — never `status: "archive"`, never one request per row. Schemas that set
 *     `disableBulkDelete` (batch endpoint → 403 BULK_DELETE_DISABLED) fall back to the
 *     per-row route for that selection instead of deleting nothing.
 *
 * The real modal state machine is used on purpose: the recursion bug lived in the
 * interaction between `showConfirm` and `modalState.close/trigger`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/stores/collection-store.svelte.ts", () => ({
  collections: {
    active: { _id: "posts_coll" },
    activeValue: { _id: "entry_1", status: "draft" },
  },
  setCollectionValue: vi.fn(),
  setMode: vi.fn(),
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: { USE_ARCHIVE_ON_DELETE: true },
}));

vi.mock("@src/paraglide/messages", () => ({
  button_archive: () => "Archive",
  button_cancel: () => "Cancel",
  button_confirm: () => "Confirm",
  button_delete: () => "Delete",
  button_test: () => "Test",
  changes_saved_as_draft: () => "Draft saved",
  clone_entry_error: () => "Clone error",
  clone_entry_no_selection_error: () => "No selection",
  delete_entry_error: ({ error }: { error: string }) => `Delete error: ${error}`,
  delete_entry_no_selection_error: () => "No selection",
  delete_failed: ({ operation }: { operation: string }) => `Failed to ${operation}`,
  entries_archived: ({ count }: { count: number }) => `${count} entries archived`,
  entries_cloned: ({ count }: { count: number }) => `${count} entries cloned`,
  entries_deleted: ({ count }: { count: number }) => `${count} entries deleted`,
  entries_published: ({ count }: { count: number }) => `${count} entries published`,
  entries_scheduled: () => "Scheduled",
  entries_set_to_test: () => "Test",
  entries_unpublished: ({ count }: { count: number }) => `${count} entries unpublished`,
  entries_updated: ({ count, status }: { count: number; status: string }) =>
    `${count} entries updated to ${status}`,
  entry_archived: () => "Archived",
  entry_cloned_success: () => "Cloned",
  entry_deleted_success: () => "Deleted",
  entry_saved: () => "Saved",
  entry_scheduled: () => "Scheduled",
  entry_scheduled_status: () => "Scheduled status",
  entry_status_updated: ({ status }: { status: string }) => `Status ${status}`,
  entrylist_multibutton_clone: () => "Clone",
  entrylist_multibutton_publish: () => "Publish",
  entrylist_multibutton_schedule: () => "Schedule",
  entrylist_multibutton_unpublish: () => "Unpublish",
  error_saving_draft: () => "Error saving draft",
  error_scheduling: () => "Error scheduling",
  no_collection_found: () => "No collection",
  no_entries_selected: () => "No entries",
  no_entry_for_scheduling: () => "No entry",
  only_admins_can_delete: () => "Only administrators can delete archived entries",
  save_as_draft_and_leave: () => "Save and leave",
  status_reserved_for_system: ({ status }: { status: string }) => `${status} reserved`,
  stay_and_continue_editing: () => "Stay",
  unsaved_changes_body: () => "Unsaved body",
  unsaved_changes_title: () => "Unsaved title",
  update_failed: ({ operation }: { operation: string }) => `Failed to ${operation}`,
}));

vi.mock("@src/utils/api", () => ({
  batchDeleteEntries: vi.fn(),
  batchUpdateEntries: vi.fn(),
  createClones: vi.fn(),
  createEntry: vi.fn(),
  deleteEntry: vi.fn(),
  invalidateCollectionCache: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryStatus: vi.fn(),
}));

import { deleteCurrentEntry, deleteEntries } from "@src/utils/entry-actions";
import { batchDeleteEntries, batchUpdateEntries, deleteEntry } from "@src/utils/api";
import { modalState } from "@src/utils/modal.svelte";
import { collections } from "@src/stores/collection-store.svelte.ts";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { toast } from "@src/stores/toast.svelte.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("editor Delete (M3)", () => {
  beforeEach(() => {
    modalState.clear();
    vi.clearAllMocks();
    (collections as any).active = { _id: "posts_coll" };
    (collections as any).activeValue = { _id: "entry_1", status: "draft" };
    publicEnv.USE_ARCHIVE_ON_DELETE = true;
    vi.mocked(deleteEntry).mockResolvedValue({ success: true } as any);
  });

  it("opens exactly one confirmation and issues no request until the user confirms", async () => {
    await deleteCurrentEntry(true);

    expect(modalState.isOpen).toBe(true);
    expect(modalState.active?.props?.htmlTitle).toBe("Move Entry to Trash");
    expect(modalState.active?.props?.buttonTextConfirm).toBe("Move to Trash");
    // 0 requests while only the dialog is open.
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(batchDeleteEntries).not.toHaveBeenCalled();
    expect(batchUpdateEntries).not.toHaveBeenCalled();

    // Confirm → one soft delete (Trash), no status update.
    modalState.close(true);
    await flush();

    expect(deleteEntry).toHaveBeenCalledTimes(1);
    expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "entry_1", { permanent: false });
    expect(batchUpdateEntries).not.toHaveBeenCalled();
    expect(modalState.isOpen).toBe(false);
  });

  it("issues no request and opens no second dialog when cancelled", async () => {
    await deleteCurrentEntry(true);
    modalState.close(false);
    await flush();

    expect(deleteEntry).not.toHaveBeenCalled();
    expect(batchDeleteEntries).not.toHaveBeenCalled();
    expect(batchUpdateEntries).not.toHaveBeenCalled();
    expect(modalState.isOpen).toBe(false);
  });

  it("archived entries are deleted permanently by an admin", async () => {
    (collections as any).activeValue = { _id: "entry_1", status: "archive" };
    await deleteCurrentEntry(true);

    expect(modalState.active?.props?.buttonTextConfirm).toBe("Delete Permanently");
    modalState.close(true);
    await flush();
    expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "entry_1", { permanent: true });
  });

  it("archived entries stay admin-only", async () => {
    (collections as any).activeValue = { _id: "entry_1", status: "archive" };
    await deleteCurrentEntry(false);

    expect(modalState.isOpen).toBe(false);
    expect(toast.warning).toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("deletes permanently when archive-on-delete is off", async () => {
    publicEnv.USE_ARCHIVE_ON_DELETE = false;
    await deleteCurrentEntry(true);

    expect(modalState.active?.props?.buttonTextConfirm).toBe("Delete Permanently");
    modalState.close(true);
    await flush();
    expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "entry_1", { permanent: true });
  });
});

describe("list Delete (M5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (collections as any).active = { _id: "posts_coll" };
    publicEnv.USE_ARCHIVE_ON_DELETE = true;
    vi.mocked(batchDeleteEntries).mockResolvedValue({ success: true } as any);
  });

  it("moves a selection to the Trash with ONE request", async () => {
    const onSuccess = vi.fn();
    await deleteEntries(["e1", "e2"], false, onSuccess);

    expect(batchDeleteEntries).toHaveBeenCalledTimes(1);
    expect(batchDeleteEntries).toHaveBeenCalledWith("posts_coll", ["e1", "e2"], {
      permanent: false,
    });
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(batchUpdateEntries).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("deletes permanently only when asked to", async () => {
    await deleteEntries(["e1", "e2"], true, vi.fn());

    expect(batchDeleteEntries).toHaveBeenCalledTimes(1);
    expect(batchDeleteEntries).toHaveBeenCalledWith("posts_coll", ["e1", "e2"], {
      permanent: true,
    });
    expect(batchUpdateEntries).not.toHaveBeenCalled();
  });

  it("reports a failed batch delete without falling back to one request per row", async () => {
    vi.mocked(batchDeleteEntries).mockResolvedValue({ success: false, error: "Denied" } as any);
    const onSuccess = vi.fn();

    await deleteEntries(["e1", "e2"], false, onSuccess);

    // A forbidden/failed batch is NOT an invitation to fire n more requests.
    expect(batchDeleteEntries).toHaveBeenCalledTimes(1);
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ description: "Denied" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sends a single-row selection through the single-entry route (1 request)", async () => {
    vi.mocked(deleteEntry).mockResolvedValue({ success: true } as any);
    const onSuccess = vi.fn();

    await deleteEntries(["e1"], false, onSuccess);

    expect(deleteEntry).toHaveBeenCalledTimes(1);
    expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "e1", { permanent: false });
    expect(batchDeleteEntries).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  // BUG M3/M5 regression: schemas with `disableBulkDelete` answer the batch endpoint with
  // 403 BULK_DELETE_DISABLED. The switch forbids the BATCH route, not deletion, so the
  // selection has to fall back to the per-row route the same schema still allows.
  it("falls back to per-row deletes when the schema disables bulk delete", async () => {
    vi.mocked(batchDeleteEntries).mockResolvedValue({
      success: false,
      code: "BULK_DELETE_DISABLED",
      error: 'Bulk delete is disabled for collection "posts". Use individual delete instead.',
    } as any);
    vi.mocked(deleteEntry).mockResolvedValue({ success: true } as any);
    const onSuccess = vi.fn();

    await deleteEntries(["e1", "e2"], false, onSuccess);

    // 1 refused batch + one DELETE per row: both rows really reach the Trash.
    expect(batchDeleteEntries).toHaveBeenCalledTimes(1);
    expect(deleteEntry).toHaveBeenCalledTimes(2);
    expect(deleteEntry).toHaveBeenNthCalledWith(1, "posts_coll", "e1", { permanent: false });
    expect(deleteEntry).toHaveBeenNthCalledWith(2, "posts_coll", "e2", { permanent: false });
    expect(toast.success).toHaveBeenCalledWith(
      expect.objectContaining({ description: "2 entries moved to the Trash" }),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows no success toast when the per-row fallback deletes nothing", async () => {
    vi.mocked(batchDeleteEntries).mockResolvedValue({
      success: false,
      code: "BULK_DELETE_DISABLED",
    } as any);
    vi.mocked(deleteEntry).mockResolvedValue({ success: false, error: "Denied" } as any);
    const onSuccess = vi.fn();

    await deleteEntries(["e1", "e2"], false, onSuccess);

    expect(deleteEntry).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ description: "Denied" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("names only the rows that changed when the fallback partly fails", async () => {
    vi.mocked(batchDeleteEntries).mockResolvedValue({
      success: false,
      code: "BULK_DELETE_DISABLED",
    } as any);
    vi.mocked(deleteEntry)
      .mockResolvedValueOnce({ success: true } as any)
      .mockResolvedValueOnce({ success: false, error: "Denied" } as any);
    const onSuccess = vi.fn();

    await deleteEntries(["e1", "e2"], false, onSuccess);

    // 1 of 2, not "2 entries moved to the Trash".
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "1 entry moved to the Trash — 1 of 2 not deleted: Denied",
      }),
    );
    // The rows that DID go must leave the list.
    expect(onSuccess).toHaveBeenCalled();
  });
});
