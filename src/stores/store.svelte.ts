/** @file src/stores/store.svelte.ts
 * @description App state singleton + re-exports from domain-scoped stores.
 *
 * During migration, domain stores live in dedicated files and are re-exported here
 * so existing consumers don't break. New code should import directly from:
 *   - @stores/locale-store.svelte  (systemLanguage, contentLanguage, translationProgress)
 *   - @stores/validation-store.svelte
 *   - @stores/data-change-store.svelte
 *
 * Avatar URL: use `$derived(data.user?.avatar ?? '/Default_User.svg')` from page data.
 */

// --- Domain-scoped re-exports (new files, canonical source) ---
export { systemLanguage, contentLanguage, translationProgress } from "./locale-store.svelte";
import { _syncLanguageState } from "./locale-store.svelte";
export { validationStore } from "./validation-store.svelte";
export { dataChangeStore } from "./data-change-store.svelte";

// Re-export normalizeAvatarUrl as a utility (not a store)
export { normalizeAvatarUrl } from "./user-store.svelte";

// --- AppStore singleton — remaining transient UI state ---
class AppStore {
  _systemLanguage = $state("en");
  _contentLanguage = $state("en");

  // Cross-component shared state (3+ consumers)
  listboxValueState = $state("create"); // entry-list-multi-button, table-icons, multibutton
  tabSetState = $state(0); // collection-widget, widget config
  shouldShowNextButton = $state(false); // collections, header-edit, right-sidebar

  // Cross-component function references
  saveLayerStore = $state<() => Promise<void>>(async () => {});
  saveFunction = $state<{ fn: (args?: unknown) => unknown; reset: () => void }>({
    fn: () => {},
    reset: () => {},
  });

  // Single-consumer state — candidates for local migration
  translationStatusOpen = $state(false); // table-filter ↔ translation-status coordination
  headerActionButton = $state(false); // header-edit cancel button visibility

  get systemLanguage() {
    return this._systemLanguage;
  }
  set systemLanguage(v: string) {
    this._systemLanguage = v;
    // locale-store is statically imported above — call directly (no async microtask needed)
    _syncLanguageState(v, this._contentLanguage);
  }

  get contentLanguage() {
    return this._contentLanguage;
  }
  set contentLanguage(v: string) {
    this._contentLanguage = v;
    // locale-store is statically imported above — call directly (no async microtask needed)
    _syncLanguageState(this._systemLanguage, v);
  }
}

export const app = new AppStore();

export { toast } from "./toast.svelte.ts";
