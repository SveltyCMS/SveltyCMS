/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/button-interaction.test.ts
 * @description Real DOM interaction tests for the native Button primitive.
 *
 * Replaces the previous SSR-only assertions (`render().not.toThrow()`) with
 * behaviour the browser actually depends on: click dispatch, disabled/loading
 * guards, anchor semantics, ARIA normalization, and attribute forwarding.
 *
 * ### Features:
 * - click → `onclick` callback fires exactly once
 * - disabled and loading states block activation
 * - `href` switches to an anchor and disabled anchors drop `href`/tab stop
 * - `aria-pressed` normalized to `"true"` / `"false"`
 * - `data-testid` and arbitrary attributes reach the native element
 */

import { describe, expect, it, vi } from "vitest";
import Button from "@src/components/ui/button.svelte";
import { click, renderComponent } from "./render";

describe("Button (client interaction)", () => {
  it("fires onclick exactly once per activation", async () => {
    const onclick = vi.fn();
    const { target, cleanup } = renderComponent(Button, {
      variant: "primary",
      onclick,
    });

    try {
      const button = target.querySelector("button");
      expect(button).toBeInTheDocument();

      await click(button);
      expect(onclick).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("does not fire onclick when disabled", async () => {
    const onclick = vi.fn();
    const { target, cleanup } = renderComponent(Button, {
      disabled: true,
      onclick,
    });

    try {
      const button = target.querySelector("button");
      expect(button).toBeDisabled();

      await click(button);
      expect(onclick).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("treats loading as disabled and renders the spinner", () => {
    const { target, cleanup } = renderComponent(Button, { loading: true });

    try {
      const button = target.querySelector("button");
      expect(button).toBeDisabled();
      expect(button?.querySelector("iconify-icon")).toHaveAttribute("icon", "mdi:loading");
    } finally {
      cleanup();
    }
  });

  it("renders an anchor when href is provided", () => {
    const { target, cleanup } = renderComponent(Button, {
      href: "/dashboard",
      children: undefined,
    });

    try {
      const link = target.querySelector("a");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/dashboard");
      expect(link).toHaveAttribute("role", "button");
      expect(target.querySelector("button")).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("removes href and the tab stop from a disabled anchor", () => {
    const { target, cleanup } = renderComponent(Button, {
      href: "/dashboard",
      disabled: true,
    });

    try {
      const link = target.querySelector("a");
      expect(link).not.toHaveAttribute("href");
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).toHaveAttribute("tabindex", "-1");
    } finally {
      cleanup();
    }
  });

  it("normalizes aria-pressed and omits it when unset", () => {
    const pressed = renderComponent(Button, { "aria-pressed": true });
    const unpressed = renderComponent(Button, { "aria-pressed": false });
    const absent = renderComponent(Button, {});

    try {
      expect(pressed.target.querySelector("button")).toHaveAttribute("aria-pressed", "true");
      expect(unpressed.target.querySelector("button")).toHaveAttribute("aria-pressed", "false");
      expect(absent.target.querySelector("button")).not.toHaveAttribute("aria-pressed");
    } finally {
      pressed.cleanup();
      unpressed.cleanup();
      absent.cleanup();
    }
  });

  it("forwards data-testid and arbitrary attributes to the native element", () => {
    const { target, cleanup } = renderComponent(Button, {
      "data-testid": "primary-action",
      name: "save",
      "aria-label": "Save changes",
    });

    try {
      const button = target.querySelector("button");
      expect(button).toHaveAttribute("data-testid", "primary-action");
      expect(button).toHaveAttribute("name", "save");
      expect(button).toHaveAccessibleName("Save changes");
    } finally {
      cleanup();
    }
  });

  it("keeps type=button as the default so it cannot submit a form accidentally", () => {
    const { target, cleanup } = renderComponent(Button, {});

    try {
      expect(target.querySelector("button")).toHaveAttribute("type", "button");
    } finally {
      cleanup();
    }
  });
});
