/**
 * @file tests/unit/stores/mode-transition-guard.test.ts
 * @description Tests for the mode transition guard state machine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the underlying collection-store mode
const mockMode = { value: "view" as string };
const mockSetMode = vi.fn();
const mockDataChangeStore = { hasChanges: false };

vi.mock("@src/stores/collection-store.svelte", () => ({
  mode: {
    get value() {
      return mockMode.value;
    },
    set value(v: string) {
      mockMode.value = v;
    },
  },
  setMode: mockSetMode,
}));

vi.mock("@src/stores/store.svelte", () => ({
  dataChangeStore: {
    get hasChanges() {
      return mockDataChangeStore.hasChanges;
    },
  },
}));

describe("ModeTransitionGuard", () => {
  let modeTransitionGuard: typeof import("@src/stores/mode-transition-guard.svelte").modeTransitionGuard;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMode.value = "view";
    mockDataChangeStore.hasChanges = false;
    const mod = await import("@src/stores/mode-transition-guard.svelte");
    modeTransitionGuard = mod.modeTransitionGuard;
  });

  describe("setMode (instant, no validation)", () => {
    it("should set mode via setMode directly", () => {
      modeTransitionGuard.setMode("edit");
      expect(mockSetMode).toHaveBeenCalledWith("edit");
    });

    it("should allow any mode change without validation", () => {
      mockMode.value = "edit";
      mockDataChangeStore.hasChanges = true;
      modeTransitionGuard.setMode("view");
      expect(mockSetMode).toHaveBeenCalledWith("view");
    });
  });

  describe("transitionTo (validated)", () => {
    it("should allow view → edit transition", async () => {
      const ok = await modeTransitionGuard.transitionTo("edit");
      expect(ok).toBe(true);
      expect(mockSetMode).toHaveBeenCalledWith("edit");
    });

    it("should allow view → create transition", async () => {
      const ok = await modeTransitionGuard.transitionTo("create");
      expect(ok).toBe(true);
    });

    it("should allow view → media transition", async () => {
      const ok = await modeTransitionGuard.transitionTo("media");
      expect(ok).toBe(true);
    });

    it("should allow media → view transition", async () => {
      mockMode.value = "media";
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(true);
    });

    it("should block edit → view with unsaved changes", async () => {
      mockMode.value = "edit";
      mockDataChangeStore.hasChanges = true;
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(false);
      expect(mockSetMode).not.toHaveBeenCalled();
    });

    it("should allow edit → view without unsaved changes", async () => {
      mockMode.value = "edit";
      mockDataChangeStore.hasChanges = false;
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(true);
    });

    it("should block create → view with unsaved changes", async () => {
      mockMode.value = "create";
      mockDataChangeStore.hasChanges = true;
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(false);
    });

    it("should be idempotent", async () => {
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(true);
      expect(mockSetMode).not.toHaveBeenCalled(); // same state
    });

    it("should force-reset to view from unexpected state", async () => {
      mockMode.value = "modify";
      const ok = await modeTransitionGuard.transitionTo("view");
      expect(ok).toBe(true);
      expect(mockSetMode).toHaveBeenCalledWith("view");
    });

    it("should reject invalid transition (not in allowed list)", async () => {
      mockMode.value = "view";
      const ok = await modeTransitionGuard.transitionTo("modify");
      expect(ok).toBe(false);
    });
  });
});
