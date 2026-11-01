/**
 * @file tests/unit/utils/modal-state-machine.test.ts
 * @description Regression for BUG M3 — `RangeError: Maximum call stack size exceeded`.
 *
 * A confirm whose `onCancel` opened another confirm used to recurse forever:
 * `close()` fired the response handler while the modal was still `modalState.active`, the
 * handler called `showConfirm()` → `trigger()`, and `trigger()` "gracefully cancelled" that
 * same still-active response — which ran `onCancel` again.
 *
 * The rules under test:
 *  - `close()` detaches the modal before firing its response.
 *  - `trigger()` replaces the slot before cancelling the previous modal.
 *  - A cancel handler may therefore open a follow-up dialog without re-entering itself.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@src/paraglide/messages", () => ({
  button_cancel: () => "Cancel",
  button_confirm: () => "Confirm",
  entries_archived: ({ count }: { count: number }) => `${count} entries archived`,
  entries_deleted: ({ count }: { count: number }) => `${count} entries deleted`,
  entries_published: ({ count }: { count: number }) => `${count} entries published`,
  entries_unpublished: ({ count }: { count: number }) => `${count} entries unpublished`,
  entry_archived: () => "Archived",
  entry_cloned_success: () => "Cloned",
  entry_deleted_success: () => "Deleted",
  entry_saved: () => "Saved",
  entry_scheduled: () => "Scheduled",
}));

import { modalState } from "@src/utils/modal.svelte";

describe("modal state machine", () => {
  beforeEach(() => {
    modalState.clear();
  });

  it("does not recurse when a cancel handler opens a follow-up confirm", () => {
    const onCancel = vi.fn(() => {
      // Exactly what showAdminChoiceModal did: chain the next dialog from onCancel.
      void modalState.showConfirm({
        title: "Delete Entry Permanently",
        body: "Are you sure?",
      });
    });

    modalState.showConfirm({
      title: "Archive Entry",
      body: "Archive this entry?",
      confirmText: "Archive",
      cancelText: "Show Delete Option",
      onCancel,
    });
    expect(modalState.isOpen).toBe(true);

    // What ConfirmDialog's cancel button does.
    expect(() => modalState.close(false)).not.toThrow();

    // The chained dialog opened exactly once and owns the slot.
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(modalState.isOpen).toBe(true);
    expect(modalState.active?.props?.htmlTitle).toBe("Delete Entry Permanently");
  });

  it("cancels a replaced modal exactly once", () => {
    const onCancel = vi.fn();
    modalState.showConfirm({ title: "First", body: "", onCancel });
    modalState.showConfirm({ title: "Second", body: "" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(modalState.active?.props?.htmlTitle).toBe("Second");
  });

  it("resolves a confirm/cancel cycle once even when a handler re-opens a modal", async () => {
    let secondConfirm = 0;
    const first = modalState.showConfirm({
      title: "First",
      body: "",
      onCancel: () => {
        secondConfirm++;
        // Follow-up dialogs belong on the next tick; the state machine must survive
        // even a synchronous chain.
        void modalState.showConfirm({ title: "Second", body: "" });
      },
    });

    modalState.close(false);
    await expect(first).resolves.toBe(false);
    expect(secondConfirm).toBe(1);
  });
});
