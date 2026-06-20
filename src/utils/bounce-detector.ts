/**
 * @file src/utils/bounce-detector.ts
 * @description Client-side bounce detection for Skinnerian behavioral reinforcement.
 *
 * Tracks page entry timestamps and detects when users bounce back from a page
 * within 2 seconds — signaling that the navigation prediction was incorrect.
 * Calls penalizeTransition() on the behavioral learner to reduce that path's score.
 *
 * Wired into +layout.svelte via beforeNavigate/afterNavigate hooks.
 */

import { browser } from "$app/environment";
import { beforeNavigate, afterNavigate } from "$app/navigation";

// ─── State ─────────────────────────────────────────────────────────────────

let _entryTime = 0;
let _entryPath = "";
let _entryFrom = "";
let _initialized = false;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize bounce detection. Call once in +layout.svelte onMount.
 */
export function initBounceDetector(): void {
  if (!browser || _initialized) return;
  _initialized = true;

  // Record entry time when page loads
  afterNavigate(({ to }) => {
    if (to) {
      _entryTime = performance.now();
      _entryPath = to.url.pathname;
    }
  });

  // On next navigation: check if user bounced from previous page
  beforeNavigate(({ from, to, cancel }) => {
    if (!from || !to || _entryTime === 0) return;
    if (from.url.pathname !== _entryPath) return;

    const timeOnPage = performance.now() - _entryTime;

    // Bounce detected: user left within 2 seconds
    if (timeOnPage < 2000) {
      // Try to get tenant context from page store
      try {
        const { page } = require("$app/state") as any;
        const tenantId = page?.data?.tenantId || "global";

        import("@src/services/intelligence/behavioral-learner")
          .then(({ penalizeTransition }) => {
            penalizeTransition(tenantId, _entryFrom || from.url.pathname, _entryPath);
          })
          .catch(() => {});
      } catch {
        // Page store not available — skip
      }
    }

    // Track where we came from for the NEXT page's entry
    _entryFrom = from.url.pathname;
    _entryTime = 0; // Reset — will be set by afterNavigate on the new page
  });
}

/**
 * Get the time spent on the current page (for debugging/dashboard).
 */
export function getTimeOnPage(): number {
  if (_entryTime === 0) return 0;
  return performance.now() - _entryTime;
}
