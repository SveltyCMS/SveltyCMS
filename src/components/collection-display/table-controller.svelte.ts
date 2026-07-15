/**
 * @file src/components/collection-display/table-controller.svelte.ts
 * @description Re-exports unified Smart Table API + legacy controller.
 */

export { createSmartTable, type SmartTableApi } from "@components/ui/smart-table";
export type {
  CreateSmartTableOptions,
  SmartTableColumn,
  SmartTablePagination,
  SmartTableSort,
  TableDensity,
  TableSortOrder,
} from "@components/ui/smart-table";
export { TableController } from "@utils/table-controller.svelte";
