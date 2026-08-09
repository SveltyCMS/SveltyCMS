/**
 * @file src/components/ui/smart-table/index.ts
 * @description Public API for the unified Smart Table platform.
 *
 * Prefer this entry for new tables. Legacy paths still work:
 * - `@components/ui/table.svelte` — design-system shell
 * - `@components/system/table/*` — CMS wrappers (re-export shared primitives)
 * - `collection-display/entry-list.svelte` — CMS collection adapter
 */

export { createSmartTable, type SmartTableApi } from "./create-smart-table.svelte";
export type {
  ColumnAlign,
  ColumnFilterHint,
  ColumnPin,
  CreateSmartTableOptions,
  PinnedColumnGroups,
  SmartTableColumn,
  SmartTableColumnMeta,
  SmartTableLayoutPrefs,
  SmartTablePagination,
  SmartTableSort,
  TableDataMode,
  TableDensity,
  TableSortOrder,
  VirtualWindow,
} from "./types";
export {
  SMART_TABLE,
  SMART_TABLE_COLUMN_MANAGER,
  SMART_TABLE_PAGINATION_BAR,
  SMART_TABLE_PIN_END,
  SMART_TABLE_PIN_START,
  SMART_TABLE_ROW_HOVER,
  SMART_TABLE_ROW_SELECTED,
  SMART_TABLE_SCROLL,
  SMART_TABLE_SHELL,
  SMART_TABLE_STATE_BODY,
  SMART_TABLE_TD,
  SMART_TABLE_TH,
  SMART_TABLE_THEAD,
  SMART_TABLE_TOOLBAR,
  alignCellClass,
  pinCellClass,
} from "./chrome";
export {
  isValidDensity,
  loadTableLayout,
  mergeLayoutIntoColumns,
  saveTableLayout,
} from "./layout-prefs";
