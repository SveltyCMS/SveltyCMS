/**
 * @file tests/unit/stores/ui-store.test.ts
 * @description Unit tests for the UIStore singleton.
 *
 * Tests:
 * - UI element visibility toggling
 * - Singleton identity
 */

import { describe, expect, it } from "vitest";
import { ScreenSize } from "../../../src/stores/screen-size-store.svelte";
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

  it("opens the right sidebar and metadata footer for desktop edit mode", () => {
    ui.rightSidebarTouched = false;
    ui.updateFromContext(ScreenSize.LG, "edit");

    expect(ui.state.rightSidebar).toBe("full");
    expect(ui.state.pagefooter).toBe("full");
  });

  it("keeps the footer hidden in desktop view mode", () => {
    ui.updateFromContext(ScreenSize.LG, "view");

    expect(ui.state.rightSidebar).toBe("hidden");
    expect(ui.state.pagefooter).toBe("hidden");
  });

  it("should be a singleton", () => {
    ui.toggle("leftSidebar", "full");
    expect(ui.state.leftSidebar).toBe("full");
  });
});
