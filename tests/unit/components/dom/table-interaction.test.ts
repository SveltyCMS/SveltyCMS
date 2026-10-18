/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/table-interaction.test.ts
 * @description Real DOM tests for the SmartTable primitives.
 *
 * Covers the pieces every admin table composes: row selection, select-all,
 * column sorting, keyboard selection, and the icon checkbox used by the
 * collection entry list (`TableIcons`). These paths previously had no
 * interaction coverage — only Playwright could see them.
 *
 * ### Features:
 * - row checkbox dispatches the selection set
 * - header checkbox selects all rows, then clears them
 * - Space toggles a row without a mouse
 * - sortable headers expose `aria-sort` and flip direction
 * - `TableIcons` toggles `aria-checked` by click and keyboard
 */

import { describe, expect, it, vi } from "vitest";
import Table from "@src/components/ui/table.svelte";
import TableIcons from "@src/components/system/table/table-icons.svelte";
import { click, press, renderComponent, settle } from "./render";

const ROWS = [
  { _id: "row-1", name: "Alpha", status: "draft" },
  { _id: "row-2", name: "Beta", status: "published" },
  { _id: "row-3", name: "Gamma", status: "draft" },
];

const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status" },
];

function rowCheckboxes(target: HTMLElement): HTMLInputElement[] {
  return [...target.querySelectorAll<HTMLInputElement>("input[aria-label='Select row']")];
}

function sortableHeader(target: HTMLElement, label: string): HTMLTableCellElement {
  const header = [...target.querySelectorAll<HTMLTableCellElement>("th")].find((th) =>
    th.textContent?.includes(label),
  );
  if (!header) throw new Error(`sortableHeader(): "${label}" not found`);
  return header;
}

describe("SmartTable selection (client interaction)", () => {
  it("selects a single row and forwards the set to onselect", async () => {
    const selected = new Set<string>();
    const onselect = vi.fn();

    const { target, cleanup } = renderComponent(Table, {
      data: ROWS,
      columns: COLUMNS,
      selectable: true,
      selectedIds: selected,
      onselect,
    });

    try {
      const [first] = rowCheckboxes(target);
      await click(first);

      expect(selected.has("row-1")).toBe(true);
      expect(selected.size).toBe(1);
      expect(onselect).toHaveBeenCalledTimes(1);
      expect(onselect.mock.calls[0]?.[0]).toContain("row-1");
    } finally {
      cleanup();
    }
  });

  it("selects and clears all rows from the header checkbox", async () => {
    const selected = new Set<string>();
    const onselect = vi.fn();

    const { target, cleanup } = renderComponent(Table, {
      data: ROWS,
      columns: COLUMNS,
      selectable: true,
      selectedIds: selected,
      onselect,
    });

    try {
      const selectAll = target.querySelector<HTMLInputElement>(
        "input[aria-label='Select all rows']",
      );
      await click(selectAll);

      expect([...selected].sort()).toEqual(["row-1", "row-2", "row-3"]);
      expect(selectAll?.checked).toBe(true);

      await click(selectAll);

      expect(selected.size).toBe(0);
      expect(selectAll?.checked).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("toggles a row with the Space key", async () => {
    const selected = new Set<string>();

    const { target, cleanup } = renderComponent(Table, {
      data: ROWS,
      columns: COLUMNS,
      selectable: true,
      selectedIds: selected,
      onselect: vi.fn(),
    });

    try {
      const rows = target.querySelectorAll("tbody tr");
      await press(rows[1], " ");

      expect(selected.has("row-2")).toBe(true);
      expect(selected.size).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("flips aria-sort when a sortable header is clicked", async () => {
    const { target, cleanup } = renderComponent(Table, {
      data: ROWS,
      columns: COLUMNS,
      sortKey: "name",
      sortOrder: "asc",
    });

    try {
      const header = sortableHeader(target, "Name");
      expect(header).toHaveAttribute("aria-sort", "ascending");

      await click(header);
      await settle();

      expect(sortableHeader(target, "Name")).toHaveAttribute("aria-sort", "descending");
    } finally {
      cleanup();
    }
  });
});

describe("TableIcons selection control (client interaction)", () => {
  it("toggles aria-checked by click and reports the new value", async () => {
    const onCheck = vi.fn();

    const { target, cleanup } = renderComponent(TableIcons, {
      checked: false,
      onCheck,
    });

    try {
      const control = target.querySelector<HTMLButtonElement>(
        "button[aria-label='Toggle selection']",
      );
      expect(control).toHaveAttribute("aria-checked", "false");

      await click(control);

      expect(control).toHaveAttribute("aria-checked", "true");
      expect(onCheck).toHaveBeenLastCalledWith(true);

      await click(control);

      expect(control).toHaveAttribute("aria-checked", "false");
      expect(onCheck).toHaveBeenLastCalledWith(false);
      expect(onCheck).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  it("toggles with Enter and Space", async () => {
    const onCheck = vi.fn();

    const { target, cleanup } = renderComponent(TableIcons, {
      checked: false,
      onCheck,
    });

    try {
      const control = target.querySelector<HTMLButtonElement>(
        "button[aria-label='Toggle selection']",
      );

      await press(control, "Enter");
      expect(onCheck).toHaveBeenLastCalledWith(true);

      await press(control, " ");
      expect(onCheck).toHaveBeenLastCalledWith(false);
    } finally {
      cleanup();
    }
  });
});
