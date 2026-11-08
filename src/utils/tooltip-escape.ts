/**
 * @file src/utils/tooltip-escape.ts
 * @description Single shared Escape-key dispatcher for tooltips.
 *
 * Every `Tooltip` instance used to render its own `<svelte:window onkeydown>`,
 * so an admin table with hundreds of tooltipped controls carried hundreds of
 * global listeners that were idle almost all the time. This module owns one
 * module-level listener, attached lazily on the first registration and removed
 * with the last subscriber.
 *
 * ### Features:
 * - one `keydown` listener for all tooltips (0 or 1 attached at any time)
 * - lazy attach/detach: idle tooltips register nothing
 * - Set semantics: duplicate registration is idempotent, unsubscribe is idempotent
 * - server-safe: registration is a no-op when `window` is unavailable
 * - test accessors expose live listener/handler counts
 */

import { logger } from "@utils/logger";

type EscapeHandler = () => void;

const handlers = new Set<EscapeHandler>();
let listenerAttached = false;

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  // Snapshot: a handler may unsubscribe itself or another tooltip while running.
  for (const handler of Array.from(handlers)) {
    try {
      handler();
    } catch (error) {
      logger.error("[TooltipEscape] Handler failed", error);
    }
  }
}

function attachListener(): void {
  if (listenerAttached) return;
  window.addEventListener("keydown", handleKeydown);
  listenerAttached = true;
}

function detachListener(): void {
  if (!listenerAttached) return;
  window.removeEventListener("keydown", handleKeydown);
  listenerAttached = false;
}

/**
 * Register a callback that runs when the user presses Escape.
 * Returns an idempotent unsubscribe function. No-op on the server.
 */
export function registerTooltipEscape(handler: EscapeHandler): () => void {
  if (typeof window === "undefined") return () => {};

  handlers.add(handler);
  attachListener();

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) detachListener();
  };
}

/** Number of `keydown` listeners owned by this dispatcher (0 or 1). */
export function tooltipEscapeListenerCount(): number {
  return listenerAttached ? 1 : 0;
}

/** Number of currently registered Escape handlers. */
export function tooltipEscapeHandlerCount(): number {
  return handlers.size;
}
