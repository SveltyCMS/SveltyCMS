/**
 * @file tests/unit/components/create-smart-table.test.ts
 * @description Smoke tests for unified Smart Table controller (Svelte 5 runes).
 */

import { describe, expect, it, vi } from "vitest";
import { createSmartTable } from "@components/ui/smart-table";

describe("createSmartTable", () => {
  it("server mode keeps rows as provided page slice and emits query on sort/page", () => {
    const onQueryChange = vi.fn();
    const table = createSmartTable({
      mode: "server",
      onQueryChange,
      getRowId: (row) => String(row._id),
    });

    table.setRows([
      { _id: "a", title: "One" },
      { _id: "b", title: "Two" },
      { _id: "c", title: "Three" },
    ]);
    table.setPaginationMeta({ currentPage: 1, pageSize: 10, totalItems: 30, pagesCount: 3 });

    expect(table.rows).toHaveLength(3);
    expect(table.mode).toBe("server");

    table.setSort("title");
    expect(onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "title", order: "asc" }),
    );

    table.setPage(2);
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("setSort can restore an absolute direction without cycling", () => {
    const onQueryChange = vi.fn();
    const table = createSmartTable({
      mode: "server",
      onQueryChange,
      getRowId: (row) => String(row._id),
    });
    table.setSort("title", { emit: false, direction: -1 });
    expect(table.sort).toMatchObject({ sortedBy: "title", isSorted: -1 });
    expect(table.multiSort).toEqual([{ key: "title", direction: -1 }]);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("selects by stable row id (virtualization-safe)", () => {
    const table = createSmartTable({
      mode: "server",
      getRowId: (row) => String(row._id),
    });
    table.setRows([
      { _id: "a", title: "One" },
      { _id: "b", title: "Two" },
    ]);

    table.toggleSelect("a");
    expect(table.isSelected("a")).toBe(true);
    expect(table.selectedCount).toBe(1);
    expect(table.hasSelections).toBe(true);

    table.setSelectAll(true);
    expect(table.allSelected).toBe(true);
    expect(table.getSelectedIds().sort()).toEqual(["a", "b"]);

    table.clearSelection();
    expect(table.selectedCount).toBe(0);
  });

  it("client mode sorts and pages locally", () => {
    const table = createSmartTable({
      mode: "client",
      pageSize: 2,
      getRowId: (row) => String(row._id),
    });
    table.setRows([
      { _id: "1", name: "Charlie" },
      { _id: "2", name: "Alice" },
      { _id: "3", name: "Bob" },
    ]);
    table.setColumns([{ key: "name", label: "Name", sortable: true }]);

    expect(table.pagination.totalItems).toBe(3);
    expect(table.pagination.pagesCount).toBe(2);
    expect(table.rows).toHaveLength(2);

    table.setSort("name"); // asc
    expect(table.rows[0].name).toBe("Alice");

    table.setPage(2);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].name).toBe("Charlie");
  });

  it("exposes density padding class helpers", () => {
    const table = createSmartTable({ mode: "client", density: "compact" });
    expect(table.cellPaddingClass).toBe("!p-1");
    table.setDensity("comfortable");
    expect(table.cellPaddingClass).toBe("!p-3");
  });

  it("supports initialSort and emit:false on page/sort", () => {
    const onQueryChange = vi.fn();
    const table = createSmartTable({
      mode: "server",
      initialSort: { sortedBy: "createdAt", isSorted: -1 },
      onQueryChange,
    });
    expect(table.sort).toMatchObject({ sortedBy: "createdAt", isSorted: -1 });

    table.setPaginationMeta({ pagesCount: 5, totalItems: 50, pageSize: 10 });
    table.setPage(3, { emit: false });
    expect(table.pagination.currentPage).toBe(3);
    expect(onQueryChange).not.toHaveBeenCalled();

    table.setPage(4);
    expect(onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({ page: 4, order: "desc", sort: "createdAt" }),
    );
  });

  it("orders visible columns by pin: start → center → end", () => {
    const table = createSmartTable({ mode: "client" });
    table.setColumns([
      { key: "name", label: "Name" },
      { key: "actions", label: "Actions", pin: "end" },
      { key: "select", label: "", pin: "start" },
      { key: "status", label: "Status" },
    ]);
    expect(table.visibleColumns.map((c) => c.key)).toEqual(["select", "name", "status", "actions"]);
    expect(table.pinned.start.map((c) => c.key)).toEqual(["select"]);
    expect(table.pinned.end.map((c) => c.key)).toEqual(["actions"]);
    expect(table.isEmpty).toBe(true);

    table.setRows([{ _id: "1", name: "x" }]);
    expect(table.isEmpty).toBe(false);
  });

  it("supports column resizing and dynamic setLayoutKey", () => {
    const table = createSmartTable({ mode: "client", layoutKey: "test-table-1" });
    table.setColumns([
      { key: "col1", label: "Col 1" },
      { key: "col2", label: "Col 2" },
    ]);

    table.setColumnWidth("col1", 180);
    expect(table.columnWidths.col1).toBe(180);
    expect(table.getColumnWidthStyle("col1")).toBe("180px");
    expect(table.getColumnWidthStyle("col2")).toBeUndefined();

    // Switch layout key to a new layout
    table.setLayoutKey("test-table-2");
    expect(table.columnWidths.col1).toBeUndefined();

    // Set width on the new layout
    table.setColumnWidth("col2", 220);
    expect(table.columnWidths.col2).toBe(220);
    expect(table.getColumnWidthStyle("col2")).toBe("220px");

    // Switching back restores saved layout prefs
    table.setLayoutKey("test-table-1");
    expect(table.columnWidths.col1).toBe(180);
  });

  it("composes multi-column sort with Shift (multi: true) and emits field:dir list", () => {
    const onQueryChange = vi.fn();
    const table = createSmartTable({
      mode: "server",
      onQueryChange,
      getRowId: (row) => String(row._id),
    });
    table.setSort("title");
    table.setSort("createdAt", { multi: true, direction: -1 });
    expect(table.multiSort).toEqual([
      { key: "title", direction: 1 },
      { key: "createdAt", direction: -1 },
    ]);
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "title:asc,createdAt:desc", order: null }),
    );
  });

  it("client mode applies cascading multi-column sort", () => {
    const table = createSmartTable({
      mode: "client",
      pageSize: 10,
      getRowId: (row) => String(row._id),
    });
    table.setRows([
      { _id: "1", group: "b", name: "Charlie" },
      { _id: "2", group: "a", name: "Bob" },
      { _id: "3", group: "a", name: "Alice" },
    ]);
    table.setColumns([
      { key: "group", label: "Group", sortable: true },
      { key: "name", label: "Name", sortable: true },
    ]);
    table.setSort("group");
    table.setSort("name", { multi: true });
    expect(table.rows.map((r) => r._id)).toEqual(["3", "2", "1"]);
  });
});
