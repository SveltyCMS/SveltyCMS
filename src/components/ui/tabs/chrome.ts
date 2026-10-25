/**
 * @file src/components/ui/tabs/chrome.ts
 * @description
 * One tab-strip contract for every admin surface: array-driven `Tabs`, the
 * compound `Tabs.List` / `Tabs.Trigger`, and the hand-rolled strips that need
 * badges or per-tab tooltips (user management, extensions, sync, design system).
 *
 * The strip is a flat row of underline tabs. The rule lives *inside* the row as
 * a 1 px inset shadow (`TAB_RULE`) instead of a `border-b`, so a horizontally
 * scrollable strip can still paint its active underline over the rule — an
 * `overflow-x-auto` container clips anything that hangs outside its padding box,
 * which is what made `-mb-px` unreliable.
 *
 * Features:
 * - brand accent: tertiary (blue) in light mode, primary (green) in dark mode
 * - rule via `TAB_RULE` so the 2 px active underline covers it in scrollers
 * - `TAB_STRIP_FLUSH` for rows whose parent already paints the rule
 * - logical properties only; no `border-color` overrides at call sites
 */

/** Full-width 1 px rule, painted inside the row so `overflow` cannot clip it. */
export const TAB_RULE = "shadow-[inset_0_-1px_0_0_var(--admin-border-default)]";

/** Scrollable tab strip that paints its own rule. */
export const TAB_STRIP = `flex gap-1 overflow-x-auto overflow-y-clip scrollbar-hide ${TAB_RULE}`;

/** Strip for rows whose wrapper already paints the rule (header rows, modal bars). */
export const TAB_STRIP_FLUSH = "flex gap-1 overflow-x-auto overflow-y-clip scrollbar-hide";

/** Header row that hosts the tabs plus trailing actions (rule spans the whole row). */
export const TAB_ROW = `flex items-center justify-between gap-3 px-4 pt-3 ${TAB_RULE}`;

/** Square, underline tab trigger — chrome comes from the row, not the button. */
export const TAB_TRIGGER =
  "flex items-center gap-2 whitespace-nowrap rounded-none! border-b-2 px-4 py-3 text-sm font-medium transition-colors";

/** Selected tab: brand accent (tertiary light / primary dark). */
export const TAB_TRIGGER_ACTIVE =
  "border-tertiary-500 text-tertiary-600 dark:border-primary-500 dark:text-primary-500";

/** Idle tab: admin text tokens, hairline hover. */
export const TAB_TRIGGER_INACTIVE =
  "border-transparent text-(--admin-text-muted) hover:border-surface-500/30 hover:text-(--admin-text-body)";

/**
 * Compose one trigger's classes. `extra` is appended for layout tweaks
 * (`flex-1`, `justify-center`, `gap-1.5`) without re-declaring the chrome.
 */
export function tabTrigger(active: boolean, extra = ""): string {
  const state = active ? TAB_TRIGGER_ACTIVE : TAB_TRIGGER_INACTIVE;
  return `${TAB_TRIGGER} ${state}${extra ? ` ${extra}` : ""}`;
}
