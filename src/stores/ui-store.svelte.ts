/**
 * @file src/stores/ui-store.svelte.ts
 * @description UI visibility management using Svelte 5 runes
 *
 * Features:
 * - Class-based singleton with $state properties
 * - Single $effect.root for controlled updates
 * - Manual override timer for sidebar toggles
 *
 * Usage:
 * - ui.state - Current UIState object
 * - ui.toggle(element, visibility) - Toggle UI element
 * - ui.forceUpdate() - Force layout recalculation
 * - ui.setRouteContext(ctx) - Set special route context
 */

import { untrack } from "svelte";
import { mode } from "./collection-store.svelte";
import { ScreenSize, screen } from "./screen-size-store.svelte";

// Types for UI visibility states
export type UIVisibility = "hidden" | "collapsed" | "full";

// Interface for UI state
export interface UIState {
  chatPanel: UIVisibility;
  footer: UIVisibility;
  header: UIVisibility;
  leftSidebar: UIVisibility;
  pagefooter: UIVisibility;
  pageheader: UIVisibility;
  rightSidebar: UIVisibility;
}

/**
 * UIStore - Manages UI element visibility based on screen size and mode
 */
class UIStore {
  // Core reactive state
  state = $state<UIState>({
    leftSidebar: "hidden",
    rightSidebar: "hidden",
    pageheader: "full",
    pagefooter: "hidden",
    header: "hidden",
    footer: "hidden",
    chatPanel: "hidden",
  });

  // Route context for special layouts
  routeContext = $state({
    isImageEditor: false,
    isCollectionBuilder: false,
    isSystemSettings: false,
  });

  // UI toggles
  manualOverrideActive = $state(false);
  headerShowMore = $state(false);
  isSearchVisible = $state(false);
  isCommandBarVisible = $state(false);
  userPreferred = $state<UIVisibility>("hidden");

  // Sticky action bar: pages set their action buttons here
  stickyActionContent = $state<import("svelte").Snippet | null>(null);

  // Internal state
  private manualTimer: ReturnType<typeof setTimeout> | null = null;

  // Computed visibility getters
  get isLeftSidebarVisible(): boolean {
    return this.state.leftSidebar !== "hidden";
  }

  get isRightSidebarVisible(): boolean {
    return this.state.rightSidebar !== "hidden";
  }

  get isPageHeaderVisible(): boolean {
    return this.state.pageheader !== "hidden";
  }

  get isPageFooterVisible(): boolean {
    return this.state.pagefooter !== "hidden";
  }

  get isHeaderVisible(): boolean {
    return this.state.header !== "hidden";
  }

  get isFooterVisible(): boolean {
    return this.state.footer !== "hidden";
  }

  get isChatPanelVisible(): boolean {
    return this.state.chatPanel !== "hidden";
  }

  constructor() {
    // No-op: reactive effect is now set up at module level (top-level)
    // to comply with Svelte 5 rune rules ($effect must be at .svelte.ts top-level,
    // not inside class constructors).
  }

  /**
   * Updates UI state based on screen size and current mode
   */
  updateFromContext(size: ScreenSize, currentMode: string): void {
    // Desktop: always respect user preference for sidebar
    const isDesktop = size >= ScreenSize.LG;

    // Special routes
    if (this.routeContext.isSystemSettings) {
      if (size === ScreenSize.XS || size === ScreenSize.SM) {
        this.state.leftSidebar = "hidden";
      } else if (size === ScreenSize.MD) {
        this.state.leftSidebar = "collapsed";
      } else {
        this.state.leftSidebar = this.userPreferred;
      }
      this.state.rightSidebar = "hidden";
      this.state.pageheader = "hidden";
      this.state.pagefooter = "hidden";
      this.state.header = "hidden";
      this.state.footer = "hidden";
      return;
    }

    if (this.routeContext.isImageEditor) {
      if (isDesktop) {
        this.state.leftSidebar = this.userPreferred;
      } else {
        this.state.leftSidebar = "collapsed";
      }
      this.state.rightSidebar = "hidden";
      this.state.pageheader = "full";
      this.state.pagefooter = "full";
      this.state.header = "hidden";
      this.state.footer = "hidden";
      return;
    }

    if (this.routeContext.isCollectionBuilder) {
      if (size === ScreenSize.XS || size === ScreenSize.SM) {
        this.state.leftSidebar = "hidden";
      } else if (size === ScreenSize.MD) {
        this.state.leftSidebar = "collapsed";
      } else {
        this.state.leftSidebar = this.userPreferred;
      }
      this.state.rightSidebar = "hidden";
      this.state.pageheader = "hidden";
      this.state.pagefooter = "hidden";
      this.state.header = "hidden";
      this.state.footer = "hidden";
      return;
    }

    const showPageHeader = ["edit", "create", "modify"].includes(currentMode);

    // Mobile
    if (size === ScreenSize.XS || size === ScreenSize.SM) {
      this.state.leftSidebar = "collapsed";
      this.state.rightSidebar = "hidden";
      this.state.pageheader = showPageHeader ? "full" : "hidden";
      this.state.pagefooter = "hidden";
      this.state.header = "hidden";
      this.state.footer = "hidden";
      return;
    }

    // Tablet
    if (size === ScreenSize.MD) {
      this.state.leftSidebar = "collapsed";
      this.state.rightSidebar = "hidden";
      this.state.pageheader = showPageHeader ? "full" : "hidden";
      this.state.pagefooter = "hidden";
      this.state.header = "hidden";
      this.state.footer = "hidden";
      return;
    }

    // Desktop — always respect user preference
    this.state.leftSidebar = this.userPreferred;
    this.state.rightSidebar = "hidden";
    this.state.pageheader = showPageHeader ? "full" : "hidden";
    this.state.pagefooter = "hidden";
    this.state.header = "hidden";
    this.state.footer = "hidden";
  }

