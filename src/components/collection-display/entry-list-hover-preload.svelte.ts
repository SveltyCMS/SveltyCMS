/**
 * @file src/components/collection-display/entry-list-hover-preload.svelte.ts
 * @description
 * Reactive hover and predictive preloader for collection entry tables.
 * Detects network speeds, tracks hover patterns, and coordinates background cache warming.
 *
 * Features:
 * - Connection-aware gating (disables preloading on slow 2G / Save-Data)
 * - Predictive hover tracking (queues frequently hovered entries)
 * - Batch cache warming via /api/collections/warm-cache
 * - Periodic TTL expiration cleanup
 */

import { browser } from "$app/env";
import type { CollectionEntry } from "@src/content/types";
import { logger } from "@utils/logger";
import { preloadEntry } from "@utils/navigation";
import { clientJsonHeaders } from "@utils/security/client-csrf";
import { SvelteMap } from "svelte/reactivity";

interface PreloadCacheEntry {
  data: unknown;
  timestamp: number;
  hoverCount: number;
}

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface EntryListHoverPreloadOptions {
  getCollectionId: () => string | null | undefined;
  getTableData: () => CollectionEntry[];
  getMode: () => string;
  getPathname: () => string;
}

export interface EntryListHoverPreloadController {
  readonly isPreloadEnabled: boolean;
  handleRowHoverStart: (entryId: string) => void;
  handleRowHoverEnd: () => void;
}

const PRELOAD_CACHE_TTL = 30_000; // ms

export function createEntryListHoverPreload({
  getCollectionId,
  getTableData,
  getMode,
  getPathname,
}: EntryListHoverPreloadOptions): EntryListHoverPreloadController {
  let hoverPreloadTimeout: ReturnType<typeof setTimeout> | null = null;
  const preloadedEntries = new SvelteMap<string, PreloadCacheEntry>();
  let isPreloadEnabled = $state(true);

  // Track hover patterns for predictive preloading
  const hoverPatterns = new SvelteMap<string, number>();
  const predictivePreloadQueue: string[] = [];

  // Connection-aware gating
  $effect(() => {
    if (browser && "connection" in navigator) {
      const nav = navigator as unknown as {
        connection?: NetworkInformationLike;
        mozConnection?: NetworkInformationLike;
        webkitConnection?: NetworkInformationLike;
      };
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn) {
        const checkConnection = () => {
          const effectiveType = conn.effectiveType;
          const saveData = conn.saveData;
          const isSlow = saveData || effectiveType === "slow-2g" || effectiveType === "2g";
          isPreloadEnabled = !isSlow;
        };
        checkConnection();
        conn.addEventListener("change", checkConnection);
        return () => conn.removeEventListener("change", checkConnection);
      }
    }
  });

  function handleRowHoverStart(entryId: string): void {
    if (!isPreloadEnabled) {
      logger.debug("[Preload] Disabled on slow connection");
      return;
    }

    preloadEntry(entryId, getPathname());

    const currentCount = hoverPatterns.get(entryId) || 0;
    hoverPatterns.set(entryId, currentCount + 1);

    if (currentCount >= 2) {
      predictivePreloadQueue.push(entryId);
    }
  }

  function handleRowHoverEnd(): void {
    if (hoverPreloadTimeout) {
      clearTimeout(hoverPreloadTimeout);
      hoverPreloadTimeout = null;
    }
  }

  async function batchPreloadVisibleEntries(): Promise<void> {
    const collectionId = getCollectionId();
    if (!isPreloadEnabled || !browser || !collectionId) return;

    const tableData = getTableData();
    const entriesToPreload = tableData.slice(0, 5);
    const entryIds = entriesToPreload
      .map((e) => String(e._id ?? ""))
      .filter((id) => {
        if (!id) return false;
        const cached = preloadedEntries.get(id);
        return !cached || Date.now() - cached.timestamp > PRELOAD_CACHE_TTL;
      });

    if (entryIds.length === 0) return;

    const warm = async () => {
      try {
        await fetch("/api/collections/warm-cache", {
          method: "POST",
          headers: clientJsonHeaders(),
          body: JSON.stringify({ collectionId, entryIds }),
        });

        const now = Date.now();
        for (const id of entryIds) {
          preloadedEntries.set(id, { data: null, timestamp: now, hoverCount: 0 });
        }
        logger.debug(`[Batch Preload] Warmed ${entryIds.length} entries in one request`);
      } catch (error) {
        logger.warn("[Batch Preload] Failed:", error);
      }
    };

    if ("requestIdleCallback" in window) {
      (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback(warm, { timeout: 2000 });
    } else {
      await warm();
    }
  }

  // Trigger batch preload when data changes
  $effect(() => {
    const tableData = getTableData();
    const mode = getMode();
    if (tableData.length > 0 && mode === "view") {
      const timer = setTimeout(() => void batchPreloadVisibleEntries(), 2000);
      return () => clearTimeout(timer);
    }
  });

  // Periodic cache cleanup
  $effect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [entryId, cached] of preloadedEntries.entries()) {
        if (now - cached.timestamp > PRELOAD_CACHE_TTL) {
          preloadedEntries.delete(entryId);
        }
      }
    }, 10_000);
    return () => clearInterval(cleanupInterval);
  });

  return {
    get isPreloadEnabled() {
      return isPreloadEnabled;
    },
    handleRowHoverStart,
    handleRowHoverEnd,
  };
}
