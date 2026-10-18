/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/multibutton-interaction.test.ts
 * @description Real DOM tests for the user-management bulk Multibutton.
 *
 * The E2E suite previously had to force-click this menu because the SmartTable
 * body overlaid it. The root now carries a `z-30` stacking context; this test
 * guards both the interaction and that class.
 *
 * ### Features:
 * - disabled with no selection
 * - opens the action menu with a selection
 * - keeps a stacking context above the table (`z-30`)
 * - toggles closed from the trigger
 */

import { describe, expect, it, vi } from "vitest";
import Multibutton from "@src/routes/(app)/user/components/multibutton.svelte";
import { click, renderComponent } from "./render";

// The bulk menu imports both edit modals, which pull the server-only user
// remote module. They are not exercised here; stub them so the menu can mount
// in jsdom without dragging the server graph into the browser test.
vi.mock("@src/routes/(app)/user/components/modal-edit-form.svelte", () => ({
  default: () => null,
}));
vi.mock("@src/routes/(app)/user/components/modal-edit-token.svelte", () => ({
  default: () => null,
}));

const USER_ROW = {
  _id: "user-1",
  username: "developer",
  email: "developer@test.com",
  role: "developer",
  blocked: false,
};

describe("User Multibutton (client interaction)", () => {
  it("is disabled when no rows are selected", () => {
    const { target, cleanup } = renderComponent(Multibutton, {
      selectedRows: [],
      type: "user",
      totalUsers: 1,
      onUpdate: vi.fn(),
    });

    try {
      const menu = target.querySelector<HTMLButtonElement>(
        "[data-testid='user-bulk-actions-menu']",
      );
      expect(menu).toBeDisabled();
      expect(menu).toHaveAttribute("aria-expanded", "false");
    } finally {
      cleanup();
    }
  });

  it("opens the action menu for a selected row and stays above the table", async () => {
    const { target, cleanup } = renderComponent(Multibutton, {
      selectedRows: [USER_ROW],
      type: "user",
      totalUsers: 1,
      onUpdate: vi.fn(),
    });

    try {
      const root = target.firstElementChild;
      expect(root?.className).toContain("z-30");

      const menu = target.querySelector<HTMLButtonElement>(
        "[data-testid='user-bulk-actions-menu']",
      );
      expect(menu).toBeEnabled();
      expect(menu).toHaveAttribute("aria-expanded", "false");

      await click(menu);

      expect(menu).toHaveAttribute("aria-expanded", "true");
      const dropdown = document.querySelector("[role=menu]");
      expect(dropdown).toBeInTheDocument();
      expect(dropdown?.querySelectorAll("[role=menuitem]").length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("closes when the trigger is clicked again", async () => {
    const { target, cleanup } = renderComponent(Multibutton, {
      selectedRows: [USER_ROW],
      type: "user",
      totalUsers: 1,
      onUpdate: vi.fn(),
    });

    try {
      const menu = target.querySelector("[data-testid='user-bulk-actions-menu']");
      await click(menu);
      expect(document.querySelector("[role=menu]")).toBeInTheDocument();

      await click(menu);

      // The menu exits through `adminFade`; jsdom runs real timers, so the
      // outgoing node is only detached once the transition completes.
      await vi.waitFor(() => expect(document.querySelector("[role=menu]")).not.toBeInTheDocument());
      expect(menu).toHaveAttribute("aria-expanded", "false");
    } finally {
      cleanup();
    }
  });
});
