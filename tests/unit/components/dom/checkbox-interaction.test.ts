/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/checkbox-interaction.test.ts
 * @description Real DOM interaction tests for the Checkbox primitive.
 *
 * The native input is `sr-only`, so users (and Playwright) activate the label.
 * These tests drive that same path and assert the callback + tri-state ARIA.
 *
 * ### Features:
 * - label click toggles checked and fires `onchange`
 * - Space key toggles via the component's keyboard handler
 * - indeterminate state exposes `aria-checked="mixed"`
 * - disabled ignores label + keyboard activation
 * - error state links `aria-invalid` / `aria-describedby` / alert text
 */

import { describe, expect, it, vi } from "vitest";
import Checkbox from "@src/components/ui/checkbox.svelte";
import { click, press, renderComponent } from "./render";

function labelWithText(target: HTMLElement, text: string): HTMLLabelElement | null {
  return (
    [...target.querySelectorAll("label")].find((label) => label.textContent?.includes(text)) ?? null
  );
}

describe("Checkbox (client interaction)", () => {
  it("toggles on label click and fires onchange", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: false,
      label: "Subscribe",
      onchange,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(input).not.toBeChecked();

      await click(labelWithText(target, "Subscribe"));

      expect(input).toBeChecked();
      expect(onchange).toHaveBeenCalledTimes(1);
      expect(onchange).toHaveBeenCalledWith(true);
    } finally {
      cleanup();
    }
  });

  it("toggles off when starting checked", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: true,
      label: "Subscribe",
      onchange,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(input).toBeChecked();

      await click(labelWithText(target, "Subscribe"));

      expect(input).not.toBeChecked();
      expect(onchange).toHaveBeenCalledWith(false);
    } finally {
      cleanup();
    }
  });

  it("exposes indeterminate as aria-checked=mixed", () => {
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: "indeterminate",
      label: "Select all",
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(input).toHaveAttribute("aria-checked", "mixed");
      expect(input).not.toBeChecked();
    } finally {
      cleanup();
    }
  });

  it("toggles with the Space key", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: false,
      label: "Keyboard",
      onchange,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");

      await press(input, " ");

      expect(input).toBeChecked();
      expect(onchange).toHaveBeenCalledWith(true);
    } finally {
      cleanup();
    }
  });

  it("ignores activation when disabled", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: false,
      label: "Disabled",
      disabled: true,
      onchange,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(input).toBeDisabled();

      await click(labelWithText(target, "Disabled"));
      await press(input, " ");

      expect(input).not.toBeChecked();
      expect(onchange).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("links the error message to the input", () => {
    const { target, cleanup } = renderComponent(Checkbox, {
      checked: false,
      label: "Terms",
      error: "You must accept the terms",
      invalid: true,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input[type=checkbox]");
      const error = target.querySelector("[role=alert]");

      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", error?.id ?? "");
      expect(error).toHaveTextContent("You must accept the terms");
    } finally {
      cleanup();
    }
  });
});
