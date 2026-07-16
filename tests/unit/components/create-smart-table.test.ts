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
    expect(table.sort).toEqual({ sortedBy: "createdAt", isSorted: -1 });

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
});
