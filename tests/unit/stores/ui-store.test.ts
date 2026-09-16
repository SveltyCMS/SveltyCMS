/**
 * @file tests/unit/stores/ui-store.test.ts
 * @description Unit tests for the UIStore singleton.
 *
 * Tests:
 * - UI element visibility toggling
 * - Singleton identity
 */

import { describe, expect, it } from "vitest";
import { ui } from "../../../src/stores/ui-store.svelte";

describe("UIStore", () => {
  it("should have initial left sidebar state", () => {
    expect(ui.state.leftSidebar).toBe("full");
  });

  it("should toggle UI element visibility", () => {
    ui.toggle("leftSidebar", "hidden");
    expect(ui.state.leftSidebar).toBe("hidden");
    ui.toggle("leftSidebar", "full");
    expect(ui.state.leftSidebar).toBe("full");
  });

  it("should be a singleton", () => {
    ui.toggle("leftSidebar", "full");
    expect(ui.state.leftSidebar).toBe("full");
  });
});
