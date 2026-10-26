/**
 * @file src/components/ui/config-tile-classes.ts
 * @description Shared surface for every tile in the `/config` icon grid.
 *
 * Core tiles (`src/routes/(app)/config/+page.svelte`) and plugin `config_grid`
 * tiles (each plugin's `config-tile.svelte`) must render as one visual family.
 * Before this constant each surface hardcoded its own background: core tiles used
 * `--admin-bg-card` (invisible against the parent card), smart-importer used
 * `dark:bg-surface-900` (darker than the card), and the hub used
 * `dark:bg-surface-800` (identical to the card). The token-based chip surface
 * below sits one elevation step above the card in both themes.
 */

/** Structural + surface classes shared by core and plugin config tiles. */
export const CONFIG_TILE_CLASS = [
  "group relative flex h-24 w-full flex-col items-center justify-center gap-2 rounded p-2 text-center",
  "border border-(--admin-border-default) bg-(--admin-bg-chip) shadow-md",
  "transition-all duration-300 ease-out",
  "hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-500/10 hover:shadow-xl",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary-500 focus-visible:ring-offset-2",
  "dark:hover:border-primary-500 dark:hover:bg-surface-700",
  "lg:h-32",
].join(" ");
