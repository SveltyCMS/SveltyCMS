/**
 * @file src/utils/connection-detector.ts
 * @description Network connection quality detection and adaptive behavior for SveltyCMS.
 *
 * Detects slow or metered connections and provides utilities for disabling
 * bandwidth-intensive features (preloading, realtime streaming, animations).
 *
 * ### Features:
 * - Effective connection type detection (slow-2g, 2g, 3g, 4g)
 * - Save-Data mode awareness
 * - Reactive Svelte 5 rune-based status
 * - SSR-safe (no navigator access on server)
 *
 * @example
 * import { connectionState, shouldSkipPreload } from '@utils/connection-detector';
 * if (shouldSkipPreload()) return; // skip hover preloading on slow connections
 */

import { browser } from "$app/environment";

// NetworkInformation API types (not fully typed in all environments)
interface NavigatorConnection {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

type ConnectionQuality = "slow-2g" | "2g" | "3g" | "4g" | "unknown";

// ── Reactive connection state ────────────────────────────
class ConnectionState {
  effectiveType = $state<ConnectionQuality>("unknown");
  downlink = $state<number>(0);
  rtt = $state<number>(0);
  saveData = $state<boolean>(false);
  isOnline = $state<boolean>(true);
  initialized = $state<boolean>(false);

  /** True if connection is considered slow (2g, slow-2g, or save-data mode) */
  isSlow = $derived(
    this.effectiveType === "slow-2g" || this.effectiveType === "2g" || this.saveData,
  );

  /** True if connection is degraded — slow OR spotty (high RTT) */
  isDegraded = $derived(
    this.isSlow || this.rtt > 400, // >400ms RTT = degraded
  );

  /** Initialize by reading navigator.connection if available */
  init() {
    if (!browser) return;
    if (this.initialized) return;

    const conn = (navigator as any).connection as NavigatorConnection | undefined;
    if (!conn) {
      this.effectiveType = "4g"; // assume fast if API unavailable
      this.initialized = true;
      return;
    }

    this.effectiveType = (conn.effectiveType as ConnectionQuality) ?? "unknown";
    this.downlink = conn.downlink ?? 0;
    this.rtt = conn.rtt ?? 0;
    this.saveData = conn.saveData ?? false;
    this.isOnline = navigator.onLine;

    // Listen for changes
    conn.addEventListener?.("change", () => {
      this.effectiveType = (conn.effectiveType as ConnectionQuality) ?? "unknown";
      this.downlink = conn.downlink ?? 0;
      this.rtt = conn.rtt ?? 0;
      this.saveData = conn.saveData ?? false;
    });

    window.addEventListener("online", () => {
      this.isOnline = true;
    });
    window.addEventListener("offline", () => {
      this.isOnline = false;
    });

    this.initialized = true;
  }
}

export const connectionState = new ConnectionState();

// ── Adaptive behavior helpers ────────────────────────────

/**
 * Should skip bandwidth-intensive features like hover preloading?
 * True on slow connections or when Save-Data is active.
 */
export function shouldSkipPreload(): boolean {
  if (!browser) return true; // SSR: never preload
  if (!connectionState.initialized) connectionState.init();
  return connectionState.isSlow || !connectionState.isOnline;
}

/**
 * Should disable realtime features (SSE, WebSocket)?
 * True on degraded connections to save bandwidth for essential operations.
 */
export function shouldDisableRealtime(): boolean {
  if (!browser) return true;
  if (!connectionState.initialized) connectionState.init();
  return connectionState.isDegraded || !connectionState.isOnline;
}

/**
 * Should reduce UI animations?
 * True on slow connections or when user prefers reduced motion.
 */
export function shouldReduceMotion(): boolean {
  if (!browser) return true;
  if (!connectionState.initialized) connectionState.init();
  if (connectionState.isSlow) return true;

  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Get recommended image quality (0.0–1.0) based on connection speed.
 * 1.0 = full quality, 0.3 = highly compressed for slow connections.
 */
export function getRecommendedImageQuality(): number {
  if (!browser) return 1.0;
  if (!connectionState.initialized) connectionState.init();

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

/**
 * Get recommended batch size for data fetching based on connection.
 * Smaller batches on slower connections to avoid timeout/bandwidth issues.
 */
export function getRecommendedBatchSize(): number {
  if (!browser) return 50;
  if (!connectionState.initialized) connectionState.init();

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
