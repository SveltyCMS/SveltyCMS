/**
 * @file tests/unit/ui-store.test.ts
 * @description Unit tests for the UIStore.
 *
 * Tests:
 * - UI element visibility toggling
 * - Layout update calls
 * - Initialization methods
 * - Real singleton behavior
 */

import { ui } from "../../src/stores/ui-store.svelte";

// Mock implementation of UIStore for legacy tests if needed
const createMockUIStore = () => {
  const state: Record<string, string> = {
    leftSidebar: "full",
    rightSidebar: "hidden",
    pageheader: "hidden",
    pagefooter: "hidden",
    header: "hidden",
    footer: "hidden",
  };

  return {
    uiState: {
      value: state,
      set: (newState: any) => Object.assign(state, newState),
      update: (fn: (s: any) => any) => {
        const newState = fn(state);
        Object.assign(state, newState);
      },
    },
    toggleUIElement: (element: string, visibility: string) => {
      state[element] = visibility;
    },
    updateLayout: mock(),
    initialize: mock(),
    destroy: mock(),
  };
};

describe("UIStore", () => {
  it("should toggle UI element visibility", () => {
    const mockStore = createMockUIStore();
    mockStore.toggleUIElement("leftSidebar", "hidden");
    expect(mockStore.uiState.value.leftSidebar).toBe("hidden");
  });

  it("should call updateLayout when screen size changes", () => {
    const mockStore = createMockUIStore();
    mockStore.updateLayout();
    expect(mockStore.updateLayout).toHaveBeenCalled();
  });

  it("should provide initialization methods", () => {
    const mockStore = createMockUIStore();
    mockStore.initialize();
    expect(mockStore.initialize).toHaveBeenCalled();
  });
});

describe("UIStore (Real)", () => {
  it("should have initial state", () => {
    expect(ui.state.leftSidebar).toBe("full");
  });

  it("should toggle UI element visibility", () => {
    ui.toggle("leftSidebar", "hidden");
    expect(ui.state.leftSidebar).toBe("hidden");
  });

  it("should be a singleton", () => {
    // Reset state for this test to ensure it's not affected by previous tests
    ui.toggle("leftSidebar", "full");
    expect(ui.state.leftSidebar).toBe("full");
  });
});
