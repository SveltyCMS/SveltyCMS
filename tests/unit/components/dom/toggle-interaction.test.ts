/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/toggle-interaction.test.ts
 * @description Real DOM interaction tests for the Toggle switch primitive.
 *
 * ### Features:
 * - click flips `aria-checked` and fires `onToggle`
 * - repeated clicks alternate the state
 * - disabled switch ignores clicks
 * - accessible name comes from `label` / `ariaLabel`
 */

import { describe, expect, it, vi } from "vitest";
import Toggle from "@src/components/ui/toggle.svelte";
import { click, renderComponent } from "./render";

describe("Toggle (client interaction)", () => {
  it("toggles on and off, firing onToggle with the next value", async () => {
    const onToggle = vi.fn();
    const { target, cleanup } = renderComponent(Toggle, {
      value: false,
      label: "Dark mode",
      onToggle,
    });

    try {
      const switchEl = target.querySelector<HTMLButtonElement>("[role=switch]");
      expect(switchEl).toHaveAttribute("aria-checked", "false");

      await click(switchEl);
      expect(switchEl).toHaveAttribute("aria-checked", "true");
      expect(onToggle).toHaveBeenLastCalledWith(true);

      await click(switchEl);
      expect(switchEl).toHaveAttribute("aria-checked", "false");
      expect(onToggle).toHaveBeenLastCalledWith(false);
      expect(onToggle).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  it("does not change when disabled", async () => {
    const onToggle = vi.fn();
    const { target, cleanup } = renderComponent(Toggle, {
      value: false,
      label: "Locked",
      disabled: true,
      onToggle,
    });

    try {
      const switchEl = target.querySelector<HTMLButtonElement>("[role=switch]");
      expect(switchEl).toBeDisabled();

      await click(switchEl);

      expect(switchEl).toHaveAttribute("aria-checked", "false");
      expect(onToggle).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("uses the visible label as its accessible name", () => {
    const { target, cleanup } = renderComponent(Toggle, {
      label: "Notifications",
      description: "Send me email updates",
    });

    try {
      expect(target.querySelector("[role=switch]")).toHaveAccessibleName("Notifications");
      // Description is rendered as helper text, not an accessible name.
      expect(target).toHaveTextContent("Send me email updates");
    } finally {
      cleanup();
    }
  });

  it("honors ariaLabel when there is no visible label", () => {
    const { target, cleanup } = renderComponent(Toggle, {
      ariaLabel: "Enable telemetry",
    });

    try {
      expect(target.querySelector("[role=switch]")).toHaveAccessibleName("Enable telemetry");
    } finally {
      cleanup();
    }
  });
});
