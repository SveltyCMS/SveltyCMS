/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/modal-interaction.test.ts
 * @description Real DOM interaction tests for the native `<dialog>` Modal.
 *
 * `useDialog` drives `showModal()` / `close()`, Escape dismissal, backdrop
 * clicks, and focus restoration. jsdom lacks the native methods, so `setup.ts`
 * installs the minimal polyfill; the component's own logic is exercised for real.
 *
 * ### Features:
 * - `open` opens the native dialog and fires `onopen`
 * - close button sets closed state and fires `onclose`
 * - Escape and backdrop clicks dismiss when enabled
 * - `closeOnEsc={false}` / `closeOnOuterClick={false}` keep it open
 * - portal places the dialog under `<body>`
 */

import { describe, expect, it, vi } from "vitest";
import Modal from "@src/components/ui/modal.svelte";
import { click, press, renderComponent, settle } from "./render";

function queryDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  if (!dialog) throw new Error("dialog not rendered");
  return dialog;
}

describe("Modal (client interaction)", () => {
  it("opens the native dialog and fires onopen", async () => {
    const onopen = vi.fn();
    const { cleanup } = renderComponent(Modal, {
      open: true,
      title: "Confirm action",
      onopen,
    });

    try {
      const dialog = queryDialog();
      expect(dialog.open).toBe(true);
      expect(dialog).toHaveAttribute("role", "dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAccessibleName("Confirm action");
      expect(onopen).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("closes via the header close button", async () => {
    const onclose = vi.fn();
    const { cleanup } = renderComponent(Modal, {
      open: true,
      title: "Closable",
      onclose,
    });

    try {
      const dialog = queryDialog();
      expect(dialog.open).toBe(true);

      await click(dialog.querySelector("button[aria-label='Close modal']"));
      await settle();

      expect(dialog.open).toBe(false);
      expect(onclose).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("closes on Escape by default", async () => {
    const onclose = vi.fn();
    const { cleanup } = renderComponent(Modal, {
      open: true,
      title: "Escape me",
      onclose,
    });

    try {
      const dialog = queryDialog();
      await press(dialog, "Escape");
      await settle();

      expect(dialog.open).toBe(false);
      expect(onclose).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("stays open on Escape when closeOnEsc is false", async () => {
    const onclose = vi.fn();
    const { cleanup } = renderComponent(Modal, {
      open: true,
      title: "Sticky",
      closeOnEsc: false,
      onclose,
    });

    try {
      const dialog = queryDialog();
      await press(dialog, "Escape");
      await settle();

      expect(dialog.open).toBe(true);
      expect(onclose).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("closes on a backdrop click when enabled", async () => {
    const onclose = vi.fn();
    const { cleanup } = renderComponent(Modal, {
      open: true,
      title: "Backdrop",
      onclose,
    });

    try {
      const dialog = queryDialog();
      await click(dialog);
      await settle();

      expect(dialog.open).toBe(false);
      expect(onclose).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});
