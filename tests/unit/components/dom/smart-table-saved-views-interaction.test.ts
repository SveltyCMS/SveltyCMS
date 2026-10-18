/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/smart-table-saved-views-interaction.test.ts
 * @description Real DOM tests for the SmartTable saved-views menu.
 *
 * This is the menu mounted in every SmartTable toolbar. It previously had no
 * interaction coverage beyond E2E shell checks.
 *
 * ### Features:
 * - trigger opens the menu
 * - save current view persists and renders the new entry
 * - applying an entry calls `onApply` with the saved view
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import SavedViewsMenu from "@src/components/ui/smart-table/smart-table-saved-views-menu.svelte";
import { click, renderComponent, typeText } from "./render";

afterEach(() => {
  localStorage.clear();
});

function menuItemNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find((item) =>
    item.textContent?.includes(name),
  );
}

describe("SmartTable saved views (client interaction)", () => {
  it("saves the current snapshot and applies it", async () => {
    const onApply = vi.fn();
    const getSnapshot = vi.fn(() => ({
      filters: { status: "draft" },
      search: "smoke",
      pageSize: 25,
    }));

    const { target, cleanup } = renderComponent(SavedViewsMenu, {
      scope: "dom-test-scope",
      getSnapshot,
      onApply,
    });

    try {
      const trigger = target.querySelector<HTMLButtonElement>(
        "button[aria-label='Saved table views']",
      );
      expect(trigger).toBeInTheDocument();
      await click(trigger);

      expect(document.querySelector("[role=menu][aria-label='Saved views']")).toBeInTheDocument();

      const input = document.querySelector<HTMLInputElement>("input[aria-label='New view name']");
      await typeText(input, "Draft only");

      const save = document.querySelector<HTMLButtonElement>(
        "button[aria-label='Save current view']",
      );
      await click(save);

      await vi.waitFor(() => expect(menuItemNamed("Draft only")).toBeInTheDocument());
      expect(getSnapshot).toHaveBeenCalled();

      await click(menuItemNamed("Draft only"));

      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Draft only",
          filters: { status: "draft" },
          search: "smoke",
          pageSize: 25,
        }),
      );
      expect(
        document.querySelector("[role=menu][aria-label='Saved views']"),
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("closes the menu from the Close button", async () => {
    const { target, cleanup } = renderComponent(SavedViewsMenu, {
      scope: "dom-test-close",
      getSnapshot: () => ({}),
      onApply: vi.fn(),
    });

    try {
      await click(target.querySelector("button[aria-label='Saved table views']"));
      expect(document.querySelector("[role=menu][aria-label='Saved views']")).toBeInTheDocument();

      const close = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Close",
      );
      await click(close);

      expect(
        document.querySelector("[role=menu][aria-label='Saved views']"),
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
