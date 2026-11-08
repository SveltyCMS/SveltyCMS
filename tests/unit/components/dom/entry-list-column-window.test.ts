/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-list-column-window.test.ts
 * @description Horizontal body-cell windowing in the collection entry list.
 *
 * jsdom has no layout engine, so the tests stub `offsetWidth` / `clientWidth`
 * to simulate a measured header row and a narrow viewport. The unmeasured test
 * deliberately leaves the jsdom defaults in place: every header width is 0, so
 * the window must stay inactive and the full table must render (the SSR and
 * unit-test contract).
 *
 * ### Features:
 * - a 23-column table renders a body-cell slice, not 23 cells per row
 * - every header cell still renders (headers are not windowed)
 * - skipped columns collapse into one width-preserving trailing placeholder
 * - `aria-colindex` stays absolute, not slice-relative
 * - scrolling tracks a leading + trailing placeholder pair
 * - keyboard focus reveals a column outside the window
 * - a 5-column table renders every cell with no placeholders
 * - without measurement the full table renders
 */

import { afterEach, describe, expect, it } from "vitest";
import EntryList from "@components/collection-display/entry-list.svelte";
import { press, renderComponent, settle, type RenderedComponent } from "./render";

interface LayoutStub {
  restore: () => void;
}

/**
 * jsdom reports 0 for every layout metric. Shadow the prototype getters for the
 * duration of one test so the header measurement sees a real table.
 */
function stubTableLayout(cellWidth: number, viewportWidth: number): LayoutStub {
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const scrollLeftDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollLeft");
  let scrollLeft = 0;

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => cellWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => viewportWidth,
  });
  // jsdom clamps `scrollLeft` to a layout it does not have; store the requested
  // offset so the component's scroll handler sees a real horizontal position.
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });

  return {
    restore: () => {
      if (offsetWidth) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
      }
      if (clientWidth) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      }
      if (scrollLeftDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollLeft", scrollLeftDescriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollLeft");
      }
    },
  };
}

function makeCollection(id: string, fieldCount: number) {
  return {
    _id: id,
    name: `Collection ${id}`,
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      label: `Field ${index}`,
      type: "text",
    })),
  };
}

function makeEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `entry-${index}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "draft",
  }));
}

function mountEntryList(collection: ReturnType<typeof makeCollection>) {
  return renderComponent(
    EntryList as never,
    {
      collection,
      entries: makeEntries(2),
      pagination: { currentPage: 1, pageSize: 10, totalItems: 2, pagesCount: 1 },
      contentLanguage: "en",
    } as never,
  );
}

function gridCells(row: Element | undefined): HTMLTableCellElement[] {
  if (!row) return [];
  return [...row.querySelectorAll<HTMLTableCellElement>('td[role="gridcell"]')];
}

function windowSpacers(row: Element | undefined): HTMLTableCellElement[] {
  if (!row) return [];
  return [...row.querySelectorAll<HTMLTableCellElement>('td[aria-hidden="true"][colspan]')];
}

describe("Entry list — horizontal body-cell window", () => {
  let rendered: RenderedComponent | null = null;
  let layout: LayoutStub | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    layout?.restore();
    layout = null;
  });

  it("renders only the body-cell window for a wide table and keeps every header", async () => {
    layout = stubTableLayout(120, 400);
    rendered = mountEntryList(makeCollection("wide", 20));
    await settle();

    // 20 schema fields + createdAt/updatedAt/status, none added by the plugins.
    const headers = rendered.target.querySelectorAll("thead tr:last-child th");
    expect(headers).toHaveLength(23);

    const rows = rendered.target.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows).toHaveLength(2);

    const cells = gridCells(rows[0]);
    // 400px viewport / 120px columns → 4 visible columns + 2 overscan.
    expect(cells).toHaveLength(6);
    expect(cells.length).toBeLessThan(23);
    for (const cell of cells) {
      expect(cell.title).not.toBe("");
    }

    // Absolute column indexes: the selection cell is column 1.
    expect(cells[0]?.getAttribute("aria-colindex")).toBe("2");
    expect(cells[5]?.getAttribute("aria-colindex")).toBe("7");

    // Hidden columns collapse into one trailing cell that preserves the width.
    const spacers = windowSpacers(rows[0]);
    expect(spacers).toHaveLength(1);
    expect(spacers[0]?.getAttribute("colspan")).toBe("17");
    expect(spacers[0]?.style.width).toBe("2040px");
    expect(spacers[0]?.style.minWidth).toBe("2040px");

    // Nothing is skipped before the first visible column at scrollLeft 0.
    expect(rows[0]?.querySelector('td[aria-hidden="true"]')).toBe(spacers[0]);
  });

  it("windows from the tracked horizontal scroll offset", async () => {
    layout = stubTableLayout(120, 400);
    rendered = mountEntryList(makeCollection("scrolled", 20));
    await settle();

    const scroller = rendered.target.querySelector<HTMLElement>(
      '[aria-label="Collection entries table"]',
    );
    if (!scroller) throw new Error("table scroll region not rendered");

    scroller.scrollLeft = 1440;
    scroller.dispatchEvent(new Event("scroll"));
    await settle();

    const rows = rendered.target.querySelectorAll<HTMLTableRowElement>("tbody tr");
    const cells = gridCells(rows[0]);
    // Column 12 is at the start edge; start backs off 2, end adds 2 past column 15.
    expect(cells).toHaveLength(8);
    expect(cells[0]?.getAttribute("aria-colindex")).toBe("12");
    expect(cells[7]?.getAttribute("aria-colindex")).toBe("19");

    const spacers = windowSpacers(rows[0]);
    expect(spacers).toHaveLength(2);
    // Leading placeholder covers columns 0-9, trailing covers 18-22.
    expect(spacers[0]?.getAttribute("colspan")).toBe("10");
    expect(spacers[0]?.style.width).toBe("1200px");
    expect(spacers[1]?.getAttribute("colspan")).toBe("5");
    expect(spacers[1]?.style.width).toBe("600px");
  });

  it("reveals the keyboard-focused column at either edge", async () => {
    layout = stubTableLayout(120, 400);
    rendered = mountEntryList(makeCollection("keyboard", 20));
    await settle();

    const scroller = rendered.target.querySelector<HTMLElement>(
      '[aria-label="Collection entries table"]',
    );
    if (!scroller) throw new Error("table scroll region not rendered");

    await press(scroller, "End");

    // The last data column is grid column 24 (the selection cell is column 1).
    expect(scroller.scrollLeft).toBe(2360);
    const rows = rendered.target.querySelectorAll<HTMLTableRowElement>("tbody tr");
    const endCells = gridCells(rows[0]);
    expect(endCells).toHaveLength(6);
    expect(endCells[0]?.getAttribute("aria-colindex")).toBe("19");
    expect(endCells[5]?.getAttribute("aria-colindex")).toBe("24");

    // ArrowLeft walks the focus back to the first column; the reveal follows.
    for (let step = 0; step < 22; step += 1) {
      await press(scroller, "ArrowLeft");
    }

    expect(scroller.scrollLeft).toBe(0);
    const homeCells = gridCells(rows[0]);
    expect(homeCells[0]?.getAttribute("aria-colindex")).toBe("2");
    expect(homeCells).toHaveLength(6);
  });

  it("renders a narrow table in full with no placeholders", async () => {
    layout = stubTableLayout(120, 400);
    rendered = mountEntryList(makeCollection("narrow", 2));
    await settle();

    const headers = rendered.target.querySelectorAll("thead tr:last-child th");
    expect(headers).toHaveLength(5); // 2 fields + 3 system columns

    const rows = rendered.target.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows).toHaveLength(2);

    const cells = gridCells(rows[0]);
    expect(cells).toHaveLength(5);
    expect(cells.map((cell) => cell.getAttribute("aria-colindex"))).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(windowSpacers(rows[0])).toHaveLength(0);
  });

  it("renders every cell when the header widths cannot be measured", async () => {
    // No stub: jsdom's offsetWidth/clientWidth are 0, the documented SSR path.
    rendered = mountEntryList(makeCollection("unmeasured", 20));
    await settle();

    const headers = rendered.target.querySelectorAll("thead tr:last-child th");
    expect(headers).toHaveLength(23);

    const rows = rendered.target.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows).toHaveLength(2);

    expect(gridCells(rows[0])).toHaveLength(23);
    expect(windowSpacers(rows[0])).toHaveLength(0);
  });
});
