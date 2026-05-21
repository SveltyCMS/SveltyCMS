/**
 * @file src/stores/pinned-store.svelte.ts
 * @description
 * Reactive pinning store that persists user-selected collections and media folders in localStorage.
 *
 * Responsibilities include:
 * - Storing a list of pinned items.
 * - Providing methods to check, pin, unpin, or toggle pin status.
 * - Persisting items locally.
 *
 * ### Features:
 * - Svelte 5 reactive state
 * - LocalStorage persistence
 * - Collection and Folder node type support
 */

import { browser } from "$app/environment";

export interface PinnedItem {
  id: string;
  name: string;
  type: "collection" | "folder";
  path: string;
  icon?: string;
}

class PinnedStore {
  items = $state<PinnedItem[]>([]);

  constructor() {
    if (browser) {
      this.load();
    }
  }

  load() {
    try {
      const stored = localStorage.getItem("sveltycms_pinned_items");
      if (stored) {
        this.items = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load pinned items from localStorage:", e);
    }
  }

  save() {
    try {
      localStorage.setItem("sveltycms_pinned_items", JSON.stringify(this.items));
    } catch (e) {
      console.error("Failed to save pinned items to localStorage:", e);
    }
  }

  pin(item: PinnedItem) {
    if (!this.items.some((i) => i.id === item.id)) {
      this.items.push(item);
      this.save();
    }
  }

  unpin(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
  }

  isPinned(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  togglePin(item: PinnedItem) {
    if (this.isPinned(item.id)) {
      this.unpin(item.id);
    } else {
      this.pin(item);
    }
  }
}

export const pinnedStore = new PinnedStore();
