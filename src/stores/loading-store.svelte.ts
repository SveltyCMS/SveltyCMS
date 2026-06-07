/**
 * @file src/stores/loading-store.svelte.ts
 * @description Enterprise-grade global loading state management with progress tracking,
 * priority queuing, analytics, and AbortController cancellation support.
 *
 * @example
 * import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
 *
 * // Basic withLoading
 * await globalLoadingStore.withLoading(loadingOperations.dataFetch, async () => {
 *   const data = await fetch('/api/data');
 *   return data.json();
 * });
 *
 * // With progress and cancellation
 * const ctrl = new AbortController();
 * await globalLoadingStore.withProgress(loadingOperations.imageUpload, async (update) => {
 *   for (let i = 0; i < 100; i += 10) {
 *     update(i);
 *     await processBatch();
 *   }
 *   return result;
 * }, { cancellable: true, signal: ctrl.signal });
 *
 * Features:
 * - SSR-safe: Guards against server-side execution
 * - Progress Tracking: Percentage-based progress with update callback
 * - Queue Management: Priority-based concurrent operation queuing
 * - Analytics: Per-operation timing and duration metrics
 * - Cancellation: AbortController support with automatic cleanup
 * - Stack-based: Handles concurrent operations gracefully
 * - Auto-cleanup: Prevents stuck loading states with timeouts
 */

import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { browser } from "$app/environment";

// Test-friendly browser check
const isTest =
  typeof globalThis !== "undefined" && (globalThis as any).process?.env?.TEST_MODE === "true";
const isBrowser = browser || isTest;

// Predefined loading operations for consistency
export const loadingOperations = {
  navigation: "navigation",
  dataFetch: "data-fetch",
  authentication: "authentication",
  initialization: "initialization",
  imageUpload: "image-upload",
  formSubmission: "form-submission",
  configSave: "config-save",
  roleManagement: "role-management",
  permissionUpdate: "permission-update",
  tokenGeneration: "token-generation",
  collectionLoad: "collection-load",
  widgetInit: "widget-init",
} as const;

export type LoadingOperation = (typeof loadingOperations)[keyof typeof loadingOperations];

// Priority levels for queue management
export type LoadingPriority = "high" | "normal" | "low";
const PRIORITY_ORDER: Record<LoadingPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

// Enhanced loading state with metadata
interface LoadingEntry {
  canCancel?: boolean;
  context?: string;
  onCancel?: () => void;
  priority: LoadingPriority;
  progress?: number;
  reason: string;
  signal?: AbortSignal;
  startTime: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// Options for withProgress and withLoading
interface LoadingOptions {
  cancellable?: boolean;
  context?: string;
  onCancel?: () => void;
  priority?: LoadingPriority;
  signal?: AbortSignal;
  timeout?: number;
}

// Analytics metric record
interface LoadingMetric {
  duration: number;
  operation: string;
  success: boolean;
  timestamp: number;
}

// Enterprise-grade loading store with progress, priority queue, analytics, and cancellation
export class LoadingStore {
  private _isLoading = $state(false);
  private _loadingReason = $state<string | null>(null);
  private readonly _loadingStack = $state<SvelteSet<string>>(new SvelteSet());
  private readonly _loadingEntries = new SvelteMap<string, LoadingEntry>();
  private readonly _maxTimeout = 30_000;
  private _progress = $state<number | null>(null);
  private _canCancel = $state(false);
  private _onCancel = $state<(() => void) | undefined>(undefined);

  // ── Analytics ────────────────────────────────────────────
  private readonly _metrics: LoadingMetric[] = [];
  private readonly _maxMetrics = 200; // Rolling window for memory safety
  private _totalOperations = 0;
  private _totalDuration = 0;

  // Public getters
  get isLoading() {
    return this._isLoading;
  }
  get loadingReason() {
    return this._loadingReason;
  }
  get loadingStack() {
    return this._loadingStack;
  }
  get progress() {
    return this._progress;
  }
  get canCancel() {
    return this._canCancel;
  }
  get onCancel() {
    return this._onCancel;
  }

