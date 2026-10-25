/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-list-multi-button-chrome.test.ts
 * @description Split-button chrome for the entry-list bulk actions.
 *
 * Matches the `/user` bulk menu: a white divider between the action and the
 * chevron, a square end on the chevron side, and a black menu with full-size
 * labels (the labels used to render at `text-xs` with 10 px shortcuts).
 */

import { afterEach, describe, expect, it } from "vitest";
import EntryListMultiButton from "@components/collection-display/entry-list-multi-button.svelte";
import { click, renderComponent, settle, type RenderedComponent } from "./render";

const noop = () => {};

const PROPS = {
  publish: noop,
  unpublish: noop,
  draft: noop,
  schedule: noop,
  delete: noop,
  clone: noop,
  create: noop,
  hasSelections: true,
  selectedCount: 2,
} as never;

describe("Entry-list multi button chrome", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("splits the trigger with a white divider and a black dropdown segment", async () => {
    rendered = renderComponent(EntryListMultiButton, PROPS);
    await settle();

    const toggle = rendered.target.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    expect(toggle).toBeTruthy();
    // White rule on the segment's start edge, black fill, white chevron.
    expect(toggle?.className).toContain("border-s");
    expect(toggle?.className).toContain("border-white");
    expect(toggle?.className).toContain("bg-black!");
    expect(toggle?.className).toContain("text-white!");
    // `Button` writes an inline border-radius, so the square end needs `!`.
    expect(toggle?.className).toContain("rounded-none!");

    // The group owns the shape: token radius on the start, flat end.
    const group = toggle?.parentElement;
    expect(group?.className).toContain("rounded-s-(--admin-radius-button)");
    expect(group?.className).toContain("rounded-e-none");
  });

  it("opens a black menu with full-size labels", async () => {
    rendered = renderComponent(EntryListMultiButton, PROPS);
    await settle();

    const toggle = rendered.target.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    if (!toggle) throw new Error("dropdown toggle missing");
    await click(toggle);

    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(menu?.className).toContain("bg-black/95");

    const label = menu?.querySelector<HTMLElement>('[class*="truncate"]');
    expect(label).toBeTruthy();
    expect(label?.className).toContain("text-sm");
    expect(label?.className).not.toContain("text-xs");
  });
});
