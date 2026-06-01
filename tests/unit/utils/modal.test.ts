import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  showModal,
  showConfirm,
  showDeleteConfirm,
  showStatusChangeConfirm,
  showScheduleModal,
  showCloneModal,
} from "@src/utils/modal.svelte";
import { modalState } from "@src/utils/modal.svelte";
import ConfirmDialog from "@components/system/confirm-dialog.svelte";
import ScheduleModal from "@components/collection-display/schedule-modal.svelte";

// Spy on modalState.trigger for assertions
modalState.trigger = vi.fn();

// Mock paraglide messages
vi.mock("@src/paraglide/messages", () => ({
  button_cancel: () => "Cancel",
  button_confirm: () => "Confirm",
}));

describe("Modal Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showModal", () => {
    it("should trigger a modal with provided settings", () => {
      const mockComponent = { ref: "MyComponent" };
      const props = { name: "test" };
      const response = vi.fn();

      showModal({ component: mockComponent, props, response });

      expect(modalState.trigger).toHaveBeenCalledWith("MyComponent", props, response);
    });

    it("should handle direct component reference", () => {
      const mockComponent = "DirectComponent";
      showModal({ component: mockComponent });
      expect(modalState.trigger).toHaveBeenCalledWith("DirectComponent", {}, undefined);
    });
  });

  describe("showConfirm", () => {
    it("should trigger ConfirmDialog with options", () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      showConfirm({
        title: "Are you sure?",
        body: "This action is permanent",
        onConfirm,
        onCancel,
      });

      expect(modalState.trigger).toHaveBeenCalledWith(
        ConfirmDialog,
        expect.objectContaining({
          htmlTitle: "Are you sure?",
          body: "This action is permanent",
          buttonTextConfirm: "Confirm",
          buttonTextCancel: "Cancel",
        }),
        expect.any(Function),
      );

      // Test the callback
      const callback = (modalState.trigger as any).mock.calls[0][2];

      callback(true);
      expect(onConfirm).toHaveBeenCalled();

      callback(false);
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("showDeleteConfirm", () => {
    it("should trigger delete confirmation with count", () => {
      const onConfirm = vi.fn();
      showDeleteConfirm({ count: 5, onConfirm });

      expect(modalState.trigger).toHaveBeenCalledWith(
        ConfirmDialog,
        {
          htmlTitle: "Delete 5 item",
          body: 'Are you sure you want to delete <span class="text-tertiary-500 dark:text-primary-500 font-bold">5 item(s)</span>?',
          buttonTextConfirm: "Delete",
          buttonTextCancel: "Cancel",
          modalClasses: "!bg-error-500/10 !border-error-500/20",
          meta: {
            buttonConfirmClasses: "variant-filled-error",
            buttonCancelClasses: "preset-outlined-surface-500",
          },
        },
        expect.any(Function),
      );
    });

    it("should support archive mode", () => {
      showDeleteConfirm({ isArchive: true, onConfirm: vi.fn() });
      expect(modalState.trigger).toHaveBeenCalledWith(
        ConfirmDialog,
        {
          htmlTitle: "Archive  item",
          body: 'Are you sure you want to archive <span class="text-tertiary-500 dark:text-primary-500 font-bold">1 item(s)</span>?',
          buttonTextConfirm: "Archive",
          buttonTextCancel: "Cancel",
          modalClasses: "!bg-warning-500/10 !border-warning-500/20",
          meta: {
            buttonConfirmClasses: "variant-filled-warning",
            buttonCancelClasses: "preset-outlined-surface-500",
          },
        },
        expect.any(Function),
      );
    });
  });

  describe("showStatusChangeConfirm", () => {
    it("should trigger status change confirmation", () => {
      showStatusChangeConfirm({ status: "published", count: 2, onConfirm: vi.fn() });
      expect(modalState.trigger).toHaveBeenCalledWith(
        ConfirmDialog,
        expect.objectContaining({
          htmlTitle: "Confirm Status Change",
          body: expect.stringContaining("published"),
          buttonTextConfirm: "Change Status",
        }),
        expect.any(Function),
      );
    });
  });

  describe("showScheduleModal", () => {
    it("should trigger ScheduleModal", () => {
      const onSchedule = vi.fn();
      showScheduleModal({ initialAction: "unpublish", onSchedule });

      expect(modalState.trigger).toHaveBeenCalledWith(
        ScheduleModal,
        { initialAction: "unpublish" },
        expect.any(Function),
      );

      const callback = (modalState.trigger as any).mock.calls[0][2];
      const testDate = new Date();
      callback({ confirmed: true, date: testDate, action: "publish" });

      expect(onSchedule).toHaveBeenCalledWith(testDate, "publish");
    });
  });

  describe("showCloneModal", () => {
    it("should trigger clone confirmation", () => {
      showCloneModal({ count: 3, onConfirm: vi.fn() });
      expect(modalState.trigger).toHaveBeenCalledWith(
        ConfirmDialog,
        expect.objectContaining({
          htmlTitle: "Clone Items",
          body: expect.stringContaining("3 item(s)"),
          buttonTextConfirm: "Clone",
        }),
        expect.any(Function),
      );
    });
  });
});
