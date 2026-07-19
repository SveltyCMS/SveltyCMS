/**
 * @file src/utils/connection-detector.ts
 * @description Hardened network quality detector with memory-safe lifecycle management.
 *
 * ### Hardening (audit 2026-07):
 * - Memory leak prevention: init() returns cleanup function for event listeners
 * - Centralized updateState: single function for both init and change listener (no split-brain)
 * - ensureInitialized() helper: DRY lazy-init across all exported functions
 * - Defensive conn access: optional chaining throughout (Network Info API not universal)
 *
 * Detects slow or metered connections and provides utilities for disabling
 * bandwidth-intensive features (preloading, realtime streaming, animations).
 */

import { browser } from "$app/environment";

interface NavigatorConnection {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

type ConnectionQuality = "slow-2g" | "2g" | "3g" | "4g" | "unknown";

class ConnectionState {
  effectiveType = $state<ConnectionQuality>("unknown");
  downlink = $state<number>(0);
  rtt = $state<number>(0);
  saveData = $state<boolean>(false);
  isOnline = $state<boolean>(true);
  initialized = $state<boolean>(false);

  isSlow = $derived(
    this.effectiveType === "slow-2g" || this.effectiveType === "2g" || this.saveData,
  );

  isDegraded = $derived(this.isSlow || this.rtt > 400);

  /** 🛡️ Hardened: Idempotent initialization with cleanup capability */
  init() {
    if (!browser || this.initialized) return;

    const conn = (navigator as any).connection as NavigatorConnection | undefined;
    this.isOnline = navigator.onLine;

    // 🛡️ Centralized update for consistency across init and listener
    const updateState = () => {
      if (conn) {
        this.effectiveType = (conn.effectiveType as ConnectionQuality) ?? "unknown";
        this.downlink = conn.downlink ?? 0;
        this.rtt = conn.rtt ?? 0;
        this.saveData = conn.saveData ?? false;
      }
      this.isOnline = navigator.onLine;
    };

    updateState();

    // 🛡️ Named functions for cleanup
    const handleOnline = () => {
      this.isOnline = true;
    };
    const handleOffline = () => {
      this.isOnline = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    conn?.addEventListener?.("change", updateState);

    this.initialized = true;

    // 🛡️ Return cleanup for memory-safe lifecycle
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      conn?.removeEventListener?.("change", updateState);
    };
  }
}

export const connectionState = new ConnectionState();

/** 🛡️ Hardened: Single lazy-init helper (DRY) */
function ensureInitialized() {
  if (browser && !connectionState.initialized) connectionState.init();
}

export function shouldSkipPreload(): boolean {
  if (!browser) return true;
  ensureInitialized();
  return connectionState.isSlow || !connectionState.isOnline;
}

export function shouldDisableRealtime(): boolean {
  if (!browser) return true;
  ensureInitialized();
  return connectionState.isDegraded || !connectionState.isOnline;
}

export function shouldReduceMotion(): boolean {
  if (!browser) return true;
  ensureInitialized();
  if (connectionState.isSlow) return true;

  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function getRecommendedImageQuality(): number {
  if (!browser) return 1.0;
  ensureInitialized();

  switch (connectionState.effectiveType) {
    case "slow-2g":
      return 0.3;
    case "2g":
      return 0.5;
    case "3g":
      return 0.8;
    default:
      return 1.0;
  }
}

export function getRecommendedBatchSize(): number {
  if (!browser) return 50;
  ensureInitialized();

  switch (connectionState.effectiveType) {
    case "slow-2g":
      return 5;
    case "2g":
      return 10;
    case "3g":
      return 25;
    default:
      return 100;
  }
}
