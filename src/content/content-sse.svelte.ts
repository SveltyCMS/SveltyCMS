/**
 * @file src/content/content-sse.svelte.ts
 * @description
 * Real-time content synchronization using Server-Sent Events (SSE).
 * Replaces old polling mechanism for lower latency and zero overhead.
 */

import { browser } from "$app/environment";
import { logger } from "@utils/logger";
import { contentManager } from "@src/content";

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
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    if (pathname.startsWith("/setup") || pathname.startsWith("/login")) return;

    logger.debug("📡 Initializing content live sync via SSE...");

    // Connect to the events endpoint
    eventSource = new EventSource("/api/content/events");

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle reconcile or general update events
        if (
          data.type === "reconcile" ||
          data.type === "content_update" ||
          data.type === "reorder"
        ) {
          logger.info(`📡 Content update received [${data.type}]. Refreshing...`);

          // Trigger a fast refresh (skip reconciliation on server, just sync state)
          await contentManager.refresh(null, true);
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
