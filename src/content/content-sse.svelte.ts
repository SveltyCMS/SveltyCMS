/**
 * @file src/content/content-sse.svelte.ts
 * @description
 * Real-time content synchronization using Server-Sent Events (SSE).
 * Replaces old polling mechanism for lower latency and zero overhead.
 */

import { logger } from "@utils/logger";
import { contentSystem } from "@src/content";

const browser = typeof window !== "undefined";
let eventSource: EventSource | null = null;

/**
 * Client-side listener for content update events.
 */
export const contentLiveSync = {
  /**
   * Starts the SSE listener if in the browser and not already running.
   */
  start() {
    if (!browser || eventSource) return;

    // Do not connect on setup or login pages
    const pathname =
      typeof window !== "undefined" && window.location ? window.location.pathname : "";
    if (pathname.startsWith("/setup") || pathname.startsWith("/login")) return;

    logger.debug("📡 Initializing content live sync via SSE...");

    // Connect to the events endpoint
    eventSource = new EventSource("/api/content/events");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle reconcile or general update events (normalized SSE wire format)
        const isContentUpdate =
          data.type === "reconcile" ||
          data.type === "content_update" ||
          data.type === "reorder" ||
          data.event === "content:update";

        if (isContentUpdate) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            logger.info(`📡 Content update received [${data.type}]. Refreshing...`);
            // Trigger a fast refresh (skip reconciliation on server, just sync state)
            await contentSystem.refresh(null, true);
            debounceTimer = null;
          }, 250); // 250ms debounce
        }
      } catch (error) {
        logger.error("❌ Failed to parse SSE message", error);
      }
    };

    eventSource.onopen = () => {
      logger.debug("✅ Content SSE connection established");
    };

    eventSource.onerror = (error) => {
      // EventSource automatically handles reconnection
      logger.debug("⚠️ Content SSE connection interrupted, reconnecting...", error);
    };
  },

  /**
   * Stops the SSE listener and cleans up resources.
   */
  stop() {
    if (eventSource) {
      logger.debug("📡 Stopping content live sync...");
      eventSource.close();
      eventSource = null;
    }
  },
};
