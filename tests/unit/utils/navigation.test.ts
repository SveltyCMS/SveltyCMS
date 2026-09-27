/**
 * @file tests/unit/utils/navigation.test.ts
 * @description Tests for the navigationManager contract: mode/change-state
 * transitions, the `goto` call it emits, and loading-stack balance.
 *
 * Tests:
 * - List navigation clears unsaved changes and returns to view mode
 * - `toList()` reaches SvelteKit `goto` with the current path and refresh options
 * - `invalidate: false` is forwarded as `refreshAll: false`
 * - Overlapping navigations leave no loading entry behind
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { goto } from "$app/navigation";
import { collections, setMode } from "@src/stores/collection-store.svelte";
import { globalLoadingStore, loadingOperations } from "@src/stores/loading-store.svelte";
import { navigationManager } from "@src/utils/navigation";

const gotoMock = vi.mocked(goto);

describe("NavigationManager", () => {
  beforeEach(() => {
    gotoMock.mockClear();
    collections.resetChanges();
    setMode("view");
  });

  it("clears unsaved changes and returns to view mode", async () => {
    collections.setHasChanges(true);
    setMode("edit");
    // Guard: without this the post-conditions below hold even if toList() no-ops,
    // because `resetChanges()` already parked the store in its resting state.
    expect(collections.hasChanges).toBe(true);
    expect(collections.mode).toBe("edit");

    await navigationManager.toList();

    expect(collections.hasChanges).toBe(false);
    expect(collections.mode).toBe("view");
  });

  it("navigates to the current path, refreshing all data by default", async () => {
    await navigationManager.toList();

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith("/", { refreshAll: true, replace: false });
  });

  it("forwards invalidate: false as refreshAll: false", async () => {
    await navigationManager.toList({ invalidate: false });

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith("/", { refreshAll: false, replace: false });
  });

  it("sets the loading flag during navigation and leaves no stack entry behind", async () => {
    // The flag is only observable mid-flight, so sample it from inside the
    // navigation the manager awaits instead of after it has settled.
    let loadingDuringNavigation: boolean | null = null;
    gotoMock.mockImplementationOnce(async () => {
      loadingDuringNavigation = globalLoadingStore.isLoading;
    });

    const first = navigationManager.toList();
    const second = navigationManager.toList(); // overlap: the guard aborts the stale run
    expect(navigationManager.isNavigating).toBe(true);

    await Promise.all([first, second]);

    expect(loadingDuringNavigation).toBe(true);
    expect(navigationManager.isNavigating).toBe(false);
    expect(globalLoadingStore.isLoading).toBe(false);
    expect(globalLoadingStore.loadingStack.has(loadingOperations.navigation)).toBe(false);
  });

  it("a superseded navigation never reaches goto (abort signal is honoured)", async () => {
    // The overlap above only pins the loading bookkeeping. This pins the actual
    // cancellation: the second call aborts the first, and the stale run must bail
    // before `goto`. Without the `signal.aborted` checks both runs navigate, so the
    // call count is the falsifiable part of this test.
    const first = navigationManager.toList({ invalidate: false });
    const second = navigationManager.toList();
    await Promise.all([first, second]);

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith("/", { refreshAll: true, replace: false });
    expect(navigationManager.isNavigating).toBe(false);
  });
});
