/**
 * @file src/components/ui/smart-table/types.ts
 * @description
 * Shared types for the unified Smart Table platform.
 * Used by design-system tables (`ui/table`) and CMS tables (`entry-list`).
 *
 * ### Modes
 * - `client` — sort/filter/page in-browser (admin widgets, simple lists)
 * - `server` — data is already a page slice; URL/SSR owns filter/sort/page
 *   (collection entry-list, media gallery, large tenant tables)
 *
 * ### Column meta (TanStack-style)
 * Optional pin / align / filter hints drive chrome without hard-coding per page.
 */

export type TableDensity = "compact" | "normal" | "comfortable";

/** 0 = unsorted, 1 = asc, -1 = desc (CMS convention). */
export type TableSortOrder = 0 | 1 | -1;

export type TableDataMode = "client" | "server";

/** Logical pin edges (RTL-friendly; maps to sticky start/end). */
export type ColumnPin = "start" | "end" | false;

export type ColumnAlign = "start" | "center" | "end";

/** Hint for filter control / cell renderer selection. */
export type ColumnFilterHint = "text" | "select" | "date" | "numberRange" | "boolean" | "none";

export interface SmartTableColumnMeta {
  /** Cell renderer id (status, avatar, date, …) */
  cell?: string;
  /** Filter control hint */
  filter?: ColumnFilterHint;
  /** Extra free-form metadata for adapters */
  [key: string]: unknown;
}

export interface SmartTableColumn<T = Record<string, unknown>> {
  /** Stable column id / data key */
  key: string;
  /** Header label */
  label: string;
  /** Enable header sort control */
  sortable?: boolean;
  /** Show column (column manager) */
  visible?: boolean;
  /** Optional width (px or CSS) */
  width?: string | number;
  /** Minimum width for resize / pin layouts */
  minWidth?: string | number;
  /** Widget / cell type hint (status, date, …) — prefer meta.cell for new code */
  cellType?: string;
  /** Sticky pin to start or end edge */
  pin?: ColumnPin;
  /** Text alignment in th/td */
  align?: ColumnAlign;
  /** Extra class on th/td */
  class?: string;
  /** TanStack-style extensible metadata */
  meta?: SmartTableColumnMeta;
  /** Optional accessor when key is not a flat property */
  accessor?: (row: T) => unknown;
}

export interface SmartTablePagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  pagesCount: number;
}

export interface SmartTableSort {
  sortedBy: string;
  isSorted: TableSortOrder;
}

/** Persisted column layout (localStorage / future user prefs API). */
export interface SmartTableLayoutPrefs {
  density?: TableDensity;
  columnOrder?: string[];
  visibility?: Record<string, boolean>;
  /** Pixel widths keyed by column key */
  columnWidths?: Record<string, number>;
  pageSize?: number;
}

export interface CreateSmartTableOptions<T> {
  /** Row identity for selection (default: `_id` || `id` || index) */
  getRowId?: (row: T, index: number) => string;
  /** client = local ops; server = SSR/URL-driven (default server for CMS safety) */
  mode?: TableDataMode;
  /** Enable virtualization when row count exceeds threshold */
  virtualizeThreshold?: number;
  /** Fixed row height for virtual scroll (px) */
  rowHeight?: number;
  /** Extra rows above/below viewport */
  virtualBuffer?: number;
  /** Initial density */
  density?: TableDensity;
  /** Initial page size (client mode) */
  pageSize?: number;
  /** Initial sort (e.g. website-tokens default createdAt desc) */
  initialSort?: SmartTableSort;
  /** Optional localStorage key for density/order/visibility */
  layoutKey?: string;
  /**
   * Sync page/sort/filter keys to the URL or trigger server refetch (server mode).
   * When provided, controller calls this after sort/page/pageSize changes.
   */
  onQueryChange?: (updates: Record<string, string | number | null>) => void;
}

export interface VirtualWindow<T> {
  enabled: boolean;
  startIndex: number;
  endIndex: number;
  visibleRows: T[];
  spacerTop: number;
  spacerBottom: number;
  onScroll: (scrollTop: number, containerHeight: number) => void;
}

export interface PinnedColumnGroups<T = Record<string, unknown>> {
  start: SmartTableColumn<T>[];
  center: SmartTableColumn<T>[];
  end: SmartTableColumn<T>[];
  /** start + center + end */
  ordered: SmartTableColumn<T>[];
}
