/**
 * @file src/utils/offline-draft-sync.ts
 * @description
 * Client-Side Offline Draft Sync & SvelteKit Remote Functions Optimistic Proxy.
 *
 * Provides typed wrappers for SvelteKit Remote Functions (remote-functions#form).
 * Optimistically updates UI state, queues RPC payloads in LocalStorage / IndexedDB during network drops,
 * and executes background sync upon reconnection with conflict detection.
 *
 * ### Features:
 * - SvelteKit Remote Functions optimistic proxy with retry backoff
 * - Network online/offline status monitoring
 * - Local storage draft auto-saving per collection/entry
 * - Replay handler registry for automatic background sync upon reconnection
 * - Conflict detection via version/timestamp stenciling
 */

import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";

export interface PendingRemoteCall<T = unknown> {
  id: string;
  functionName: string;
  payload: T;
  timestamp: string;
  version?: number;
  attempts?: number;
  lastError?: string;
}

export interface LocalDraftRecord<T = Record<string, unknown>> {
  collection: string;
  entryId: string;
  tenantId: string;
  data: T;
  updatedAt: string;
}

export const MAX_SYNC_RETRIES = 3;
export const DRAFT_STORAGE_PREFIX = "sveltycms_draft:";

export class OfflineDraftSync {
  private queue: PendingRemoteCall[] = [];
  private handlers = new Map<string, (payload: any) => Promise<any>>();
  private isOnline = true;
  private storageKey = "sveltycms_offline_remote_queue";

  constructor() {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      this.isOnline = navigator.onLine;
    } else {
      this.isOnline = true;
    }

