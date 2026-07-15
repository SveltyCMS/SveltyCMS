/**
 * @file tests/unit/layout-state-prefs.test.ts
 * @description Unit tests for per-user layout preference conversion utilities.
 */

import { describe, expect, it } from "vitest";
import {
  applyLayoutPrefsToUiState,
  diffLayoutPrefsFromTenant,
  uiStateToLayoutPrefs,
  uiVisibilityToLayoutPref,
} from "@utils/layout-state-prefs";
import type { UIState } from "@stores/ui-store.svelte";

function baseUiState(overrides: Partial<UIState> = {}): UIState {
  return {
    leftSidebar: "full",
    rightSidebar: "hidden",
    pageheader: "hidden",
    pagefooter: "hidden",
    header: "hidden",
    footer: "hidden",
    chatPanel: "hidden",
    ...overrides,
  };
}

describe("layout-state-prefs", () => {
  it("maps collapsed visibility to full for persistence", () => {
    expect(uiVisibilityToLayoutPref("collapsed")).toBe("full");
    expect(uiVisibilityToLayoutPref("full")).toBe("full");
    expect(uiVisibilityToLayoutPref("hidden")).toBe("hidden");
  });

  it("converts ui state to layout prefs", () => {
    expect(
      uiStateToLayoutPrefs(
        baseUiState({
          leftSidebar: "collapsed",
          rightSidebar: "full",
          pageheader: "hidden",
        }),
      ),
    ).toEqual({
      leftSidebar: "full",
      rightSidebar: "full",
      pageheader: "hidden",
      pagefooter: "hidden",
      header: "hidden",
      footer: "hidden",
    });
  });

  it("applies stored prefs to ui state", () => {
    const target = baseUiState();
    applyLayoutPrefsToUiState({ leftSidebar: "hidden", pageheader: "full" }, target);
    expect(target.leftSidebar).toBe("hidden");
    expect(target.pageheader).toBe("full");
    expect(target.rightSidebar).toBe("hidden");
  });

  it("diffs only keys that diverge from tenant defaults", () => {
    const current = uiStateToLayoutPrefs(baseUiState({ leftSidebar: "hidden" }));
    expect(diffLayoutPrefsFromTenant(current, { layoutState: { leftSidebar: "full" } })).toEqual({
      leftSidebar: "hidden",
    });
    expect(diffLayoutPrefsFromTenant(current, { layoutState: { leftSidebar: "hidden" } })).toEqual(
      {},
    );
  });
});
