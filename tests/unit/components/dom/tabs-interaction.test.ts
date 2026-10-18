/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/tabs-interaction.test.ts
 * @description Real DOM interaction tests for the Tabs primitive.
 *
 * ### Features:
 * - click selects a tab and fires `onTabChange`
 * - ArrowLeft/ArrowRight/Home/End move selection
 * - `aria-selected` / `tabindex` follow the active tab
 */

import { describe, expect, it, vi } from "vitest";
import Tabs from "@src/components/ui/tabs.svelte";
import { click, press, renderComponent } from "./render";

const TABS = [
  { id: "identity", label: "Identity" },
  { id: "sessions", label: "Sessions" },
  { id: "tokens", label: "Tokens" },
];

describe("Tabs (client interaction)", () => {
  it("selects a tab on click and fires onTabChange", async () => {
    const onTabChange = vi.fn();
    const { target, cleanup } = renderComponent(Tabs, {
      tabs: TABS,
      activeTab: "identity",
      onTabChange,
    });

    try {
      const sessions = target.querySelector("[data-testid='tab-sessions']");
      expect(sessions).toHaveAttribute("aria-selected", "false");

      await click(sessions);

      expect(sessions).toHaveAttribute("aria-selected", "true");
      expect(target.querySelector("[data-testid='tab-identity']")).toHaveAttribute(
        "aria-selected",
        "false",
      );
      expect(sessions).toHaveAttribute("tabindex", "0");
      expect(onTabChange).toHaveBeenCalledWith("sessions");
    } finally {
      cleanup();
    }
  });

  it("moves selection with ArrowRight / ArrowLeft and wraps", async () => {
    const onTabChange = vi.fn();
    const { target, cleanup } = renderComponent(Tabs, {
      tabs: TABS,
      activeTab: "identity",
      onTabChange,
    });

    try {
      const identity = target.querySelector("[data-testid='tab-identity']");
      await press(identity, "ArrowRight");
      expect(onTabChange).toHaveBeenLastCalledWith("sessions");

      const sessions = target.querySelector("[data-testid='tab-sessions']");
      await press(sessions, "ArrowLeft");
      expect(onTabChange).toHaveBeenLastCalledWith("identity");

      const tokens = target.querySelector("[data-testid='tab-tokens']");
      await press(tokens, "Home");
      expect(onTabChange).toHaveBeenLastCalledWith("identity");

      await press(tokens, "End");
      expect(onTabChange).toHaveBeenLastCalledWith("tokens");
    } finally {
      cleanup();
    }
  });

  it("exposes an accessible tablist and selected tab", () => {
    const { target, cleanup } = renderComponent(Tabs, {
      tabs: TABS,
      activeTab: "tokens",
      ariaLabel: "User sections",
    });

    try {
      const tablist = target.querySelector("[role=tablist]");
      expect(tablist).toHaveAccessibleName("User sections");
      expect(target.querySelector("[data-testid='tab-tokens']")).toHaveAttribute(
        "aria-selected",
        "true",
      );
    } finally {
      cleanup();
    }
  });
});