  /**
   * Start a loading operation with automatic timeout protection and priority queuing.
   * If a higher-priority operation is already running, it proceeds normally (stack-based).
   * If the same reason is already loading, the new call is skipped.
   */
  startLoading(reason: string, context?: string, timeout: number = this._maxTimeout) {
    if (!isBrowser) return;

    if (this._loadingStack.has(reason)) {
      if (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS) {
        console.warn(`[LoadingStore] Operation "${reason}" already in progress`);
      }
      return;
    }

    const entry: LoadingEntry = {
      reason,
      priority: "normal",
      startTime: Date.now(),
      context,
    };

    if (!isTest) {
      entry.timeoutId = setTimeout(() => {
        if (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS) {
          console.warn(`[LoadingStore] Auto-cleanup: "${reason}" exceeded ${timeout}ms`);
        }
        this.stopLoading(reason);
      }, timeout);
    }

    this._loadingStack.add(reason);
    this._loadingEntries.set(reason, entry);
    this._isLoading = true;
    this._loadingReason = reason;

    if (context && (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS)) {
      console.debug(`[LoadingStore] Started: ${reason} (${context})`);
    }
  }

  /** Start a loading operation with options including priority, cancellation, AbortSignal */
  startLoadingWith(reason: string, options: LoadingOptions = {}) {
    if (!isBrowser) return;

    if (this._loadingStack.has(reason)) {
      if (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS) {
        console.warn(`[LoadingStore] Operation "${reason}" already in progress`);
      }
      return;
    }

    const entry: LoadingEntry = {
      reason,
      priority: options.priority ?? "normal",
      startTime: Date.now(),
      context: options.context,
      canCancel: options.cancellable ?? false,
      onCancel: options.onCancel,
      signal: options.signal,
    };

    // Wire AbortSignal to stopLoading
    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        () => {
          this.stopLoading(reason);
        },
        { once: true },
      );
    }

    const timeout = options.timeout ?? this._maxTimeout;
    if (!isTest) {
      entry.timeoutId = setTimeout(() => {
        if (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS) {
          console.warn(`[LoadingStore] Auto-cleanup: "${reason}" exceeded ${timeout}ms`);
        }
        this.stopLoading(reason);
      }, timeout);
    }

    this._loadingStack.add(reason);
    this._loadingEntries.set(reason, entry);
    this._isLoading = true;
    this._loadingReason = reason;
    this._canCancel = entry.canCancel ?? false;
    this._onCancel = entry.onCancel;

