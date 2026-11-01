/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-details-alt-focus.test.ts
 * @description Regression pin for the inline alt-text editor (retest m8).
 *
 * Clicking "Add alt text…" only toggled state, so focus stayed on <body> and a
 * keyboard user had no way into the field without tabbing through the dialog.
 *
 * ### Features:
 * - clicking the alt-text control focuses the input
 * - existing alt text is selected so typing replaces it
 */

import { describe, expect, it } from "vitest";
import MediaDetailsModal from "@src/components/media/media-details-modal.svelte";
import { click, renderComponent, settle } from "./render";

function imageFile(alt = "") {
  return {
    _id: "media-1",
    filename: "photo.jpg",
    type: "image",
    mimeType: "image/jpeg",
    url: "/files/photo.jpg",
    size: 1024,
    metadata: { alt },
  };
}

describe("MediaDetailsModal — alt text focus (retest m8)", () => {
  it("moves focus into the alt input and selects the existing value", async () => {
    const rendered = renderComponent(MediaDetailsModal, {
      file: imageFile("A portrait of the author"),
    });
    try {
      const editButton = rendered.target.querySelector<HTMLButtonElement>(
        "button[aria-label='Edit alt text']",
      );
      expect(editButton).not.toBeNull();
      expect(document.activeElement).toBe(document.body);

      await click(editButton);
      await settle();

      const input = rendered.target.querySelector<HTMLInputElement>("input[aria-label='Alt text']");
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      expect(input?.value).toBe("A portrait of the author");
      expect(input?.selectionStart).toBe(0);
      expect(input?.selectionEnd).toBe("A portrait of the author".length);
    } finally {
      rendered.cleanup();
    }
  });

  it("focuses an empty alt input without throwing when there is no existing text", async () => {
    const rendered = renderComponent(MediaDetailsModal, { file: imageFile() });
    try {
      await click(
        rendered.target.querySelector<HTMLButtonElement>("button[aria-label='Edit alt text']"),
      );
      await settle();

      const input = rendered.target.querySelector<HTMLInputElement>("input[aria-label='Alt text']");
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      expect(input?.value).toBe("");
    } finally {
      rendered.cleanup();
    }
  });
});
