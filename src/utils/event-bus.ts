/**
 * @file src/utils/event-bus.ts
 * @description
 * Ultra-lightweight, high-performance event bus for server-side communication.
 * Primary backplane for SSE (Server-Sent Events) and multi-instance synchronization.
 */
import { EventEmitter } from "node:events";
import { logger } from "./logger";

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Default limit is 10, we need more for many concurrent SSE connections
    this.setMaxListeners(1000);
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
