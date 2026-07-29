/**
 * @file src/utils/bounce-detector.ts
 * @description Hardened bounce detection for behavioral reinforcement.
 *
 * ### Hardening (audit 2026-07):
 * - navigator.sendBeacon: ensures delivery even if tab closes during navigation
 * - Request storm protection: 5s debounce prevents API spam from rapid navigation
 * - State robustness: simplified pathname check (no stale _entryPath variable)
 *
 * Client-side bounce detection for Skinnerian behavioral reinforcement.
 * Tracks page entry timestamps and detects when users bounce back from a page
 * within 2 seconds — signaling that the navigation prediction was incorrect.
 *
 * ONLY fires on actual page transitions (different pathname), NOT on
 * filter/sort/pagination/search-param changes.
 */

import { browser } from "$app/environment";
import { beforeNavigate, afterNavigate } from "$app/navigation";

const BOUNCE_THRESHOLD_MS = 2000;
const DEBOUNCE_PENALTY_MS = 5000;

let _entryTime = 0;
let _lastPenaltyTime = 0;
let _initialized = false;

export function initBounceDetector(): void {
  if (!browser || _initialized) return;
  _initialized = true;

  afterNavigate(({ to }) => {
    if (to?.url.pathname) {
      _entryTime = performance.now();
    }
  });

  beforeNavigate(({ from, to }) => {
    if (!from || !to || _entryTime === 0) return;

    // Only fire on distinct pathname transitions
    if (from.url.pathname === to.url.pathname) return;

    const timeOnPage = performance.now() - _entryTime;

    if (timeOnPage < BOUNCE_THRESHOLD_MS) {
      triggerPenalty(from.url.pathname, to.url.pathname);
    }
  });
}

/** 🛡️ Hardened: Throttled penalty trigger */
function triggerPenalty(fromPath: string, toPath: string): void {
  const now = performance.now();
  if (now - _lastPenaltyTime < DEBOUNCE_PENALTY_MS) return;

  _lastPenaltyTime = now;
  penalizeBounce(fromPath, toPath);
}

async function penalizeBounce(fromPath: string, toPath: string): Promise<void> {
  try {
    // 🛡️ sendBeacon ensures delivery even if the user closes the tab
    const data = JSON.stringify({ fromPath, toPath });
    const blob = new Blob([data], { type: "application/json" });
    navigator.sendBeacon("/api/system/penalize-bounce", blob);
  } catch {
    // Silent fail
  }
}
