/**
 * @file src/routes/(app)/dashboard/widget-ssr.ts
 * @description Build-time eager registry for the dashboard widgets that paint in the first screenful.
 *
 * Svelte renders the *pending* branch of `{#await}` while server-rendering (a
 * dynamic `import()` is still unresolved), so a lazily loaded widget can never
 * appear in the SSR HTML. The packages below are therefore imported statically
 * in BOTH the server and the client build: the server renders the real widget
 * tile and the client hydrates the very same component identity — no mismatch
 * and no skeleton flash.
 *
 * Every other package stays lazy (`import.meta.glob` + IntersectionObserver in
 * `+page.svelte`), so the dashboard chunk only grows by the packages below.
 *
 * ### Features
 * - eager registry keyed by `<folder>/<entryFile>` (manifest `componentName`)
 * - SSR-safe packages only: no `window`/`document` at module scope
 * - `getFirstScreenWidget()` returns `null` for everything else (lazy path)
 */

import type { Component } from "svelte";

/**
 * First-paint widget packages: the free monitoring tiles (one grid column
 * each), i.e. the default top row of the dashboard grid. Each was verified to
 * be safe to evaluate on the server — they only touch the DOM inside
 * `onMount`/`$effect`, and `BaseWidget` guards `window`/`document`/`localStorage`.
 */
const FIRST_SCREEN_MODULES = import.meta.glob<{ default: Component }>(
  [
    "./widgets/cpu/*.svelte",
    "./widgets/disk/*.svelte",
    "./widgets/memory/*.svelte",
    "./widgets/system-messages/*.svelte",
  ],
  { eager: true },
);

/** Key: `<folder>/<file-without-extension>` — e.g. `cpu/index`. */
const firstScreenWidgets = new Map<string, Component>();
for (const [path, module] of Object.entries(FIRST_SCREEN_MODULES)) {
  const match = /^\.\/widgets\/([^/]+)\/([^/]+)\.svelte$/.exec(path);
  if (match?.[1] && match[2] && module?.default) {
    firstScreenWidgets.set(`${match[1]}/${match[2]}`, module.default);
  }
}

/**
 * Resolve a widget package that is statically bundled for first paint.
 * Returns `null` for every other package — the caller keeps the lazy path.
 */
export function getFirstScreenWidget(
  folder: string,
  entryFile: string = "index",
): Component | null {
  return firstScreenWidgets.get(`${folder}/${entryFile}`) ?? null;
}
