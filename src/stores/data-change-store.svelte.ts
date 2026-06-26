/**
 * @file src/stores/data-change-store.svelte.ts
 * @description Tracks whether the active form has unsaved changes vs its initial snapshot.
 *
 * Features:
 * - JSON snapshot comparison for change detection
 * - Reactive hasChanges flag
 */

class DataChangeStore {
  hasChanges = $state(false);
  initialDataSnapshot = $state("");

  setHasChanges(v: boolean) {
    this.hasChanges = v;
  }

  setInitialSnapshot(data: Record<string, unknown>) {
    this.initialDataSnapshot = JSON.stringify(data);
    this.hasChanges = false;
  }

  compareWithCurrent(currentData: Record<string, unknown>): boolean {
    if (!this.initialDataSnapshot) {
      return false;
    }
    const currentSnapshot = JSON.stringify(currentData);
    const changed = currentSnapshot !== this.initialDataSnapshot;
    if (this.hasChanges !== changed) {
      this.hasChanges = changed;
    }
    return changed;
  }

  reset() {
    this.hasChanges = false;
    this.initialDataSnapshot = "";
  }
}

export const dataChangeStore = new DataChangeStore();