    if (options.context && (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS)) {
      console.debug(`[LoadingStore] Started: ${reason} (${options.context})`);
    }
  }

  /** Update progress for a running operation (0-100) */
  setProgress(reason: string, progress: number) {
    if (!isBrowser || !this._loadingEntries.has(reason)) return;

    const entry = this._loadingEntries.get(reason)!;
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    entry.progress = clamped;
    this._loadingEntries.set(reason, entry);

    if (this._loadingReason === reason) {
      this._progress = clamped;
    }
  }

  /** Get progress of a specific operation */
  getProgress(reason: string): number | null {
    if (!isBrowser) return null;
    return this._loadingEntries.get(reason)?.progress ?? null;
  }

  stopLoading(reason: string) {
    if (!isBrowser) return;
    if (!this._loadingStack.has(reason)) return;

    const entry = this._loadingEntries.get(reason);
    if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    if (entry?.signal) {
      // Clean up signal listeners (they're { once: true } so no explicit removal needed)
    }

    // Record analytics
    if (entry) {
      const duration = Date.now() - entry.startTime;
      this._recordMetric(reason, duration, true);
    }

    this._loadingEntries.delete(reason);
    this._loadingStack.delete(reason);

    if (this._loadingStack.size === 0) {
      this._isLoading = false;
      this._loadingReason = null;
      this._progress = null;
      this._canCancel = false;
      this._onCancel = undefined;
    } else {
      // Restore state from highest-priority remaining operation
      const entries = Array.from(this._loadingStack);
      const newReason = this._getHighestPriority(entries) ?? entries.at(-1)!;
      this._loadingReason = newReason;

      const newEntry = this._loadingEntries.get(newReason);
      if (newEntry) {
        this._progress = newEntry.progress ?? null;
        this._canCancel = newEntry.canCancel ?? false;
        this._onCancel = newEntry.onCancel;
      }
    }

    if (entry && (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS)) {
      const duration = Date.now() - entry.startTime;
      console.debug(`[LoadingStore] Stopped: ${reason} (${duration}ms)`);
    }
  }

  /** Get the highest priority reason from a list */
  private _getHighestPriority(reasons: string[]): string | undefined {
    let best: string | undefined;
    let bestRank = Infinity;
    for (const r of reasons) {
      const e = this._loadingEntries.get(r);
      if (e) {
        const rank = PRIORITY_ORDER[e.priority] ?? 1;
        if (rank < bestRank) {
          bestRank = rank;
          best = r;
        }
      }
    }
    return best;
  }

  /** Update loading progress and cancellation for the current operation */
  updateStatus(reason: string, progress?: number, canCancel?: boolean, onCancel?: () => void) {
    if (!(browser && this._loadingEntries.has(reason))) return;

    const entry = this._loadingEntries.get(reason)!;

    if (progress !== undefined) {
      entry.progress = Math.max(0, Math.min(100, Math.round(progress)));
      if (this._loadingReason === reason) this._progress = entry.progress;
    }

    if (canCancel !== undefined) {
      entry.canCancel = canCancel;
      if (this._loadingReason === reason) this._canCancel = canCancel;
    }

    if (onCancel !== undefined) {
      entry.onCancel = onCancel;
      if (this._loadingReason === reason) this._onCancel = onCancel;
    }

    this._loadingEntries.set(reason, entry);
  }

  // Forcefully clear all loading states (emergency use only)
  clearLoading() {
    if (!isBrowser) return;

    for (const entry of this._loadingEntries.values()) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    }

    this._loadingEntries.clear();
    this._loadingStack.clear();
    this._isLoading = false;
    this._loadingReason = null;
    this._progress = null;
    this._canCancel = false;
    this._onCancel = undefined;

    if (!isTest || (globalThis as any).process?.env?.VERBOSE_TESTS) {
      console.warn("[LoadingStore] Force cleared all loading states");
    }
  }

  isLoadingReason(reason: string): boolean {
    return this._loadingStack.has(reason);
  }

  // ── ⭐ withProgress: Percentage-based progress tracking ──────
  /**
   * Wrap an async operation with progress tracking. The operation receives
   * an `update` callback to report progress (0-100).
   *
   * @example
   * await globalLoadingStore.withProgress(loadingOperations.imageUpload, async (update) => {
   *   for (let i = 0; i <= 100; i += 20) {
   *     update(i);
   *     await uploadBatch();
   *   }
   *   return uploadedFiles;
   * });
   */
  async withProgress<T>(
    reason: string,
    operation: (updateProgress: (percent: number) => void) => Promise<T>,
    context?: string,
  ): Promise<T> {
    this.startLoading(reason, context);
    try {
      return await operation((percent: number) => this.setProgress(reason, percent));
    } catch (error) {
      this._recordMetric(
        reason,
        Date.now() - (this._loadingEntries.get(reason)?.startTime ?? Date.now()),
        false,
      );
      console.error(`[LoadingStore] Operation "${reason}" failed:`, error);
      throw error;
    } finally {
      this.stopLoading(reason);
    }
  }

  // ── ⭐ withCancellable: AbortController integration ─────────
  /**
   * Wrap an async operation with AbortController support. The operation
   * receives the AbortSignal and can check `signal.aborted` to stop early.
   * The Cancel button in the UI is wired to `controller.abort()`.
   *
   * @example
   * const result = await globalLoadingStore.withCancellable(
   *   loadingOperations.dataFetch,
   *   async (signal) => {
   *     const res = await fetch('/api/large-dataset', { signal });
   *     return res.json();
   *   },
   *   { context: "Exporting data" }
   * );
   */
  async withCancellable<T>(
    reason: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: LoadingOptions = {},
  ): Promise<T> {
    const controller = new AbortController();

    this.startLoadingWith(reason, {
      ...options,
      cancellable: true,
      signal: controller.signal,
      onCancel: () => {
        controller.abort();
        options.onCancel?.();
      },
    });

    try {
      return await operation(controller.signal);
    } catch (error: any) {
      if (error?.name === "AbortError") {
        this._recordMetric(
          reason,
          Date.now() - (this._loadingEntries.get(reason)?.startTime ?? Date.now()),
          false,
        );
        throw new DOMException("Operation cancelled by user", "AbortError");
      }
      this._recordMetric(
        reason,
        Date.now() - (this._loadingEntries.get(reason)?.startTime ?? Date.now()),
        false,
      );
      console.error(`[LoadingStore] Operation "${reason}" failed:`, error);
      throw error;
    } finally {
      this.stopLoading(reason);
    }
  }

  /** Standard withLoading with full options support */
  async withLoading<T>(reason: string, operation: () => Promise<T>, context?: string): Promise<T> {
    this.startLoading(reason, context);
    try {
      return await operation();
    } catch (error) {
      this._recordMetric(
        reason,
        Date.now() - (this._loadingEntries.get(reason)?.startTime ?? Date.now()),
        false,
      );
      console.error(`[LoadingStore] Operation "${reason}" failed:`, error);
      throw error;
    } finally {
      this.stopLoading(reason);
    }
  }

  // ── ⭐ Analytics ──────────────────────────────────────────────
  private _recordMetric(operation: string, duration: number, success: boolean) {
    if (!isBrowser) return;

    this._totalOperations++;
    this._totalDuration += duration;

    this._metrics.push({
      operation,
      duration,
      success,
      timestamp: Date.now(),
    });

    // Rolling window
    if (this._metrics.length > this._maxMetrics) {
      this._metrics.splice(0, this._metrics.length - this._maxMetrics);
    }
  }

  /** Get analytics: average duration per operation type, success rate, total ops */
  getAnalytics() {
    if (!isBrowser) return null;

    const byOperation: Record<
      string,
      {
        count: number;
        totalDuration: number;
        failures: number;
        avgDuration: number;
      }
    > = {};

    for (const m of this._metrics) {
      const o =
        byOperation[m.operation] ??
        (byOperation[m.operation] = {
          count: 0,
          totalDuration: 0,
          failures: 0,
          avgDuration: 0,
        });
      o.count++;
      o.totalDuration += m.duration;
      if (!m.success) o.failures++;
    }

    for (const key of Object.keys(byOperation)) {
      byOperation[key].avgDuration = Math.round(
        byOperation[key].totalDuration / byOperation[key].count,
      );
    }

    return {
      totalOperations: this._totalOperations,
      avgDuration:
        this._totalOperations > 0 ? Math.round(this._totalDuration / this._totalOperations) : 0,
      byOperation,
      recentOperations: this._metrics.slice(-10).reverse(),
    };
  }

  // Get loading statistics (for debugging)
  getStats() {
    if (!isBrowser) return null;

    return {
      isLoading: this._isLoading,
      currentReason: this._loadingReason,
      activeCount: this._loadingStack.size,
      activeOperations: Array.from(this._loadingStack),
      entries: Array.from(this._loadingEntries.entries()).map(([reason, entry]) => ({
        reason,
        duration: Date.now() - entry.startTime,
        context: entry.context,
        progress: entry.progress,
        priority: entry.priority,
      })),
    };
  }
}

// Create and export singleton instance
export const globalLoadingStore = new LoadingStore();
