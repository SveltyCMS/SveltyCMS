/**
 * @file src/stores/hydration.svelte.ts
 * @description Single source of truth for the SSR -> hydration boundary.
 *
 * SvelteKit paints the SSR HTML before Svelte attaches listeners, so an
 * interaction issued in that window is a silent no-op: the element is attached
 * and visible, the handler simply is not wired yet. Controls that must not be
 * touched early bind `disabled` to `hydration.hydrated`, and the same call that
 * enables them publishes `<html data-hydrated="true">` — the state and the
 * attribute cannot diverge because `markHydrated()` owns both.
 *
 * SSR-safe: `hydrated` starts false and only ever flips in the browser, so the
 * server always ships the gated markup.
 *
 * @example
 * import { hydration } from '@src/stores/hydration.svelte';
 * <Button disabled={!hydration.hydrated} onclick={openAddModal}>Add</Button>
 */

/** Attribute stamped on `<html>` once the client has taken over the SSR tree. */
export const HYDRATION_ATTRIBUTE = "data-hydrated";

/** Value that attribute carries once hydration completed. */
export const HYDRATION_VALUE = "true";

class HydrationStore {
  /** False in the server-rendered HTML, true from the first hydrated client tick. */
  hydrated = $state(false);

  /**
   * Publish hydration: stamp the attribute and flip the state in one call, so a
   * control bound to `hydrated` enables in the same tick the marker appears.
   * No-ops on the server (there is no document and no client to enable).
   */
  markHydrated(): void {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute(HYDRATION_ATTRIBUTE, HYDRATION_VALUE);
    this.hydrated = true;
  }
}

/** Process-wide singleton — one document per page load. */
export const hydration = new HydrationStore();
