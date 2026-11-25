/**
 * @file src/utils/media/sharp-loader.server.ts
 * @description Single shared lazy loader for the sharp image engine (libvips).
 *
 * ### Design
 * - ONE memoized warm-up path per process. Previously the codebase had five
 *   independent sharp loaders plus inline `import("sharp")` sites, each with
 *   its own `any`-typed handle and its own first-request stall.
 * - Fail-fast with a named code: a broken/missing sharp install raises
 *   `SHARP_LOAD_FAILED` instead of degrading silently into empty variants.
 * - `MAX_INPUT_PIXELS` is the one decompression-bomb guard every pipeline
 *   shares (100 MP — stricter than sharp's own 268 MP default).
 *
 * Features:
 * - Single warm-up, retryable on failure
 * - Typed `SharpFactory` (no `any` at call sites)
 * - Shared pixel-bomb ceiling for metadata + variant + editor pipelines
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { raise, rethrow } from "@utils/error-handling";
import { getHardwareProfile } from "@utils/hardware-profile";
import type sharp from "sharp";
import type { OverlayOptions } from "sharp";

/** Decompression-bomb guard shared by every Sharp pipeline (100 MP). */
export const MAX_INPUT_PIXELS = 100_000_000;

/** The sharp module's callable default export (factory + static knobs). */
export type SharpFactory = typeof sharp;
export type SharpOverlayOptions = OverlayOptions;

let sharpPromise: Promise<SharpFactory> | null = null;

/**
 * Resolve the process-wide sharp factory, importing it on first use.
 * The promise is memoized so every consumer shares one warm-up; a failed
 * import resets the memo so a later call can retry (e.g. after a repair).
 */
export function getSharp(): Promise<SharpFactory> {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((mod) => {
        const sharp = (mod.default || mod) as SharpFactory;
        // Apply the hardware profile's libvips knobs on FIRST USE, not at boot:
        // sharp is only needed by media routes, and loading libvips eagerly kept
        // its native heap resident on API-only deployments. Best-effort — a tuning
        // knob must never turn a healthy engine into a failed load.
        try {
          const hw = getHardwareProfile();
          sharp.concurrency(hw.sharpConcurrency);
          sharp.cache({ memory: 16, files: 10, items: 50 });
        } catch {
          /* tuning is best-effort */
        }
        return sharp;
      })
      .catch((err: unknown) => {
        rethrow(err);
        sharpPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        throw raise(500, `Image engine (sharp) failed to load: ${msg}`, "SHARP_LOAD_FAILED");
      });
  }
  return sharpPromise;
}

const sharpSlotContext = new AsyncLocalStorage<boolean>();
let sharpActiveCount = 0;
let sharpWaitQueue: Array<() => void> = [];
let sharpWaitHead = 0;

function getSharpPoolLimit(): number {
  const envLimit = Number(process.env.SVELTY_SHARP_POOL_LIMIT);
  if (Number.isFinite(envLimit) && envLimit >= 1) return Math.floor(envLimit);
  try {
    const hw = getHardwareProfile();
    return Math.max(1, Math.min(4, hw.sharpConcurrency));
  } catch {
    return 2;
  }
}

function acquireSharpSlot(): Promise<void> {
  const limit = getSharpPoolLimit();
  if (sharpActiveCount < limit) {
    sharpActiveCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    sharpWaitQueue.push(resolve);
  });
}

function releaseSharpSlot(): void {
  if (sharpWaitHead < sharpWaitQueue.length) {
    const next = sharpWaitQueue[sharpWaitHead++];
    if (sharpWaitHead >= sharpWaitQueue.length) {
      sharpWaitQueue = [];
      sharpWaitHead = 0;
    } else if (sharpWaitHead > 64 && sharpWaitHead * 2 >= sharpWaitQueue.length) {
      sharpWaitQueue = sharpWaitQueue.slice(sharpWaitHead);
      sharpWaitHead = 0;
    }
    next();
    return;
  }
  if (sharpActiveCount > 0) sharpActiveCount--;
}

/**
 * Execute a Sharp image pipeline inside a process-wide bounded concurrency slot.
 * Prevents simultaneous burst uploads or on-demand transforms from saturating libvips
 * threads and spiking native memory. Nested calls within the same async chain stay
 * re-entrant so helper calls cannot self-deadlock.
 */
export async function runWithSharpSlot<T>(task: () => Promise<T>): Promise<T> {
  if (sharpSlotContext.getStore()) {
    return task();
  }
  await acquireSharpSlot();
  try {
    return await sharpSlotContext.run(true, task);
  } finally {
    releaseSharpSlot();
  }
}

/** Inspect active/queued Sharp pool counts for observability and testing. */
export function getSharpPoolStats(): { active: number; queued: number; limit: number } {
  return {
    active: sharpActiveCount,
    queued: sharpWaitQueue.length - sharpWaitHead,
    limit: getSharpPoolLimit(),
  };
}
