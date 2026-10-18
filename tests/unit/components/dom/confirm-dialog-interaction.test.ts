/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/confirm-dialog-interaction.test.ts
 * @description Real DOM tests for the shared ConfirmDialog used by admin
 * destructive actions (user delete, media delete, job delete).
 *
 * ### Features:
 * - Confirm returns `true`
 * - Cancel returns `false`
 * - stable `modal-confirm` / `modal-cancel` testids
 */

import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "@src/components/system/confirm-dialog.svelte";
import { click, renderComponent } from "./render";

describe("ConfirmDialog (client interaction)", () => {
  it("returns true when Confirm is clicked", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ConfirmDialog, {
      body: "Delete this user?",
      close,
    });

    try {
      const confirm = target.querySelector("[data-testid='modal-confirm']");
      expect(confirm).toBeInTheDocument();
      await vi.waitFor(() => expect(target).toHaveTextContent("Delete this user?"));

      await click(confirm);
      expect(close).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith(true);
    } finally {
      cleanup();
    }
  });

  it("returns false when Cancel is clicked", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ConfirmDialog, {
      body: "Delete this user?",
      buttonTextConfirm: "Yes, delete",
      buttonTextCancel: "Keep",
      close,
    });

    try {
      const cancel = target.querySelector("[data-testid='modal-cancel']");
      expect(cancel).toHaveTextContent("Keep");
      expect(target.querySelector("[data-testid='modal-confirm']")).toHaveTextContent(
        "Yes, delete",
      );

      await click(cancel);
      expect(close).toHaveBeenCalledWith(false);
    } finally {
      cleanup();
    }
  });

  it("omits the cancel button when no cancel label is configured", () => {
    const { target, cleanup } = renderComponent(ConfirmDialog, {
      body: "Continue?",
      buttonTextCancel: "",
    });

    try {
      expect(target.querySelector("[data-testid='modal-cancel']")).not.toBeInTheDocument();
      expect(target.querySelector("[data-testid='modal-confirm']")).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
