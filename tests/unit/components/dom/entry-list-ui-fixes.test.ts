/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-list-ui-fixes.test.ts
 * @description Regression tests for EntryList UI fixes:
 * - Column manager uses Tooltip (not native `title` attribute) and allows
 *   reordering a column both right (`0 -> 1`) and back left (`1 -> 0`) without
 *   a dead zone on adjacent pills.
 * - Card grid formats object/localized widget fields via EntryListCell/fallback
 *   (no `[object Object]`) with padded rounded-xl card layout.
 * - SmartFilterRow does not render an idle standalone `Advanced Filters` row.
 * - MediaGrid uses `MediaTableRowMenu` on `small` grid size as well as `tiny`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { SvelteSet } from "svelte/reactivity";
import EntryListColumnManager from "@components/collection-display/entry-list-column-manager.svelte";
import EntryListCardGrid from "@components/collection-display/entry-list-card-grid.svelte";
import SmartFilterRow from "@components/collection-display/smart-filter-row.svelte";
import MediaGrid from "@src/routes/(app)/mediagallery/media-grid.svelte";
import type { CollectionEntry, TableHeader } from "@src/content/types";
import { renderComponent, settle, type RenderedComponent } from "./render";

const HEADERS: TableHeader[] = [
  { id: "h-name", label: "Name", name: "name", visible: true },
  { id: "h-desc", label: "Description", name: "description", visible: true },
  { id: "h-loc", label: "Location", name: "location", visible: true },
  { id: "h-created", label: "createdAt", name: "createdAt", visible: true },
];

describe("EntryList UI fixes", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("renders Tooltip on drag handle without native title attribute and swaps columns back left cleanly", async () => {
    let headers = [...HEADERS];
    const onHeadersChange = vi.fn((next: TableHeader[]) => {
      headers = next;
    });

    rendered = renderComponent(EntryListColumnManager, {
      displayTableHeaders: headers,
      onHeadersChange,
      onResetView: vi.fn(),
    });
    await settle();

    const handles = rendered.target.querySelectorAll<HTMLButtonElement>(".column-drag-handle");
    expect(handles.length).toBe(HEADERS.length);
    for (const handle of handles) {
      expect(handle.getAttribute("title")).toBeNull();
    }

    // Step 1: drag Name (pos 0) right onto Description (pos 1)
    const namePill = rendered.target.querySelector<HTMLElement>('[data-header-id="h-name"]')!;
    const descPill = rendered.target.querySelector<HTMLElement>('[data-header-id="h-desc"]')!;

    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragStart, "dataTransfer", {
      value: { effectAllowed: "move", setData: vi.fn() },
    });
    handles[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    namePill.dispatchEvent(dragStart);

    // Simulate landing anywhere on Description pill
    const dropRight = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropRight, "dataTransfer", {
      value: { getData: () => JSON.stringify(HEADERS[0]) },
    });
    descPill.dispatchEvent(dropRight);
    await settle();

    expect(onHeadersChange).toHaveBeenCalled();
    expect(headers.map((h) => h.name)).toEqual(["description", "name", "location", "createdAt"]);

    // Step 2: remount/update with [Description, Name, ...] and drag Name back BEFORE Description
    // even when dropping on Description's right half (`dropPosition: 'after'`).
    rendered.cleanup();
    rendered = renderComponent(EntryListColumnManager, {
      displayTableHeaders: headers,
      onHeadersChange,
      onResetView: vi.fn(),
    });
    await settle();

    const descPill2 = rendered.target.querySelector<HTMLElement>('[data-header-id="h-desc"]')!;
    vi.spyOn(descPill2, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 120,
      width: 120,
      top: 0,
      bottom: 32,
      height: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const handles2 = rendered.target.querySelectorAll<HTMLButtonElement>(".column-drag-handle");
    const namePill2 = rendered.target.querySelector<HTMLElement>('[data-header-id="h-name"]')!;

    const dragStart2 = new Event("dragstart", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragStart2, "dataTransfer", {
      value: { effectAllowed: "move", setData: vi.fn() },
    });
    handles2[1].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    namePill2.dispatchEvent(dragStart2);

    const dragOverRightHalf = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 100, // right half of 0..120 -> dropPosition === 'after'
      clientY: 16,
    });
    descPill2.dispatchEvent(dragOverRightHalf);

    const dropLeft = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dropLeft, "dataTransfer", {
      value: { getData: () => JSON.stringify(headers[1]) },
    });
    descPill2.dispatchEvent(dropLeft);
    await settle();

    expect(headers.map((h) => h.name)).toEqual(["name", "description", "location", "createdAt"]);
  });

  it("renders EntryListCardGrid with spacing, rounded-xl corners, and formatted object values (never [object Object])", async () => {
    const entry = {
      _id: "e1",
      name: { en: "Marvellous Museum" },
      description: { en: { title: "", content: "<p>Must visit museum!</p>" } },
      location: { street: "Churchill Place", houseNumber: "1", city: "London" },
      createdAt: "2026-11-11T16:12:29.000Z",
      status: "publish",
    } as unknown as CollectionEntry;

    rendered = renderComponent(EntryListCardGrid, {
      tableData: [entry],
      visibleRows: [entry],
      visibleTableHeaders: HEADERS,
      contentLanguage: "en",
      filterShow: false,
      smartFilter: {
        definitions: [],
        filters: {},
        activeFilters: [],
        activeCount: 0,
      } as never,
      focusedRowIndex: 0,
      isSelected: () => false,
      toggleSelect: vi.fn(),
      openEntryForEdit: vi.fn(),
      onFilterChange: vi.fn(),
      onClearAllFilters: vi.fn(),
      onClearFilter: vi.fn(),
      handleTableKeydown: vi.fn(),
      onVirtualScroll: vi.fn(),
    });
    await settle();

    const text = rendered.target.textContent || "";
    expect(text).toContain("Marvellous Museum");
    expect(text).not.toContain("[object Object]");
    const card = rendered.target.querySelector('[role="row"]');
    expect(card?.className).toContain("rounded-xl");
    const gridRoot = rendered.target.querySelector('[aria-label="Collection entries card grid"]');
    expect(gridRoot?.className).toContain("p-4");
  });

  it("omits idle Advanced Filters row in SmartFilterRow when no filters are active", async () => {
    const tableHost = document.createElement("table");
    const thead = document.createElement("thead");
    tableHost.appendChild(thead);

    rendered = renderComponent(SmartFilterRow, {
      headers: HEADERS,
      definitions: [],
      filters: {},
      activeFilters: [],
      onFilterChange: vi.fn(),
      onClearAll: vi.fn(),
      onClearFilter: vi.fn(),
    });
    await settle();

    expect(rendered.target.textContent).not.toContain("Advanced Filters");
  });

  it("renders row menu dropdown on MediaGrid small size so Delete stays reachable", async () => {
    rendered = renderComponent(MediaGrid, {
      filteredFiles: [
        {
          _id: "m1",
          filename: "sample.png",
          path: "global/original/sample.png",
          url: "/files/global/original/sample.png",
          size: 1024,
          mimeType: "image/png",
          type: "image",
          createdAt: "2026-11-17T00:00:00.000Z",
          updatedAt: "2026-11-17T00:00:00.000Z",
          metadata: {},
        } as never,
      ],
      gridSize: "small",
      selectedFiles: new SvelteSet<string>(),
    });
    await settle();

    const actions = rendered.target.querySelector('[data-testid="media-grid-actions"]');
    expect(actions?.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
    expect(actions?.querySelector('[data-testid="media-edit-button"]')).toBeNull();
  });
});
