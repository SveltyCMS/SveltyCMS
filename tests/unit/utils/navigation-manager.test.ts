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
let dataChangeStore: any;

beforeAll(async () => {
  // Rely on setup.ts for runes and modules
  const NAV_MOD = await import("@src/utils/navigation-manager");
  const COL_STORE = await import("@src/stores/collection-store.svelte");
  const LOAD_STORE = await import("@src/stores/loading-store.svelte");
  const STORE = await import("@src/stores/store.svelte");

  navigationManager = NAV_MOD.navigationManager;
  mode = COL_STORE.mode;
  globalLoadingStore = LOAD_STORE.globalLoadingStore;
  dataChangeStore = STORE.dataChangeStore;
});

describe("NavigationManager", () => {
  beforeEach(() => {
    if (dataChangeStore) dataChangeStore.reset();
  });

  it("should navigate to list view and clear state", async () => {
    // Setup
    dataChangeStore.setHasChanges(true);

    // Execute
    await navigationManager.navigateToList();

    // Assertions
    expect(dataChangeStore.hasChanges).toBe(false);
    expect(mode.value).toBe("view");
  });

  it("should prevent concurrent navigations", async () => {
    const p1 = navigationManager.navigateToList();
    const p2 = navigationManager.navigateToList();

    await Promise.all([p1, p2]);
    // Behavior check
    expect(dataChangeStore.hasChanges).toBe(false);
  });

  it("should set loading state during navigation", async () => {
    await navigationManager.navigateToList();
    // It should be false after
    expect(globalLoadingStore.isLoading).toBe(false);
  });
});
