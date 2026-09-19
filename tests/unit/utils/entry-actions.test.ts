/**
 * @file tests/unit/utils/entry-actions.test.ts
 * @description Unit tests for centralized entry-actions (bulkEditEntries, setEntriesStatus).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @src/stores/collection-store.svelte.ts
vi.mock("@src/stores/collection-store.svelte.ts", () => {
  return {
    collections: {
      active: { _id: "posts_coll" },
    },
    setCollectionValue: vi.fn(),
    setMode: vi.fn(),
  };
});

// Mock @src/stores/toast.svelte.ts
vi.mock("@src/stores/toast.svelte.ts", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @src/stores/global-settings.svelte
vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: {
    USE_ARCHIVE_ON_DELETE: true,
  },
}));

// Mock @src/paraglide/messages
vi.mock("@src/paraglide/messages", () => ({
  button_archive: () => "Archive",
  button_cancel: () => "Cancel",
  button_confirm: () => "Confirm",
  button_delete: () => "Delete",
  button_test: () => "Test",
  changes_saved_as_draft: () => "Draft saved",
  delete_failed: () => "Delete failed",
  entries_archived: ({ count }: { count: number }) => `${count} entries archived`,
  entries_cloned: ({ count }: { count: number }) => `${count} entries cloned`,
  entries_deleted: ({ count }: { count: number }) => `${count} entries deleted`,
  entries_published: ({ count }: { count: number }) => `${count} entries published`,
  entries_scheduled: () => "Scheduled",
  entries_set_to_test: () => "Test",
  entries_unpublished: ({ count }: { count: number }) => `${count} entries unpublished`,
  entries_updated: ({ count }: { count: number }) => `${count} entries updated`,
  entry_archived: () => "Archived",
  entry_cloned_success: () => "Cloned",
  entry_deleted_success: () => "Deleted",
  entry_saved: () => "Saved",
  entry_scheduled: () => "Scheduled",
  entry_scheduled_status: () => "Scheduled status",
  entry_status_updated: () => "Status updated",
  entrylist_multibutton_clone: () => "Clone",
  entrylist_multibutton_publish: () => "Publish",
  entrylist_multibutton_schedule: () => "Schedule",
  entrylist_multibutton_unpublish: () => "Unpublish",
  error_saving_draft: () => "Error saving draft",
  error_scheduling: () => "Error scheduling",
  no_collection_found: () => "No collection",
  no_entries_selected: () => "No entries",
  no_entry_for_scheduling: () => "No entry",
  only_admins_can_delete: () => "Only admins",
  save_as_draft_and_leave: () => "Save and leave",
  status_reserved_for_system: () => "Reserved",
  stay_and_continue_editing: () => "Stay",
  unsaved_changes_body: () => "Unsaved body",
  unsaved_changes_title: () => "Unsaved title",
  update_failed: () => "Update failed",
  clone_entry_error: () => "Clone error",
  clone_entry_no_selection_error: () => "No selection",
  delete_entry_error: () => "Delete error",
  delete_entry_no_selection_error: () => "No selection",
  set_status_error: () => "Set status error",
  set_status_no_selection_error: () => "No selection",
}));

// Mock @utils/modal.svelte
vi.mock("@utils/modal.svelte", () => ({
  showCloneModal: vi.fn(),
  showConfirm: vi.fn(),
  showScheduleModal: vi.fn(),
}));

// Mock api
vi.mock("@src/utils/api", () => ({
  batchUpdateEntries: vi.fn(),
  batchDeleteEntries: vi.fn(),
  createClones: vi.fn(),
  createEntry: vi.fn(),
  deleteEntry: vi.fn(),
  invalidateCollectionCache: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryStatus: vi.fn(),
}));

import { bulkEditEntries, deleteEntries, setEntriesStatus } from "@src/utils/entry-actions";
import { batchDeleteEntries, batchUpdateEntries, deleteEntry } from "@src/utils/api";
import { toast } from "@src/stores/toast.svelte.ts";
import { collections } from "@src/stores/collection-store.svelte.ts";
import { publicEnv } from "@src/stores/global-settings.svelte";

describe("entry-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collections.active = { _id: "posts_coll" } as any;
    publicEnv.USE_ARCHIVE_ON_DELETE = true;
  });

  describe("bulkEditEntries", () => {
    it("does nothing when entryIds is empty", async () => {
      const onSuccess = vi.fn();
      await bulkEditEntries([], { title: "New Title" }, onSuccess);

      expect(batchUpdateEntries).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("does nothing when collections.active has no _id", async () => {
      collections.active = null as any;
      const onSuccess = vi.fn();
      await bulkEditEntries(["entry_1"], { title: "New Title" }, onSuccess);

      expect(batchUpdateEntries).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("calls batchUpdateEntries and triggers onSuccess with success toast", async () => {
      vi.mocked(batchUpdateEntries).mockResolvedValue({ success: true } as any);
      const onSuccess = vi.fn();

      await bulkEditEntries(["entry_1", "entry_2"], { status: "draft", priority: 5 }, onSuccess);

      expect(batchUpdateEntries).toHaveBeenCalledWith("posts_coll", {
        ids: ["entry_1", "entry_2"],
        data: { status: "draft", priority: 5 },
      });
      expect(toast.success).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "2 entries updated successfully",
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it("shows error toast on batch update failure", async () => {
      vi.mocked(batchUpdateEntries).mockResolvedValue({
        success: false,
        error: "Permission denied",
      } as any);
      const onSuccess = vi.fn();

      await bulkEditEntries(["entry_1"], { title: "Fail" }, onSuccess);

      expect(toast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Permission denied",
        }),
      );
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("setEntriesStatus", () => {
    it("calls batchUpdateEntries and displays success toast", async () => {
      vi.mocked(batchUpdateEntries).mockResolvedValue({ success: true } as any);
      const onSuccess = vi.fn();

      await setEntriesStatus(["entry_1", "entry_2"], "publish" as any, onSuccess);

      expect(batchUpdateEntries).toHaveBeenCalledWith("posts_coll", {
        ids: ["entry_1", "entry_2"],
        status: "publish",
      });
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it("handles failure with error toast", async () => {
      vi.mocked(batchUpdateEntries).mockResolvedValue({
        success: false,
        error: "Network failure",
      } as any);
      const onSuccess = vi.fn();

      await setEntriesStatus(["entry_1"], "archive" as any, onSuccess);

      expect(toast.error).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Network failure",
        }),
      );
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("deleteEntries", () => {
    it("archives entries when USE_ARCHIVE_ON_DELETE is true and isPermanentDelete is false", async () => {
      publicEnv.USE_ARCHIVE_ON_DELETE = true;
      vi.mocked(batchUpdateEntries).mockResolvedValue({ success: true } as any);
      const onSuccess = vi.fn();

      await deleteEntries(["e1", "e2"], false, onSuccess);

      expect(batchUpdateEntries).toHaveBeenCalledWith("posts_coll", {
        ids: ["e1", "e2"],
        status: "archive",
      });
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it("batch deletes entries when isPermanentDelete is true", async () => {
      vi.mocked(batchDeleteEntries).mockResolvedValue({ success: true } as any);
      const onSuccess = vi.fn();

      await deleteEntries(["e1", "e2"], true, onSuccess);

      expect(batchDeleteEntries).toHaveBeenCalledWith("posts_coll", ["e1", "e2"]);
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    it("falls back to individual deletes if batch delete throws", async () => {
      vi.mocked(batchDeleteEntries).mockRejectedValue(new Error("Batch failed"));
      vi.mocked(deleteEntry).mockResolvedValue({ success: true } as any);
      const onSuccess = vi.fn();

      await deleteEntries(["e1", "e2"], true, onSuccess);

      expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "e1");
      expect(deleteEntry).toHaveBeenCalledWith("posts_coll", "e2");
      expect(toast.success).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
