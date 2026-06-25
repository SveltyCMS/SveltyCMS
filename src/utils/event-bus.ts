/**
 * @file src/utils/event-bus.ts
 * @description
 * Ultra-lightweight, high-performance event bus for server-side communication.
 * Primary backplane for SSE (Server-Sent Events) and multi-instance synchronization.
 *
 * ⚠️ SERVER-ONLY: This module uses Node.js `EventEmitter` and must never be
 * imported in browser bundles. A guard throws at module init if run client-side.
 *
 * ### Features:
 * - Wildcard `*` listeners for catch-all event monitoring
 * - `broadcast()` convenience method
 * - Configurable max listeners (default 1000 for concurrent SSE connections)
 */
import { EventEmitter } from "node:events";
import { logger } from "./logger";

// 🛡️ Server-only guard — prevents accidental import in browser bundles
// Server-only — block in browser bundles, allow in Node/Bun (including jsdom tests)
if (
  typeof window !== "undefined" &&
  typeof (globalThis as any).process?.versions?.node === "undefined"
) {
  throw new Error(
    "[event-bus] This module is server-only. Do not import it in browser code or Svelte components.",
  );
}

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Default limit is 10, we need more for many concurrent SSE connections
    this.setMaxListeners(1000);
  }

  /**
   * Overridden emit to support wildcard '*' listeners.
   */
  emit(event: string | symbol, ...args: any[]): boolean {
    const wasHandled = super.emit(event, ...args);

    // Also trigger wildcard listeners if any
    if (event !== "*") {
      super.emit("*", { event, data: args[0], args });
    }

    return wasHandled;
  }

  /**
   * Broadcast an event to all local listeners.
   * If Redis is enabled, this should be preceded by a Redis publish.
   */
  broadcast(event: string, data: any) {
    logger.debug(`[EventBus] Broadcasting event: ${event}`);
    this.emit(event, data);
  }
}

// Singleton server instance
export const eventBus = new EventBus();

// Event Types
export enum SystemEvents {
  CONTENT_UPDATE = "content:update",
  CACHE_INVALIDATE = "cache:invalidate",
  CONFIG_CHANGE = "config:change",
}
