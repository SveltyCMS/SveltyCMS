/**
 * @file src/utils/event-bus.ts
 * @description
 * Ultra-lightweight, high-performance event bus for server-side communication.
 * Primary backplane for SSE (Server-Sent Events) and multi-instance synchronization.
 *
 * ⚠️ SERVER-ONLY: This module uses Node.js `EventEmitter` and must never be
 * imported in browser bundles. A guard throws at module init if run client-side.
 *
 * ### Hardening (audit 2026-07):
 * - Default error sink prevents fatal process termination on unhandled errors
 * - `broadcast()` defers to `process.nextTick` — non-blocking for HTTP handlers
 * - Strict TypeScript payload types for system events (arbitrary strings fall back to `any`)
 * - Fault-tolerant wildcard emission (crashing wildcard listeners can't sabotage main chain)
 *
 * ### Features:
 * - Wildcard `*` listeners for catch-all event monitoring
 * - `broadcast()` convenience method with async decoupling
 * - Configurable max listeners (default 1000 for concurrent SSE connections)
 */

import { EventEmitter } from "node:events";
import { logger } from "./logger";

// 🛡️ Server-only guard — prevents accidental import in browser bundles
if (
  typeof window !== "undefined" &&
  typeof (globalThis as any).process?.versions?.node === "undefined"
) {
  throw new Error(
    "[event-bus] This module is server-only. Do not import it in browser code or Svelte components.",
  );
}

// ─── System event types ──────────────────────────────────────────────────

export enum SystemEvents {
  CONTENT_UPDATE = "content:update",
  CACHE_INVALIDATE = "cache:invalidate",
  CONFIG_CHANGE = "config:change",
}

/**
 * Strongly typed event mapping — guarantees payload shapes at compile-time.
 * Events NOT in this map fall back to `any[]` via the generic signature.
 */
export interface SystemEventPayloads {
  [SystemEvents.CONTENT_UPDATE]: {
    collection: string;
    entryId: string;
    action: "create" | "update" | "delete";
  };
  [SystemEvents.CACHE_INVALIDATE]: { keys: string[] | "all" };
  [SystemEvents.CONFIG_CHANGE]: { key: string; previousValue: unknown; newValue: unknown };
  error: Error;
  "*": { event: string; data: unknown; args: unknown[] };
}

// ─── Event bus ───────────────────────────────────────────────────────────

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);

    // 🛡️ Default error sink — prevents fatal process termination when
    // an 'error' event is emitted with no active listeners.
    this.on("error", (err: Error) => {
      logger.error("[EventBus] Unhandled error event emitted:", err);
    });
  }

  /**
   * Overridden emit with strict typing, synchronous error catching, and
   * isolated wildcard emission.
   *
   * Events matching `SystemEventPayloads` keys get compile-time payload
   * enforcement. Arbitrary string events fall back to `any[]`.
   */
  emit<K extends keyof SystemEventPayloads | (string & {})>(
    event: K,
    ...args: K extends keyof SystemEventPayloads ? [SystemEventPayloads[K]] : any[]
  ): boolean {
    let wasHandled = false;

    // Isolate the main emission
    try {
      wasHandled = super.emit(event as string | symbol, ...args);
    } catch (err) {
      logger.error(`[EventBus] Synchronous listener crashed on event: ${String(event)}`, err);
    }

    // Isolate the wildcard emission so it cannot sabotage the main event chain
    if (event !== "*") {
      try {
        super.emit("*", { event: String(event), data: args[0], args });
      } catch (err) {
        logger.error("[EventBus] Wildcard listener crashed:", err);
      }
    }

    return wasHandled;
  }

  /**
   * Broadcast an event asynchronously to prevent blocking the caller's
   * execution thread (e.g., HTTP response handlers).
   */
  broadcast<K extends keyof SystemEventPayloads | (string & {})>(
    event: K,
    data: K extends keyof SystemEventPayloads ? SystemEventPayloads[K] : any,
  ): void {
    logger.debug(`[EventBus] Broadcasting event: ${String(event)}`);
    process.nextTick(() => {
      (this.emit as any)(event, data);
    });
  }
}

export const eventBus = new EventBus();
