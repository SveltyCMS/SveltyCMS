/**
 * @file src/utils/table-controller.svelte.ts
 * @module
 * @description A reusable, Svelte 5 runes-based controller for managing complex client-side state
 * (selection, sorting, filtering, pagination) in a data-intensive table component.
 * This pattern encapsulates business logic into a class, separating it from the presentation layer.
 *
 * @template T The data type of the entries managed by the controller.
 * @param {T[]} initialData The initial array of data entries.
 */
import { page } from "$app/state";
import { goto } from "$app/navigation";

export class TableController<T> {
  // State variables powered by $state() for deep, granular reactivity.
  data = $state<T[]>([]);
  selectedIndices = $state(new Set<number>());

  // Sorting state: e.g., { sortedBy: 'field_name', isSorted: 1 | -1 }
  sorting = $state({ sortedBy: "", isSorted: 0 });

  // Filters state: e.g., { name: 'value', status: 'active' }
  filters = $state<Record<string, string>>({});

  constructor(initialData: T[]) {
    this.data = initialData;
  }

  /** Getter to check if all records are selected. */
  get selectAll() {
    return this.data.length > 0 && this.selectedIndices.size === this.data.length;
  }

  /** Setter for selecting all records. */
  set selectAll(value: boolean) {
    if (value) {
      this.selectedIndices = new Set(this.data.map((_, i) => i));
    } else {
      this.selectedIndices.clear();
    }
  }

  /** Toggles selection status for a given index. */
  toggleSelect(index: number) {
    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
  }

  /**
   * Updates the controller's state and synchronizes the URL query parameters.
   * @param updates A map of filter/sort parameters to update.
   */
  updateFiltersAndSync(updates: Record<string, string | number | null>) {
    // 1. Update local state
    Object.assign(this.filters, updates);

    // 2. Update URL for deep linking and state persistence
    const newUrl = new URL(page.url);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        newUrl.searchParams.delete(key);
      } else {
        // Ensure keys are URL-safe
        newUrl.searchParams.set(key, String(value));
      }
    });

    // Use goto to update the URL state without triggering a full page reload
    // (assuming the component is inside a SvelteKit page context).
    goto(newUrl, { keepFocus: true, noScroll: true });
  }
}
