/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/dropdown-interaction.test.ts
 * @description Real DOM tests for the Dropdown menu primitive.
 *
 * Covers the interaction that E2E previously forced: open the menu from a
 * trigger, select an option, and receive the value. Also covers disabled
 * options and search filtering.
 *
 * ### Features:
 * - trigger click opens the portaled menu
 * - option click fires `onchange` and closes
 * - disabled options cannot be selected
 * - searchable mode filters options
 */

import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dropdown from "@src/components/ui/dropdown.svelte";
import { click, renderComponent, typeText } from "./render";

const trigger = createRawSnippet(() => ({ render: () => "<span>Open status menu</span>" }));

const options = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived", disabled: true },
];

function optionButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
    options.some((option) => button.textContent?.trim() === option.label),
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("Dropdown (client interaction)", () => {
  it("opens from the trigger and selects an option", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Dropdown, {
      options,
      onchange,
      trigger,
    });

    try {
      const triggerEl = target.querySelector("[role=button]");
      expect(triggerEl).toBeInTheDocument();
      await click(triggerEl);

      const published = optionButtons().find((button) => button.textContent?.includes("Published"));
      expect(published).toBeInTheDocument();
      await click(published);

      expect(onchange).toHaveBeenCalledTimes(1);
      expect(onchange).toHaveBeenCalledWith("published");
      expect(optionButtons().length).toBe(0); // closeOnSelect default
    } finally {
      cleanup();
    }
  });

  it("does not select a disabled option", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Dropdown, {
      options,
      onchange,
      trigger,
    });

    try {
      await click(target.querySelector("[role=button]"));

      const archived = optionButtons().find((button) => button.textContent?.includes("Archived"));
      expect(archived).toBeDisabled();
      await click(archived);

      expect(onchange).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("filters options in searchable mode", async () => {
    const { target, cleanup } = renderComponent(Dropdown, {
      options,
      searchable: true,
      trigger,
    });

    try {
      await click(target.querySelector("[role=button]"));

      const search = document.querySelector<HTMLInputElement>("input[placeholder='Search...']");
      expect(search).toBeInTheDocument();

      await typeText(search, "pub");

      const labels = optionButtons().map((button) => button.textContent?.trim());
      expect(labels).toEqual(["Published"]);
    } finally {
      cleanup();
    }
  });
});
