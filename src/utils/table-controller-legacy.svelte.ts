/**
 * @file src/utils/table-controller-legacy.svelte.ts
 * @description Legacy TableController class (selection + URL filter sync).
 * Prefer `createSmartTable` from `@components/ui/smart-table` for new work.
 */

import { page } from "$app/state";
import { goto } from "$app/navigation";

/**
 * @deprecated Use `createSmartTable` from `@components/ui/smart-table`.
 */
export class TableController<T> {
  data = $state<T[]>([]);
  selectedIndices = $state(new Set<number>());
  sorting = $state({ sortedBy: "", isSorted: 0 });
  filters = $state<Record<string, string>>({});

  constructor(initialData: T[]) {
    this.data = initialData;
  }

  get selectAll() {
    return this.data.length > 0 && this.selectedIndices.size === this.data.length;
  }

  set selectAll(value: boolean) {
    if (value) {
      this.selectedIndices = new Set(this.data.map((_, i) => i));
    } else {
      this.selectedIndices.clear();
    }
  }

  toggleSelect(index: number) {
    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
  }

  updateFiltersAndSync(updates: Record<string, string | number | null>) {
    Object.assign(this.filters, updates);
    const newUrl = new URL(page.url);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        newUrl.searchParams.delete(key);
      } else {
        newUrl.searchParams.set(key, String(value));
      }
    });
    goto(newUrl, { keepFocus: true, noScroll: true });
  }
}
