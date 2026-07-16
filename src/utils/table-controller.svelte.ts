/**
 * @file src/utils/table-controller.svelte.ts
 * @description Bridge to legacy TableController.
 *
 * ### Hardening (audit 2026-07):
 * - Migration awareness: console.warn in dev mode tracks legacy usage
 * - Transparent: extends LegacyTableController, preserving full API compatibility
 * - Migration path: Use `createSmartTable` from `@components/ui/smart-table`.
 *
 * Legacy entry re-export. Prefer:
 * - `@components/ui/smart-table` → `createSmartTable` (unified platform)
 * - `@utils/collection-filter-defs` + filter engine for schema filters
 *
 * Kept so existing imports of `TableController` continue to work.
 */

import { TableController as LegacyTableController } from "./table-controller-legacy.svelte";
import { dev } from "$app/environment";

/**
 * @deprecated Use `createSmartTable` from `@components/ui/smart-table`.
 * This wrapper provides the same API while logging legacy usage in development.
 */
export class TableController<T> extends LegacyTableController<T> {
  constructor(initialData: T[]) {
    super(initialData);

    if (dev) {
      console.warn(
        "[Migration Notice] TableController is deprecated. " +
          "Please migrate this component to `createSmartTable` from `@components/ui/smart-table`.",
      );
    }
  }
}
