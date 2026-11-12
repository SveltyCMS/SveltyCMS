/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/table-filter-toolbar-interaction.test.ts
 * @description Toolbar behaviour of the collection table filter row.
 *
 * Two regressions are pinned here:
 * 1. The view-mode toggle threw `TypeError: Cannot set property viewMode of
 *    #<Object> which has only a getter` — it wrote back into a `bind:` target that
 *    the smart-table controller only exposed as a getter. The control now reports
 *    the requested mode through `onViewModeChange` and never writes the prop.
 * 2. Opening search replaced the whole toolbar branch, so filter/column/density
 *    unmounted while typing and `Escape` did nothing. The toolbar stays mounted and
 *    `Escape` closes search, returning focus to the toggle.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import TableFilter from "@components/system/table/table-filter.svelte";
import {
  table_filter_toggle,
  table_search_toggle,
  table_switch_to_card_view,
} from "@src/paraglide/messages";
import { click, press, renderComponent, type RenderedComponent } from "./render";

describe("TableFilter toolbar", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("reports the requested view mode without writing the prop", async () => {
    const onViewModeChange = vi.fn();
    rendered = renderComponent(TableFilter, {
      viewMode: "table",
      showViewMode: true,
      onViewModeChange,
    });

    const toggle = rendered.target.querySelector<HTMLButtonElement>(
      `button[aria-label="${table_switch_to_card_view()}"]`,
    );
    expect(toggle).not.toBeNull();

    await click(toggle);
    expect(onViewModeChange).toHaveBeenCalledWith("card");
    // The controller owns the mode: the button still renders the prop it was given.
    expect(
      rendered.target.querySelector(`button[aria-label="${table_switch_to_card_view()}"]`),
    ).not.toBeNull();
  });

  it("keeps the toolbar mounted while search is open and closes it on Escape", async () => {
    rendered = renderComponent(TableFilter, {});
    const { target } = rendered;

    const searchToggle = target.querySelector<HTMLButtonElement>(
      `button[aria-label="${table_search_toggle()}"]`,
    );
    expect(target.querySelector(`button[aria-label="${table_filter_toggle()}"]`)).not.toBeNull();

    await click(searchToggle);
    const input = target.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    // The other controls must survive the search branch.
    expect(target.querySelector(`button[aria-label="${table_filter_toggle()}"]`)).not.toBeNull();

    await press(input, "Escape");
    expect(target.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(searchToggle);
  });
});
