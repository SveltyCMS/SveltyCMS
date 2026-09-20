/**
 * @file src/components/ui/smart-table/create-smart-table.svelte.ts
 * @description
 * **Unified headless Smart Table controller** (Svelte 5 runes).
 *
 * One controller powers:
 * - Design-system tables (`ui/table.svelte`) — client or server mode
 * - CMS tables (`entry-list`, media, users) — typically server mode + filters
 *
 * Presentation stays in components; this module owns selection, sort, density,
 * pagination state, and virtualization math. Schema-aware filters compose via
 * `createSmartFilter` / collection-filter-engine (security at the service layer).
 *
 * ### Features:
 * - client vs server data modes
 * - multi-select by stable row id
 * - sort cycle none → asc → desc
 * - density + virtual window
 * - optional query-change callbacks (URL/SSR)
 * - zero TanStack dependency (CMS-native, tree-shake friendly)
 *
 * @see docs/reference/components/smart-table.mdx
 */

import { ROW_HEIGHT, VIRTUAL_BUFFER, VIRTUALIZATION_THRESHOLD } from "./types";
import {
  isValidDensity,
  isValidViewMode,
  loadTableLayout,
  mergeLayoutIntoColumns,
  saveTableLayout,
} from "./layout-prefs";
import type {
  ColumnSortDescriptor,
  CreateSmartTableOptions,
  PinnedColumnGroups,
  SmartTableColumn,
  SmartTablePagination,
  SmartTableSort,
  TableDensity,
  TableSortOrder,
  TableViewMode,
  VirtualWindow,
} from "./types";

function defaultRowId<T extends Record<string, unknown>>(row: T, index: number): string {
  const id = row._id ?? row.id;
  if (id != null && String(id).length > 0) return String(id);
  return `idx:${index}`;
}

export interface SmartTableApi<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Current page of rows (server) or full set (client before local page) */
  readonly rows: T[];
  readonly columns: SmartTableColumn<T>[];
  /** Visible columns in pin order: start → center → end */
  readonly visibleColumns: SmartTableColumn<T>[];
  /** Pinned column groups for sticky chrome */
  readonly pinned: PinnedColumnGroups<T>;
  readonly density: TableDensity;
  readonly viewMode: TableViewMode;
  readonly sort: SmartTableSort;
  readonly multiSort: ColumnSortDescriptor[];
  readonly pagination: SmartTablePagination;
  readonly selectedIds: Set<string>;
  readonly selectedCount: number;
  readonly hasSelections: boolean;
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  /** True when page has zero rows (use for empty state) */
  readonly isEmpty: boolean;
  readonly mode: "client" | "server";
  readonly virtual: VirtualWindow<T>;
  readonly cellPaddingClass: string;
  /** User-resized column widths (px) */
  readonly columnWidths: Record<string, number>;

  setRows: (rows: T[]) => void;
  setColumns: (columns: SmartTableColumn<T>[]) => void;
  setPaginationMeta: (meta: Partial<SmartTablePagination>) => void;
  setDensity: (density: TableDensity) => void;
  setViewMode: (viewMode: TableViewMode) => void;
  setSort: (
    field: string,
    options?: { emit?: boolean; direction?: TableSortOrder; multi?: boolean },
  ) => void;
  getSortRank: (field: string) => { rank: number; direction: TableSortOrder } | null;
  clearSorts: (options?: { emit?: boolean }) => void;
  setPage: (page: number, options?: { emit?: boolean }) => void;
  setPageSize: (size: number, options?: { emit?: boolean }) => void;
  toggleSelect: (rowId: string) => void;
  toggleSelectIndex: (index: number) => void;
  setSelectAll: (value: boolean) => void;
  clearSelection: () => void;
  isSelected: (rowId: string) => boolean;
  getSelectedRows: () => T[];
  getSelectedIds: () => string[];
  setColumnVisible: (key: string, visible: boolean) => void;
  setColumnPin: (key: string, pin: "start" | "end" | false) => void;
  setColumnWidth: (key: string, widthPx: number) => void;
  getColumnWidthStyle: (key: string) => string | undefined;
  reorderColumns: (orderedKeys: string[]) => void;
  /** Persist density/order/visibility when layoutKey is set */
  persistLayout: () => void;
  setLayoutKey: (key: string) => void;
  getRowId: (row: T, index: number) => string;
}

