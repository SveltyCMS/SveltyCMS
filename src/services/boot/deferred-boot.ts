/**
 * @file src/services/boot/deferred-boot.ts
 * @description Defer background-service startup until after the boot promise resolves.
 *
 * A process does not need schedulers, watchdogs, telemetry, the outbox or the
 * behavioral engine to answer a health probe or a page request, yet starting
 * them inside the READY transition delays first-request readiness by their whole
 * synchronous cost. This module owns the deferral so the caller keeps a plain
 * list of start calls.
 *
 * Features:
 * - One macrotask deferral (`setTimeout(…, 0)`): the current microtask/IO turn
 *   (DB init, state-machine transition, request pipeline) finishes first.
 * - Process-wide idempotency latch on `globalThis`, so an HMR re-evaluation of
 *   the caller cannot stack a second set of pollers.
 * - Failure containment: a throwing or rejecting start is logged, never fatal —
 *   a background service must not take the server down.
 * - Static ESM only; no import from `hooks.server.ts` (avoids a cycle).
 */

import { logger } from "@utils/logger";

/** Latches across HMR re-evaluations of both the caller and this module. */
type BootGlobal = typeof globalThis & {
  __SVELTY_BACKGROUND_BOOT_SCHEDULED__?: boolean;
};

/**
 * Run `start` one macrotask after the current turn, exactly once per process.
 *
 * The start may be async (WAL housekeeping is awaited by its caller); a rejected
 * promise is caught here because nothing awaits the timer callback.
 */
export function scheduleBackgroundBoot(
  start: () => void | Promise<void>,
  label = "Background",
): void {
  const bootGlobal = globalThis as BootGlobal;

  if (bootGlobal.__SVELTY_BACKGROUND_BOOT_SCHEDULED__) {
    logger.debug(`[${label}] Deferred background boot already scheduled — ignoring duplicate`);
    return;
  }
  bootGlobal.__SVELTY_BACKGROUND_BOOT_SCHEDULED__ = true;

  setTimeout(() => {
    const onError = (err: unknown) => {
      logger.error(`[${label}] Deferred background boot failed`, err);
    };
    try {
      const started = start();
      if (started instanceof Promise) {
        void started.catch(onError);
      }
    } catch (err) {
      // A deferred service that throws must not surface as an uncaught exception.
      onError(err);
    }
  }, 0);
}
