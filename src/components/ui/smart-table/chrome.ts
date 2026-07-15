/**
 * @file src/components/ui/smart-table/chrome.ts
 * @description
 * Shared CSS class tokens so CMS tables look the same across entry-list,
 * media gallery, user admin, and access-management.
 *
 * Prefer these over one-off class strings when building admin data tables.
 */

/** Outer scroll container for table body */
export const SMART_TABLE_SCROLL =
  "table-container max-h-[calc(100dvh-12rem)] min-h-0 flex-1 overflow-auto";

/** Base table element */
export const SMART_TABLE = "table table-interactive table-hover w-full border-collapse text-sm";

/** Sticky header row bar */
export const SMART_TABLE_THEAD =
  "sticky top-0 z-10 border-b border-surface-200 bg-secondary-100 text-tertiary-500 dark:border-surface-800 dark:bg-surface-900 dark:text-primary-500";

/** Header cell label button row */
export const SMART_TABLE_TH =
  "border-e border-surface-300 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide dark:border-surface-600 sm:text-sm";

/** Body cell */
export const SMART_TABLE_TD =
  "border-e border-surface-200/50 px-2 py-2 text-center align-middle dark:border-surface-700/50";

/** Sticky pagination footer (matches entry-list) */
export const SMART_TABLE_PAGINATION_BAR =
  "sticky bottom-0 z-10 mt-1 flex shrink-0 flex-col items-center justify-center border-t border-surface-300 bg-secondary-100 py-2 dark:border-surface-700 dark:bg-surface-800 md:flex-row md:justify-between md:gap-3 md:px-4 md:py-3";

/** Selected row highlight */
export const SMART_TABLE_ROW_SELECTED = "bg-tertiary-500/15 dark:bg-primary-500/15";

/** Hover row (non-selected) */
export const SMART_TABLE_ROW_HOVER =
  "transition-colors hover:bg-surface-50 dark:hover:bg-surface-900/40";

/** Column manager strip (DnD) */
export const SMART_TABLE_COLUMN_MANAGER =
  "flex flex-col justify-center rounded-t-md border-b border-surface-200 bg-surface-100 p-2 text-center dark:border-surface-700 dark:bg-surface-800";

/** Toolbar row above the table (title + filter + actions) */
export const SMART_TABLE_TOOLBAR = "my-4 flex flex-wrap items-center justify-between gap-2";

/** Shell root (flex column fills parent) */
export const SMART_TABLE_SHELL = "flex h-full min-h-0 w-full flex-col overflow-hidden";

/** Sticky pin: logical start edge (checkbox column) */
export const SMART_TABLE_PIN_START =
  "sticky start-0 z-[5] bg-secondary-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] dark:bg-surface-900";

/** Sticky pin: logical end edge (actions column) */
export const SMART_TABLE_PIN_END =
  "sticky end-0 z-[5] bg-secondary-100 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)] dark:bg-surface-900";

/** Empty / loading body area */
export const SMART_TABLE_STATE_BODY =
  "flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center";

/**
 * Class for a pinned header/body cell.
 * @param pin - 'start' | 'end' | false
 */
export function pinCellClass(pin?: "start" | "end" | false | null): string {
  if (pin === "start") return SMART_TABLE_PIN_START;
  if (pin === "end") return SMART_TABLE_PIN_END;
  return "";
}

/**
 * Text-align utility from column.align.
 */
export function alignCellClass(align?: "start" | "center" | "end"): string {
  if (align === "start") return "text-start!";
  if (align === "end") return "text-end!";
  return "text-center!";
}
