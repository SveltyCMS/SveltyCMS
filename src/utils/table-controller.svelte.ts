/**
 * @file src/utils/table-controller.svelte.ts
 * @description
 * Legacy entry re-export. Prefer:
 * - `@components/ui/smart-table` → `createSmartTable` (unified platform)
 * - `@utils/collection-filter-defs` + filter engine for schema filters
 *
 * Kept so existing imports of `TableController` continue to work.
 */

export { TableController } from "./table-controller-legacy.svelte";
