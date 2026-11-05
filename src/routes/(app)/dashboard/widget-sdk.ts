/**
 * @file src/routes/(app)/dashboard/widget-sdk.ts
 * @description Developer SDK for building SveltyCMS dashboard widgets.
 *
 * Features:
 * - Easy-to-use hooks for sandboxed fetching and isolated storage
 * - SSR-safe formatters for numbers, bytes, percentages, and timestamps
 * - Strict type safety adhering to AGENTS.md guidelines (zero any)
 */

import type { SandboxedFetcher, WidgetSandboxContext } from "./widget-contract";
import { sandboxedWidgetFetch } from "./widget-sandbox";
import { createWidgetStorage } from "./widget-storage";
import { formatTime } from "@utils/format-date";

export * from "./widget-contract";
export { isValidDashboardEndpoint, sandboxedWidgetFetch } from "./widget-sandbox";
export { createWidgetStorage } from "./widget-storage";

/**
 * Creates a complete sandbox context for a widget instance.
 */
export function createWidgetSandbox(
  widgetId: string,
  component: string,
  tenantId: string = "global",
  userId: string = "anon",
  options?: {
    onRequestRefresh?: () => Promise<void>;
    onUpdateSettings?: (settings: Record<string, unknown>) => void;
    onNotify?: (message: string, type: "info" | "success" | "warning" | "error") => void;
  },
): WidgetSandboxContext {
  const storage = createWidgetStorage(widgetId, tenantId, userId);

  const fetcher: SandboxedFetcher = <T = unknown>(
    endpoint: string,
    fetchOpts?: RequestInit,
  ): Promise<T> => {
    return sandboxedWidgetFetch<T>(endpoint, fetchOpts);
  };

  return {
    widgetId,
    component,
    get isOnline() {
      return typeof navigator !== "undefined" ? navigator.onLine : true;
    },
    get isTabVisible() {
      return typeof document !== "undefined" ? !document.hidden : true;
    },
    fetch: fetcher,
    storage,
    notify: (message: string, type: "info" | "success" | "warning" | "error" = "info") => {
      options?.onNotify?.(message, type);
      // Structured notification bridge for widgets rendered outside the admin shell.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("svelty:toast", {
            detail: { message, type },
          }),
        );
      }
    },
    requestRefresh: async () => {
      if (options?.onRequestRefresh) {
        await options.onRequestRefresh();
      }
    },
    updateSettings: (settings: Record<string, unknown>) => {
      if (options?.onUpdateSettings) {
        options.onUpdateSettings(settings);
      }
    },
  };
}

/**
 * Format bytes into human-readable units (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Format numbers with locale grouping.
 */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US").format(num);
}

/**
 * Format percentage (e.g. 0.85 -> 85%).
 */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format timestamp safely for widget display.
 */
export function formatWidgetTime(isoOrTimestamp: string | number | Date): string {
  try {
    const isoString =
      isoOrTimestamp instanceof Date
        ? isoOrTimestamp.toISOString()
        : typeof isoOrTimestamp === "number"
          ? new Date(isoOrTimestamp).toISOString()
          : isoOrTimestamp;

    return formatTime(isoString, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(isoOrTimestamp);
  }
}