  /**
   * Toggle a UI element's visibility
   */
  toggle(element: keyof UIState, visibility: UIVisibility): void {
    this.state[element] = visibility;

    // Save sidebar preference to localStorage
    if (element === "leftSidebar") {
      this.userPreferred = visibility;
      try {
        localStorage.setItem("sveltycms_sidebar_pref", visibility);
      } catch {
        /* localStorage unavailable */
      }
    }

    // Prevent auto-updates for 600ms after manual toggle
    if (element === "leftSidebar" || element === "rightSidebar") {
      this.manualOverrideActive = true;

      if (this.manualTimer) {
        clearTimeout(this.manualTimer);
      }
      this.manualTimer = setTimeout(() => {
        this.manualOverrideActive = false;
        this.manualTimer = null;
      }, 600);
    }
  }

  /**
   * Set route context for special layouts
   */
  setRouteContext(ctx: {
    isImageEditor?: boolean;
    isCollectionBuilder?: boolean;
    isSystemSettings?: boolean;
  }): void {
    for (const key in ctx) {
      if (!Object.hasOwn(ctx, key)) {
        continue;
      }
      const k = key as keyof typeof ctx;
      if (this.routeContext[k] !== ctx[k]) {
        this.routeContext[k] = ctx[k] ?? false; // Fallback to false if undefined
      }
    }
  }

  /**
   * Force a layout update
   */
  forceUpdate(): void {
    this.updateFromContext(screen.size, mode.value);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.manualTimer) {
      clearTimeout(this.manualTimer);
      this.manualTimer = null;
    }
    moduleEffectCleanup?.();
  }
}

// Singleton instance - the main export
export const ui = new UIStore();

// --- Module-level reactive effect (must be at top-level of .svelte.ts file) ---
// This replaces the constructor-based $effect which violates Svelte 5's
// rune_outside_svelte rule (runes cannot be used inside class methods/constructors).
// The browser-only guard is INSIDE the effect callback, since runes cannot be
// wrapped in conditional blocks (if/else) at the module level either.
let moduleEffectCleanup: (() => void) | undefined;

moduleEffectCleanup = $effect.root(() => {
  // Restore sidebar preference from localStorage on init
  let hydrated = false;

  $effect(() => {
    // Only activate on the client (SSR-safe)
    if (typeof window === "undefined") return;

    if (!hydrated) {
      hydrated = true;
      try {
        const saved = localStorage.getItem("sveltycms_sidebar_pref") as UIVisibility | null;
        if (saved && ["hidden", "collapsed", "full"].includes(saved)) {
          ui.userPreferred = saved;
        }
      } catch {
        /* localStorage unavailable */
      }
    }

    const size = screen.size;
    const currentMode = mode.value;
    const CTX =
      ui.routeContext.isImageEditor ||
      ui.routeContext.isCollectionBuilder ||
      ui.routeContext.isSystemSettings;
    void CTX;

    untrack(() => {
      if (!ui.manualOverrideActive) {
        ui.updateFromContext(size, currentMode);
      }
    });
  });
});

// Backward compatibility exports for theme branch components
export function toggleUIElement(element: keyof UIState, visibility: UIVisibility): void {
  ui.toggle(element, visibility);
}

// Compatibility export for uiStateManager - wraps ui instance
export const uiStateManager = {
  get state() {
    return ui.state;
  },
  get uiState() {
    return { value: ui.state };
  },
  toggle: ui.toggle.bind(ui),
  show: (element: keyof UIState) => ui.toggle(element, "full"),
  hide: (element: keyof UIState) => ui.toggle(element, "hidden"),
};

export const setRouteContext = ui.setRouteContext.bind(ui);
