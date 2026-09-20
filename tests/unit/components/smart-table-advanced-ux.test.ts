/**
 * @file tests/unit/components/smart-table-advanced-ux.test.ts
 * @description Unit tests for Smart Table Advanced UX: multi-column sort, rank indicators, view modes, and cascading client sort.
 */

import { describe, expect, it, vi } from "vitest";
import { createSmartTable } from "@components/ui/smart-table";

describe("Smart Table Advanced UX", () => {
  describe("Multi-Column Sort", () => {
    it("composes secondary and tertiary sorts via multi: true", () => {
      const onQueryChange = vi.fn();
      const table = createSmartTable({
        mode: "server",
        onQueryChange,
        getRowId: (row) => String(row._id),
      });

      // Primary sort
      table.setSort("department");
      expect(table.multiSort).toEqual([{ key: "department", direction: 1 }]);
      expect(table.sort.sortedBy).toBe("department");
      expect(table.sort.isSorted).toBe(1);
      expect(table.getSortRank("department")).toEqual({ rank: 1, direction: 1 });
      expect(table.getSortRank("name")).toBeNull();

      // Secondary sort via multi: true
      table.setSort("name", { multi: true });
      expect(table.multiSort).toEqual([
        { key: "department", direction: 1 },
        { key: "name", direction: 1 },
      ]);
      expect(table.getSortRank("department")).toEqual({ rank: 1, direction: 1 });
      expect(table.getSortRank("name")).toEqual({ rank: 2, direction: 1 });

      // Emits serialized multi-sort query: department:asc,name:asc
      expect(onQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sort: "department:asc,name:asc",
          order: null,
        }),
      );
    });

    it("cycles direction on existing multi-sort key (asc -> desc -> remove)", () => {
      const table = createSmartTable({
        mode: "server",
        getRowId: (row) => String(row._id),
      });

      table.setSort("role", { direction: 1 });
      table.setSort("experience", { multi: true, direction: 1 });
      expect(table.multiSort).toHaveLength(2);

      // Cycle experience: asc (1) -> desc (-1)
      table.setSort("experience", { multi: true });
      expect(table.multiSort).toEqual([
        { key: "role", direction: 1 },
        { key: "experience", direction: -1 },
      ]);

      // Cycle experience: desc (-1) -> remove (0)
      table.setSort("experience", { multi: true });
      expect(table.multiSort).toEqual([{ key: "role", direction: 1 }]);
      expect(table.getSortRank("experience")).toBeNull();
    });

    it("single sort clears previous multi-sort descriptors", () => {
      const table = createSmartTable({ mode: "server" });
      table.setSort("a", { direction: 1 });
      table.setSort("b", { multi: true, direction: 1 });
      expect(table.multiSort).toHaveLength(2);

      // Plain sort on c replaces everything
      table.setSort("c");
      expect(table.multiSort).toEqual([{ key: "c", direction: 1 }]);
      expect(table.sort.sortedBy).toBe("c");
    });

    it("clearSorts removes all sort descriptors and emits clean query", () => {
      const onQueryChange = vi.fn();
      const table = createSmartTable({ mode: "server", onQueryChange });
      table.setSort("category", { direction: 1 });
      table.setSort("date", { multi: true, direction: -1 });

      table.clearSorts();
      expect(table.multiSort).toHaveLength(0);
      expect(table.sort.sortedBy).toBe("");
      expect(table.sort.isSorted).toBe(0);
      expect(onQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: null, order: null }),
      );
    });

    it("client mode cascades multi-column comparator (secondary ties broken correctly)", () => {
      const table = createSmartTable({
        mode: "client",
        pageSize: 10,
        getRowId: (row) => String(row._id),
      });

      const raw = [
        { _id: "1", department: "Engineering", salary: 120000, name: "Charlie" },
        { _id: "2", department: "Design", salary: 90000, name: "Alice" },
        { _id: "3", department: "Engineering", salary: 140000, name: "Bob" },
        { _id: "4", department: "Design", salary: 95000, name: "David" },
      ];

      table.setColumns([
        { key: "department", label: "Dept" },
        { key: "salary", label: "Salary" },
        { key: "name", label: "Name" },
      ]);
      table.setRows(raw);

      // Sort by Department asc, then Salary desc
      table.setSort("department", { direction: 1 });
      table.setSort("salary", { multi: true, direction: -1 });

      const sorted = table.rows;
      expect(sorted[0]._id).toBe("4"); // Design, 95000
      expect(sorted[1]._id).toBe("2"); // Design, 90000
      expect(sorted[2]._id).toBe("3"); // Engineering, 140000
      expect(sorted[3]._id).toBe("1"); // Engineering, 120000
    });
  });

  describe("View Mode (Table vs Card)", () => {
    it("defaults to table viewMode and switches to card viewMode", () => {
      const table = createSmartTable({ mode: "client" });
      expect(table.viewMode).toBe("table");

      table.setViewMode("card");
      expect(table.viewMode).toBe("card");

      table.setViewMode("table");
      expect(table.viewMode).toBe("table");
    });

    it("respects initial viewMode option", () => {
      const table = createSmartTable({ mode: "client", viewMode: "card" });
      expect(table.viewMode).toBe("card");
    });
  });
});