/**
 * Create a reactive smart-table controller.
 *
 * @example Server mode (entry-list)
 * ```ts
 * const table = createSmartTable({ mode: 'server', onQueryChange: updateURL });
 * table.setRows(serverEntries);
 * table.setPaginationMeta(serverPagination);
 * ```
 *
 * @example Client mode (ui widgets)
 * ```ts
 * const table = createSmartTable({ mode: 'client', pageSize: 10 });
 * table.setRows(localData);
 * ```
 */
export function createSmartTable<T extends Record<string, unknown> = Record<string, unknown>>(
  options: CreateSmartTableOptions<T> = {},
): SmartTableApi<T> {
  const mode = options.mode ?? "server";
  const getRowId = options.getRowId ?? defaultRowId;
  const virtualizeThreshold = options.virtualizeThreshold ?? VIRTUALIZATION_THRESHOLD;
  const rowHeight = options.rowHeight ?? ROW_HEIGHT;
  const virtualBuffer = options.virtualBuffer ?? VIRTUAL_BUFFER;
  const onQueryChange = options.onQueryChange;
  let currentLayoutKey = $state(options.layoutKey);

  const savedLayout = options.layoutKey ? loadTableLayout(options.layoutKey) : null;

  let rows = $state.raw<T[]>([]);
  let columns = $state<SmartTableColumn<T>[]>([]);
  let density = $state<TableDensity>(
    (savedLayout?.density && isValidDensity(savedLayout.density)
      ? savedLayout.density
      : options.density) ?? "normal",
  );
  let viewMode = $state<TableViewMode>(
    (savedLayout?.viewMode && isValidViewMode(savedLayout.viewMode)
      ? savedLayout.viewMode
      : options.viewMode) ?? "table",
  );
  let multiSort = $state<ColumnSortDescriptor[]>(
    options.initialSort?.multiSort && options.initialSort.multiSort.length > 0
      ? [...options.initialSort.multiSort]
      : options.initialSort?.sortedBy && options.initialSort.isSorted !== 0
        ? [{ key: options.initialSort.sortedBy, direction: options.initialSort.isSorted }]
        : [],
  );
  const sort = $derived.by((): SmartTableSort => {
    const s: SmartTableSort = {
      sortedBy: multiSort[0]?.key ?? "",
      isSorted: multiSort[0]?.direction ?? 0,
    };
    if (multiSort.length > 1) {
      s.multiSort = multiSort;
    }
    return s;
  });
  let pagination = $state<SmartTablePagination>({
    currentPage: 1,
    pageSize: savedLayout?.pageSize ?? options.pageSize ?? 10,
    totalItems: 0,
    pagesCount: 1,
  });
  let selectedIds = $state(new Set<string>());
  let columnWidths = $state<Record<string, number>>(savedLayout?.columnWidths ?? {});

  // Virtual scroll
  let scrollTop = $state(0);
  let containerHeight = $state(600);

  /** Pin order: start → center → end (TanStack-style) */
  const pinned = $derived.by((): PinnedColumnGroups<T> => {
    const vis = columns.filter((c) => c.visible !== false);
    const start = vis.filter((c) => c.pin === "start");
    const end = vis.filter((c) => c.pin === "end");
    const center = vis.filter((c) => c.pin !== "start" && c.pin !== "end");
    return { start, center, end, ordered: [...start, ...center, ...end] };
  });

  const visibleColumns = $derived(pinned.ordered);

  /** Rows after client-side sort (client mode only) with cascading multi-column sort. */
  const processedRows = $derived.by((): T[] => {
    if (mode !== "client") return rows;
    if (multiSort.length === 0) return rows;

    const colMap = new Map(columns.map((c) => [c.key, c]));

    return [...rows].sort((a, b) => {
      for (const descriptor of multiSort) {
        if (descriptor.direction === 0) continue;
        const col = colMap.get(descriptor.key);
        const av = col?.accessor ? col.accessor(a) : a[descriptor.key];
        const bv = col?.accessor ? col.accessor(b) : b[descriptor.key];
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        let diff = 0;
        if (typeof av === "number" && typeof bv === "number") {
          diff = (av - bv) * descriptor.direction;
        } else {
          diff = String(av).localeCompare(String(bv)) * descriptor.direction;
        }
        if (diff !== 0) return diff;
      }
      return 0;
    });
  });

  /** Page slice in client mode; full rows in server mode. */
  const pageRows = $derived.by((): T[] => {
    if (mode !== "client") return processedRows;
    const start = (pagination.currentPage - 1) * pagination.pageSize;
    return processedRows.slice(start, start + pagination.pageSize);
  });

  const isEmpty = $derived(pageRows.length === 0);

  const useVirtual = $derived(
    pageRows.length > virtualizeThreshold ||
      (mode === "server" && pagination.pageSize > virtualizeThreshold),
  );

  const virtualStartIndex = $derived(
    useVirtual ? Math.max(0, Math.floor(scrollTop / rowHeight) - virtualBuffer) : 0,
  );
  const virtualEndIndex = $derived(
    useVirtual
      ? Math.min(
          pageRows.length,
          Math.ceil((scrollTop + containerHeight) / rowHeight) + virtualBuffer,
        )
      : pageRows.length,
  );
  const visibleRows = $derived(
    useVirtual ? pageRows.slice(virtualStartIndex, virtualEndIndex) : pageRows,
  );
  const spacerTop = $derived(useVirtual ? virtualStartIndex * rowHeight : 0);
  const spacerBottom = $derived(useVirtual ? (pageRows.length - virtualEndIndex) * rowHeight : 0);

  const selectedCount = $derived(selectedIds.size);
  const hasSelections = $derived(selectedIds.size > 0);

  const allSelected = $derived.by(() => {
    if (pageRows.length === 0) return false;
    return pageRows.every((row, i) => selectedIds.has(getRowId(row, i)));
  });

  const someSelected = $derived(hasSelections && !allSelected);

  const cellPaddingClass = $derived.by(() => {
    if (density === "compact") return "!p-1";
    if (density === "comfortable") return "!p-3";
    return "!p-2";
  });

  const virtual: VirtualWindow<T> = {
    get enabled() {
      return useVirtual;
    },
    get startIndex() {
      return virtualStartIndex;
    },
    get endIndex() {
      return virtualEndIndex;
    },
    get visibleRows() {
      return visibleRows;
    },
    get spacerTop() {
      return spacerTop;
    },
    get spacerBottom() {
      return spacerBottom;
    },
    onScroll(nextTop: number, nextHeight: number) {
      scrollTop = nextTop;
      if (nextHeight > 0) containerHeight = nextHeight;
    },
  };

  function emitQuery(updates: Record<string, string | number | null>) {
    onQueryChange?.(updates);
  }

  function setRows(next: T[]) {
    rows = next;
    if (mode === "client") {
      const pagesCount = Math.max(1, Math.ceil(next.length / pagination.pageSize));
      pagination = {
        ...pagination,
        totalItems: next.length,
        pagesCount,
        // Clamp the current page — deleting rows on the last page would
        // otherwise leave it beyond pagesCount and render a blank list.
        currentPage: Math.min(pagination.currentPage, pagesCount),
      };
    }
  }

  function setColumns(next: SmartTableColumn<T>[]) {
    const normalized = next.map((c) => ({
      ...c,
      visible: c.visible !== false,
      sortable: c.sortable !== false,
      pin: c.pin ?? false,
      align: c.align ?? "center",
    }));
    columns = mergeLayoutIntoColumns(
      normalized,
      currentLayoutKey ? loadTableLayout(currentLayoutKey) : null,
    );
  }

  /**
   * Switch the persisted-layout scope (e.g. users vs tokens table).
   *
   * ⚠️ Idempotent on purpose: callers invoke this from a `$effect` that also
   * feeds `setColumns()`. The saved branch READS `columns` to merge widths and
   * then WRITES it — inside an effect both the read and the write are tracked,
   * so a repeated same-key call would schedule the effect that issued it
   * (`effect_update_depth_exceeded`). Guarding on the key keeps a no-op call a
   * genuine no-op; the layout is applied exactly once per key change.
   */
  function setLayoutKey(nextKey: string) {
    if (nextKey === currentLayoutKey) return;
    currentLayoutKey = nextKey;
    const saved = nextKey ? loadTableLayout(nextKey) : null;
    if (saved) {
      if (saved.density && isValidDensity(saved.density)) density = saved.density;
      if (saved.viewMode && isValidViewMode(saved.viewMode)) viewMode = saved.viewMode;
      if (saved.pageSize) pagination.pageSize = saved.pageSize;
      columnWidths = saved.columnWidths ?? {};
      if (columns.length > 0) {
        columns = mergeLayoutIntoColumns(columns, saved);
      }
    } else {
      columnWidths = {};
    }
  }

  function setPaginationMeta(meta: Partial<SmartTablePagination>) {
    pagination = { ...pagination, ...meta };
    if (pagination.pageSize > 0 && meta.totalItems != null && meta.pagesCount == null) {
      pagination.pagesCount = Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize));
    }
  }

  function persistLayout() {
    if (!currentLayoutKey) return;
    const visibility: Record<string, boolean> = {};
    for (const c of columns) {
      visibility[c.key] = c.visible !== false;
    }
    saveTableLayout(currentLayoutKey, {
      density,
      viewMode,
      pageSize: pagination.pageSize,
      columnOrder: columns.map((c) => c.key),
      visibility,
      columnWidths: { ...columnWidths },
    });
  }

  function setDensity(next: TableDensity) {
    density = next;
    persistLayout();
  }

  function setViewMode(next: TableViewMode) {
    viewMode = next;
    persistLayout();
  }

  function getSortQueryParams(): { sort: string | null; order: "asc" | "desc" | null } {
    if (multiSort.length === 1) {
      return {
        sort: multiSort[0].key,
        order: multiSort[0].direction === 1 ? "asc" : multiSort[0].direction === -1 ? "desc" : null,
      };
    }
    if (multiSort.length > 1) {
      return {
        sort: multiSort.map((s) => `${s.key}:${s.direction === 1 ? "asc" : "desc"}`).join(","),
        order: null,
      };
    }
    return { sort: null, order: null };
  }

  function setSort(
    field: string,
    options?: { emit?: boolean; direction?: TableSortOrder; multi?: boolean },
  ) {
    const shouldEmit = options?.emit !== false;
    const isMulti = options?.multi === true;

    let nextMulti: ColumnSortDescriptor[];

    if (isMulti) {
      const existingIndex = multiSort.findIndex((s) => s.key === field);
      if (existingIndex >= 0) {
        const existing = multiSort[existingIndex];
        const nextDir: TableSortOrder =
          options?.direction !== undefined
            ? options.direction
            : existing.direction === 1
              ? -1
              : existing.direction === -1
                ? 0
                : 1;
        if (nextDir === 0) {
          nextMulti = multiSort.filter((s) => s.key !== field);
        } else {
          nextMulti = multiSort.map((s, idx) =>
            idx === existingIndex ? { key: field, direction: nextDir } : s,
          );
        }
      } else {
        const nextDir: TableSortOrder = options?.direction !== undefined ? options.direction : 1;
        if (nextDir !== 0) {
          nextMulti = [...multiSort, { key: field, direction: nextDir }];
        } else {
          nextMulti = [...multiSort];
        }
      }
    } else {
      const existing = multiSort.find((s) => s.key === field);
      let nextDir: TableSortOrder;
      if (options?.direction !== undefined) {
        nextDir = options.direction;
      } else if (existing && multiSort.length === 1) {
        nextDir = existing.direction === 1 ? -1 : existing.direction === -1 ? 0 : 1;
      } else {
        nextDir = 1;
      }

      if (nextDir === 0) {
        nextMulti = [];
      } else {
        nextMulti = [{ key: field, direction: nextDir }];
      }
    }

    multiSort = nextMulti;

    if (mode === "server" && shouldEmit) {
      const sortParams = getSortQueryParams();
      emitQuery({
        ...sortParams,
        page: pagination.currentPage,
        pageSize: pagination.pageSize,
      });
    }
  }

  function getSortRank(field: string): { rank: number; direction: TableSortOrder } | null {
    const idx = multiSort.findIndex((s) => s.key === field);
    if (idx === -1) return null;
    return { rank: idx + 1, direction: multiSort[idx].direction };
  }

  function clearSorts(options?: { emit?: boolean }) {
    multiSort = [];
    const shouldEmit = options?.emit !== false;
    if (mode === "server" && shouldEmit) {
      emitQuery({
        sort: null,
        order: null,
        page: pagination.currentPage,
        pageSize: pagination.pageSize,
      });
    }
  }

  function setPage(page: number, options?: { emit?: boolean }) {
    const shouldEmit = options?.emit !== false;
    const max = Math.max(1, pagination.pagesCount || 1);
    const next = Math.min(Math.max(1, page), max);
    pagination = { ...pagination, currentPage: next };
    scrollTop = 0;
    if (mode === "server" && shouldEmit) {
      const sortParams = getSortQueryParams();
      emitQuery({
        page: next,
        pageSize: pagination.pageSize,
        ...sortParams,
      });
    }
  }

  function setPageSize(size: number, options?: { emit?: boolean }) {
    const shouldEmit = options?.emit !== false;
    const pageSize = Math.max(1, size);
    pagination = {
      ...pagination,
      pageSize,
      currentPage: 1,
      pagesCount:
        mode === "client"
          ? Math.max(1, Math.ceil((pagination.totalItems || rows.length) / pageSize))
          : pagination.pagesCount,
    };
    scrollTop = 0;
    if (mode === "server" && shouldEmit) {
      const sortParams = getSortQueryParams();
      emitQuery({
        page: 1,
        pageSize,
        ...sortParams,
      });
    }
    persistLayout();
  }

  function toggleSelect(rowId: string) {
    const next = new Set(selectedIds);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    selectedIds = next;
  }

  function toggleSelectIndex(index: number) {
    const row = pageRows[index];
    if (!row) return;
    toggleSelect(getRowId(row, index));
  }

  function setSelectAll(value: boolean) {
    const next = new Set(selectedIds);
    if (value) {
      pageRows.forEach((row, i) => next.add(getRowId(row, i)));
    } else {
      pageRows.forEach((row, i) => next.delete(getRowId(row, i)));
    }
    selectedIds = next;
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  function isSelected(rowId: string) {
    return selectedIds.has(rowId);
  }

  function getSelectedRows(): T[] {
    return pageRows.filter((row, i) => selectedIds.has(getRowId(row, i)));
  }

  function getSelectedIds(): string[] {
    return [...selectedIds];
  }

  function setColumnVisible(key: string, visible: boolean) {
    columns = columns.map((c) => (c.key === key ? { ...c, visible } : c));
    persistLayout();
  }

  function setColumnPin(key: string, pin: "start" | "end" | false) {
    columns = columns.map((c) => (c.key === key ? { ...c, pin } : c));
  }

  function setColumnWidth(key: string, widthPx: number) {
    const w = Math.max(48, Math.min(800, Math.round(widthPx)));
    columnWidths = { ...columnWidths, [key]: w };
    persistLayout();
  }

  function getColumnWidthStyle(key: string): string | undefined {
    const w = columnWidths[key];
    if (w == null) {
      const col = columns.find((c) => c.key === key);
      if (col?.width != null) {
        return typeof col.width === "number" ? `${col.width}px` : String(col.width);
      }
      return undefined;
    }
    return `${w}px`;
  }

  function reorderColumns(orderedKeys: string[]) {
    const map = new Map(columns.map((c) => [c.key, c]));
    const ordered: SmartTableColumn<T>[] = [];
    for (const key of orderedKeys) {
      const col = map.get(key);
      if (col) {
        ordered.push(col);
        map.delete(key);
      }
    }
    for (const col of map.values()) ordered.push(col);
    columns = ordered;
    persistLayout();
  }

  return {
    get rows() {
      return pageRows;
    },
    get columns() {
      return columns;
    },
    get visibleColumns() {
      return visibleColumns;
    },
    get pinned() {
      return pinned;
    },
    get density() {
      return density;
    },
    get viewMode() {
      return viewMode;
    },
    get sort() {
      return sort;
    },
    get multiSort() {
      return multiSort;
    },
    get pagination() {
      return pagination;
    },
    get selectedIds() {
      return selectedIds;
    },
    get selectedCount() {
      return selectedCount;
    },
    get hasSelections() {
      return hasSelections;
    },
    get allSelected() {
      return allSelected;
    },
    get someSelected() {
      return someSelected;
    },
    get isEmpty() {
      return isEmpty;
    },
    get mode() {
      return mode;
    },
    get virtual() {
      return virtual;
    },
    get cellPaddingClass() {
      return cellPaddingClass;
    },
    get columnWidths() {
      return columnWidths;
    },
    setRows,
    setColumns,
    setPaginationMeta,
    setDensity,
    setViewMode,
    setSort,
    getSortRank,
    clearSorts,
    setPage,
    setPageSize,
    toggleSelect,
    toggleSelectIndex,
    setSelectAll,
    clearSelection,
    isSelected,
    getSelectedRows,
    getSelectedIds,
    setColumnVisible,
    setColumnPin,
    setColumnWidth,
    getColumnWidthStyle,
    reorderColumns,
    persistLayout,
    setLayoutKey,
    getRowId,
  };
}
