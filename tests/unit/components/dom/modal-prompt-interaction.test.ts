/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/modal-prompt-interaction.test.ts
 * @description Real DOM interaction tests for ModalPrompt.
 *
 * This is the component behind the media-gallery "new folder" flow, where an
 * E2E race was previously blamed on a missing hydrated listener. These tests
 * prove the confirm/cancel/submit paths and lock the deterministic testids the
 * browser suite targets.
 *
 * ### Features:
 * - typing + Confirm returns the entered value
 * - Cancel returns null
 * - native form submit (Enter) returns the entered value
 * - stable `data-testid` anchors for E2E
 */

import { describe, expect, it, vi } from "vitest";
import ModalPrompt from "@src/components/modal-prompt.svelte";
import { click, renderComponent, typeText } from "./render";

describe("ModalPrompt (client interaction)", () => {
  it("returns the entered value when Confirm is clicked", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalPrompt, {
      body: "Enter a name for the new folder:",
      value: "",
      close,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("[data-testid='modal-prompt-input']");
      expect(input).toBeInTheDocument();

      await typeText(input, "Campaign assets");
      await click(target.querySelector("[data-testid='modal-prompt-confirm']"));

      expect(close).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledWith("Campaign assets");
    } finally {
      cleanup();
    }
  });

  it("returns null when Cancel is clicked", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalPrompt, {
      body: "Enter a name",
      value: "keep me",
      close,
    });

    try {
      await click(target.querySelector("[data-testid='modal-prompt-cancel']"));
      expect(close).toHaveBeenCalledWith(null);
    } finally {
      cleanup();
    }
  });

  it("returns the entered value on form submit (Enter)", async () => {
    const close = vi.fn();
    const { target, cleanup } = renderComponent(ModalPrompt, {
      body: "Enter a name",
      value: "",
      close,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("[data-testid='modal-prompt-input']");
      await typeText(input, "Submitted");

      const form = target.querySelector("form");
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      expect(close).toHaveBeenCalledWith("Submitted");
    } finally {
      cleanup();
    }
  });

  it("exposes the prompt body as text", async () => {
    const { target, cleanup } = renderComponent(ModalPrompt, {
      body: "Delete this folder?",
      value: "",
    });

    try {
      // Sanitize renders asynchronously (DOMPurify import); the loading shell is
      // present first, then the sanitized body replaces it.
      await vi.waitFor(() => expect(target).toHaveTextContent("Delete this folder?"));
      expect(target.querySelector("[data-sanitized]")).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
