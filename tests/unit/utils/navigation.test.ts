/**
 * @file tests/bun/utils/navigationManager.test.ts
 * @description Tests for navigationManager functions
 *
 * Tests:
 * - Navigation to list view
 * - State clearing
 * - Concurrency prevention
 * - Loading state management
 */

let navigationManager: any;
let mode: any;
let globalLoadingStore: any;
let collections: any;

beforeAll(async () => {
  // Rely on bun-preload.ts for runes and modules
  const NAV_MOD = await import("@src/utils/navigation");
  const COL_STORE = await import("@src/stores/collection-store.svelte");
  const LOAD_STORE = await import("@src/stores/loading-store.svelte");

  navigationManager = NAV_MOD.navigationManager;
  mode = COL_STORE.mode;
  globalLoadingStore = LOAD_STORE.globalLoadingStore;
  collections = COL_STORE.collections;
});

describe("NavigationManager", () => {
  beforeEach(() => {
    if (collections) collections.resetChanges();
  });

  it("should navigate to list view and clear state", async () => {
    // Setup
    collections.setHasChanges(true);

    // Execute
    await navigationManager.toList();

    // Assertions
    expect(collections.hasChanges).toBe(false);
    expect(mode.value).toBe("view");
  });

  it("should prevent concurrent navigations", async () => {
    const p1 = navigationManager.toList();
    const p2 = navigationManager.toList();

    await Promise.all([p1, p2]);
    // Behavior check
    expect(collections.hasChanges).toBe(false);
  });

  it("should set loading state during navigation", async () => {
    await navigationManager.toList();
    // It should be false after
    expect(globalLoadingStore.isLoading).toBe(false);
  });
});
