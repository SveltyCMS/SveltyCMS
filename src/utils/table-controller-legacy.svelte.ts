/**
 * @file src/utils/table-controller-legacy.svelte.ts
 * @description Hardened Legacy TableController class.
 *
 * ### Hardening (audit 2026-07):
 * - Set reactivity: mutations force new Set instance (Svelte 5 requires reassignment)
 * - Debounced URL sync: 150ms batch prevents history spam on rapid filter changes
 * - replaceState: prevents browser history stack explosion
 * - Type safety: isSorted explicitly typed as 0 | 1 | -1
 *
 * @deprecated Use `createSmartTable` from `@components/ui/smart-table` for new work.
 */

import { page } from "$app/state";
import { goto } from "$app/navigation";

/**
 * @deprecated Use `createSmartTable` from `@components/ui/smart-table`.
 */
export class TableController<T> {
  data = $state<T[]>([]);
  // 🛡️ Sets aren't reactive in Svelte 5 by default — reassign new Set on mutation
  selectedIndices = $state<Set<number>>(new Set());
  sorting = $state({ sortedBy: "", isSorted: 0 as 0 | 1 | -1 });
  filters = $state<Record<string, string>>({});

  private syncTimeout?: ReturnType<typeof setTimeout>;

  constructor(initialData: T[]) {
    this.data = initialData;
  }

  get selectAll() {
    return this.data.length > 0 && this.selectedIndices.size === this.data.length;
  }

  set selectAll(value: boolean) {
    const next = new Set<number>();
    if (value) {
      this.data.forEach((_, i) => next.add(i));
    }
    this.selectedIndices = next; // New Set triggers Svelte 5 reactivity
  }

  toggleSelect(index: number) {
    const next = new Set(this.selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this.selectedIndices = next; // New Set triggers Svelte 5 reactivity
  }

  /**
   * 🛡️ Hardened Filter Sync:
   * 150ms debounce prevents history spamming and URL-sync cycles.
   */
  updateFiltersAndSync(updates: Record<string, string | number | null>) {
    // Reactive update
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === "") delete this.filters[key];
      else this.filters[key] = String(val);
    });

    // Debounced URL sync — prevents history spam on rapid filter changes
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      const newUrl = new URL(page.url);
      Object.entries(this.filters).forEach(([key, val]) => newUrl.searchParams.set(key, val));

      goto(newUrl, {
        replaceState: true,
        keepFocus: true,
        noScroll: true,
      });
    }, 150);
  }
}
