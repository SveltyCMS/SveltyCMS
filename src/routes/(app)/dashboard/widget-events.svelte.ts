/**
 * @file src/routes/(app)/dashboard/widget-events.svelte.ts
 * @description Centralized reactive event bus for SveltyCMS dashboard widgets using Svelte 5 runes.
 *
 * Features:
 * - Coordinated "Refresh All" trigger with staggered execution
 * - Reactive dashboard density state ('normal' | 'compact')
 * - Active preset tracking
 * - No DOM or window pollution
 */

export type DashboardDensity = "normal" | "compact";

class DashboardEventBus {
  /** Counter incremented whenever a global refresh is requested */
  refreshTrigger = $state<number>(0);

  /** Dashboard layout density ('normal' = 160px rows, 'compact' = 120px rows) */
  density = $state<DashboardDensity>("normal");

  /** Whether a global refresh is currently in progress */
  isRefreshingAll = $state<boolean>(false);

  /** Mounted widgets that can report completion for a global refresh. */
  #activeWidgets = 0;
  #pendingSettles = 0;

  /**
   * Register a mounted widget so `triggerRefreshAll` can wait for it.
   * Returns the unregister function for `$effect` cleanup.
   */
  registerWidget(): () => void {
    this.#activeWidgets += 1;
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.#activeWidgets = Math.max(0, this.#activeWidgets - 1);
    };
  }

  /**
   * Request all active widgets to refresh their data.
   * The button stays disabled until every mounted widget reports completion;
   * a 10s fallback prevents a stuck indicator if one widget never settles.
   */
  triggerRefreshAll(): void {
    if (this.isRefreshingAll) return;
    this.isRefreshingAll = true;
    this.#pendingSettles = this.#activeWidgets;
    this.refreshTrigger += 1;

    if (this.#pendingSettles === 0) {
      this.isRefreshingAll = false;
      return;
    }

    setTimeout(() => {
      this.isRefreshingAll = false;
    }, 10_000);
  }

  /** Called by a widget after its global-triggered refresh settles. */
  widgetRefreshSettled(): void {
    if (!this.isRefreshingAll) return;
    this.#pendingSettles -= 1;
    if (this.#pendingSettles <= 0) {
      this.isRefreshingAll = false;
    }
  }

  /**
   * Toggle or set the grid density.
   */
  setDensity(newDensity: DashboardDensity): void {
    this.density = newDensity;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("svelty_dashboard_density", newDensity);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Initialize saved density from localStorage.
   */
  init(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem("svelty_dashboard_density");
        if (saved === "normal" || saved === "compact") {
          this.density = saved;
        }
      } catch {
        // Ignore
      }
    }
  }
}

export const dashboardEvents = new DashboardEventBus();
