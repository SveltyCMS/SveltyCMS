/**
 * @file src/content/content-sse.svelte.ts
 * @description
 * Real-time content synchronization using Server-Sent Events (SSE).
 * Replaces old polling mechanism for lower latency and zero overhead.
 */

import { logger } from "@utils/logger";
import { contentSystem } from "@src/content";
import { classifySseError, parseSseData } from "@utils/sse-client";

const browser = typeof window !== "undefined";
let eventSource: EventSource | null = null;
/** Normal teardown (page navigation or `stop()`): errors from here on are expected. */
let tearingDown = false;
/** Consecutive errors since the last successful `onopen`. */
let consecutiveFailures = 0;

/** Whether a decoded payload asks the client to re-sync content. */
function isContentUpdate(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const payload = data as { type?: unknown; event?: unknown };
  return (
    payload.type === "reconcile" ||
    payload.type === "content_update" ||
    payload.type === "reorder" ||
    payload.event === "content:update"
  );
}

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
    tearingDown = false;
    consecutiveFailures = 0;

    // Connect to the events endpoint
    eventSource = new EventSource("/api/content/events");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    eventSource.onmessage = async (event) => {
      // The browser hands over complete frames, but not necessarily JSON: keep-alive
      // comment lines, truncated bodies and redacted documents all reach this handler.
      // Parse tolerantly, so one bad frame can never throw per event.
      const parsed = parseSseData(event.data);
      if (!parsed.ok) {
        if (parsed.reason === "invalid-json") {
          logger.debug("📡 Ignored unparseable content SSE payload", {
            length: typeof event.data === "string" ? event.data.length : 0,
          });
        }
        return;
      }

      if (!isContentUpdate(parsed.value)) return;

      const data = parsed.value as { type?: string };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        logger.debug(`📡 Content update received [${data.type}]. Refreshing...`);
        // Trigger a fast refresh (skip reconciliation on server, just sync state)
        await contentSystem.refresh(null, true);
        debounceTimer = null;
      }, 250); // 250ms debounce
    };

    eventSource.onopen = () => {
      consecutiveFailures = 0;
      logger.debug("✅ Content SSE connection established");
    };

    eventSource.onerror = (error) => {
      consecutiveFailures++;
      const verdict = classifySseError({
        readyState: eventSource?.readyState ?? null,
        teardown: tearingDown,
        consecutiveFailures,
      });
      if (verdict.level === "silent") return;

      // EventSource reconnects on its own while `readyState` is CONNECTING; only a
      // connection the browser gave up on (CLOSED) or a repeated failure is worth a log.
      const message = "⚠️ Content SSE connection interrupted";
      // SSE is a best-effort live-update stream; a disconnect is recoverable and
      // must not be logged at error level (it trips the E2E console guard and
      // overstates a transient network event).
      logger.warn(message, { attempt: consecutiveFailures, error });
    };
  },

  /**
   * Stops the SSE listener and cleans up resources.
   */
  stop() {
    if (eventSource) {
      logger.debug("📡 Stopping content live sync...");
      // Flag first: `close()` fires no error, but a queued error event can still land.
      tearingDown = true;
      eventSource.close();
      eventSource = null;
    }
  },
};

// Navigation tears the page down while the stream is open; that error is expected.
if (browser && typeof window !== "undefined") {
  window.addEventListener("pagehide", () => contentLiveSync.stop());
}
