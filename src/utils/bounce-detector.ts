/**
 * @file src/utils/bounce-detector.ts
 * @description Client-side bounce detection for Skinnerian behavioral reinforcement.
 *
 * Tracks page entry timestamps and detects when users bounce back from a page
 * within 2 seconds — signaling that the navigation prediction was incorrect.
 * Calls penalizeTransition() to reduce that path's score in the behavioral learner.
 *
 * ONLY fires on actual page transitions (different pathname), NOT on
 * filter/sort/pagination/search-param changes — avoiding false penalty signals.
 *
 * Wired into +layout.svelte via beforeNavigate/afterNavigate hooks.
 */

import { browser } from "$app/environment";
import { beforeNavigate, afterNavigate } from "$app/navigation";

// ─── Constants ─────────────────────────────────────────────────────────────

const BOUNCE_THRESHOLD_MS = 2000; // Bounce = left page within 2 seconds

// ─── State ─────────────────────────────────────────────────────────────────

let _entryTime = 0;
let _entryPath = "";
let _entryFrom = "";
let _initialized = false;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize bounce detection. Call once in +layout.svelte onMount.
 * Uses SvelteKit navigation hooks to track entry/exit timing.
 */
export function initBounceDetector(): void {
  if (!browser || _initialized) return;
  _initialized = true;

  // Record entry time when a new page loads
  afterNavigate(({ to }) => {
    if (to) {
      _entryTime = performance.now();
      _entryPath = to.url.pathname;
    }
  });

  // On next navigation: check if user bounced from previous page
  beforeNavigate(({ from, to }) => {
    if (!from || !to || _entryTime === 0) return;

    // Only fire on actual page transitions (different pathname)
    // Skip filter/sort/pagination/search-param-only changes
    if (from.url.pathname !== _entryPath) return;
    if (from.url.pathname === to.url.pathname) return; // Same page, different params

    const timeOnPage = performance.now() - _entryTime;

    // Bounce detected: user navigated away within threshold
    if (timeOnPage < BOUNCE_THRESHOLD_MS) {
      penalizeBounce(_entryFrom || from.url.pathname, _entryPath);
    }

    // Track where we came from for the NEXT page's entry
    _entryFrom = from.url.pathname;
    _entryTime = 0; // Reset — afterNavigate on next page will set new entry time
  });
}

// ─── Internal ──────────────────────────────────────────────────────────────

async function penalizeBounce(fromPath: string, toPath: string): Promise<void> {
  try {
    await fetch("/api/system/penalize-bounce", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fromPath, toPath }),
    });
  } catch {
    // skip silently
  }
}

// ─── Debug ─────────────────────────────────────────────────────────────────

/**
 * Get current page dwell time for dashboard/debugging.
 */
export function getTimeOnPage(): number {
  if (_entryTime === 0) return 0;
  return performance.now() - _entryTime;
}
