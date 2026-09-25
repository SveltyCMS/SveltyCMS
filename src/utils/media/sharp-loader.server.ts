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

import { raise, rethrow } from "@utils/error-handling";
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
      .then((mod) => (mod.default || mod) as SharpFactory)
      .catch((err: unknown) => {
        rethrow(err);
        sharpPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        throw raise(500, `Image engine (sharp) failed to load: ${msg}`, "SHARP_LOAD_FAILED");
      });
  }
  return sharpPromise;
}