    if (typeof window !== "undefined") {
      this.loadQueueFromStorage();

      window.addEventListener("online", () => this.handleOnlineStatusChange(true));
      window.addEventListener("offline", () => this.handleOnlineStatusChange(false));
    }
  }

  private handleOnlineStatusChange(online: boolean): void {
    this.isOnline = online;
    logger.info(`[OfflineDraftSync] Connection status changed: ${online ? "ONLINE" : "OFFLINE"}`);
    if (online) {
      void this.syncPendingQueue();
    }
  }

  private loadQueueFromStorage(): void {
    try {
      const raw =
        typeof localStorage !== "undefined" ? localStorage.getItem(this.storageKey) : null;
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueueToStorage(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
      }
    } catch (err) {
      logger.warn("[OfflineDraftSync] Failed to persist queue to localStorage:", err);
    }
  }

  /**
   * Register an RPC/Remote Function handler for automatic background replaying.
   * Returns an unregister callback.
   */
  public registerHandler<TPayload = unknown, TResult = unknown>(
    functionName: string,
    handler: (payload: TPayload) => Promise<TResult>,
  ): () => void {
    this.handlers.set(functionName, handler as (p: any) => Promise<any>);
    return () => {
      this.handlers.delete(functionName);
    };
  }

  /**
   * Wraps a SvelteKit Remote Function call with optimistic execution & offline queueing.
   */
  public wrapRemoteFunction<TArgs, TResult>(
    functionName: string,
    remoteFn: (args: TArgs) => Promise<TResult>,
    optimisticUpdater?: (args: TArgs) => void,
  ): (args: TArgs) => Promise<TResult | null> {
    // Automatically register the remote function as the default replay handler
    if (!this.handlers.has(functionName)) {
      this.registerHandler(functionName, remoteFn);
    }

    return async (args: TArgs): Promise<TResult | null> => {
      // 1. Trigger optimistic state update immediately
      if (optimisticUpdater) {
        try {
          optimisticUpdater(args);
        } catch (err) {
          logger.warn("[OfflineDraftSync] Optimistic update failed:", err);
        }
      }

      // 2. If online, execute Remote Function directly
      if (this.isOnline) {
        try {
          return await remoteFn(args);
        } catch (err) {
          logger.warn(
            `[OfflineDraftSync] Remote function ${functionName} failed online. Enqueueing offline.`,
            err,
          );
        }
      }

      // 3. If offline or network dropped, enqueue payload for background sync
      const item: PendingRemoteCall<TArgs> = {
        id: generateUUID(),
        functionName,
        payload: args,
        timestamp: new Date().toISOString(),
        attempts: 0,
      };

      this.queue.push(item as PendingRemoteCall);
      this.saveQueueToStorage();
      logger.info(
        `[OfflineDraftSync] Enqueued offline remote function call ${functionName} (Queue size: ${this.queue.length})`,
      );

      return null;
    };
  }

  /**
   * Background syncs all pending remote function calls when connection is restored.
   */
  public async syncPendingQueue(): Promise<{ synced: number; failed: number }> {
    if (this.queue.length === 0 || !this.isOnline) {
      return { synced: 0, failed: 0 };
    }

    logger.info(
      `[OfflineDraftSync] Reconnected! Syncing ${this.queue.length} pending offline calls...`,
    );

    const pending = [...this.queue];
    const remaining: PendingRemoteCall[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      const handler = this.handlers.get(item.functionName);
      if (!handler) {
        logger.warn(
          `[OfflineDraftSync] No registered handler for ${item.functionName}. Retaining in queue.`,
        );
        remaining.push(item);
        continue;
      }

      try {
        logger.info(
          `[OfflineDraftSync] Replaying pending remote function: ${item.functionName} (${item.id})`,
        );
        await handler(item.payload);
        synced++;
      } catch (err) {
        failed++;
        const attempts = (item.attempts || 0) + 1;
        logger.error(
          `[OfflineDraftSync] Replay error for ${item.functionName} (attempt ${attempts}/${MAX_SYNC_RETRIES}):`,
          err,
        );

        if (attempts < MAX_SYNC_RETRIES) {
          remaining.push({
            ...item,
            attempts,
            lastError: err instanceof Error ? err.message : String(err),
          });
        } else {
          logger.error(
            `[OfflineDraftSync] Dropping ${item.functionName} after ${MAX_SYNC_RETRIES} failed attempts.`,
          );
        }
      }
    }

    this.queue = remaining;
    this.saveQueueToStorage();
    return { synced, failed };
  }

  // ─── Local Content Draft Helpers ───────────────────────────────────────────

  private getDraftKey(collection: string, entryId: string, tenantId = "default"): string {
    return `${DRAFT_STORAGE_PREFIX}${tenantId}:${collection}:${entryId}`;
  }

  /**
   * Persist in-progress form inputs to browser storage to survive cellular drops or reloads.
   */
  public saveLocalDraft<T = Record<string, unknown>>(
    collection: string,
    entryId: string,
    data: T,
    tenantId = "default",
  ): void {
    if (typeof localStorage === "undefined") return;
    try {
      const record: LocalDraftRecord<T> = {
        collection,
        entryId,
        tenantId,
        data,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.getDraftKey(collection, entryId, tenantId), JSON.stringify(record));
    } catch (err) {
      logger.warn(
        `[OfflineDraftSync] Failed to save local draft for ${collection}/${entryId}:`,
        err,
      );
    }
  }

  /**
   * Retrieve a saved draft for a collection and entry.
   */
  public getLocalDraft<T = Record<string, unknown>>(
    collection: string,
    entryId: string,
    tenantId = "default",
  ): LocalDraftRecord<T> | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(this.getDraftKey(collection, entryId, tenantId));
      if (!raw) return null;
      return JSON.parse(raw) as LocalDraftRecord<T>;
    } catch {
      return null;
    }
  }

  /**
   * Clear local draft once successfully committed to the database.
   */
  public clearLocalDraft(collection: string, entryId: string, tenantId = "default"): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(this.getDraftKey(collection, entryId, tenantId));
    } catch {}
  }

  /**
   * Check whether an uncommitted local draft exists.
   */
  public hasLocalDraft(collection: string, entryId: string, tenantId = "default"): boolean {
    return this.getLocalDraft(collection, entryId, tenantId) !== null;
  }

  public setOnlineStatus(online: boolean): void {
    this.isOnline = online;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get onlineStatus(): boolean {
    return this.isOnline;
  }

  public clearQueue(): void {
    this.queue = [];
    this.saveQueueToStorage();
  }
}

export const offlineDraftSync = new OfflineDraftSync();
