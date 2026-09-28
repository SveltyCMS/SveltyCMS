/**
 * @file src/hooks/response-compression-stash.ts
 * @description Off-request-path compression variants for L1 turbo entries.
 *
 * Lane-served responses never reach `handleCompression` (every fast lane is in
 * `LANE_BYPASSED_HOOKS`), and `serveTurboCacheEntry` can only serve an encoded
 * variant that was attached to the entry — so without a stash every lane-served
 * list leaves the socket uncompressed, however large. Measured 2026-09-28: a
 * 260 791 B list answered a zstd-only client with identity bytes and the whole
 * zstd/co-tenant scenario in `api-latency.test.ts` was unmeasurable.
 *
 * ### Contract
 * - **One compression per cached body, off the request path.** The stash runs
 *   after the response is on the wire; miss latency and the event loop are never
 *   charged. zstd prefers the native async API (libuv worker pool, CMS
 *   dictionary); br/gzip are only attempted at/below `SYNC_MAX_SIZE` because
 *   their runtimes offer no async API (the FIX 7/8 size guard).
 * - **Point-read misses are skipped**: per-id keys are high-cardinality, so
 *   variant CPU on the miss path would be spent on entries evicted long before a
 *   re-read. A point read that IS re-read (a turbo HIT) schedules the stash
 *   lazily — the second request is the proof that the key is worth compressing.
 * - **Bounded**: only bodies in `(STASH_MIN_BYTES, STASH_MAX_BYTES]`, one in-flight
 *   pass per key, expanded output dropped (a variant >= the original is a loss),
 *   and a body that produced no variants is marked attempted (`compressed: {}`)
 *   so later hits do not retry it forever.
 * - **Never resurrects a superseded body and never clears staleness**: the
 *   re-set carries `preserveStale`, and is skipped entirely when the cached
 *   body/etag changed while we compressed. A stale entry keeps serving its
 *   (stale) body — attaching variants to it is still a win.
 *
 * ### Features:
 * - one shared builder + scheduler for the read lane and the API dispatcher
 * - pure gates (`shouldStashVariants`) testable without running compression
 * - zero cost when disabled by size, cardinality or an unsupported runtime
 */

import { responseCache, type CachedResponseEntry } from "@src/services/cache/response-cache";
import {
  compressAsync,
  compressZstd,
  hasAsyncZstd,
  hasNativeCompression,
  SYNC_MAX_SIZE,
} from "./handle-compression";
import { logger } from "@utils/logger";

/** Below this, TURBO-HIT does not even negotiate (`serveTurboCacheEntry` gate). */
export const STASH_MIN_BYTES = 1024;

/**
 * Above this, three resident variants would rival the body itself in the L1
 * budget. The cap protects memory, not CPU (see `response-cache.entryBytes`).
 */
export const STASH_MAX_BYTES = 2 * 1024 * 1024;

/** Pure gate: size window + cardinality decision, no compression involved. */
export function shouldStashVariants(byteLength: number, skipPointRead: boolean): boolean {
  return !skipPointRead && byteLength > STASH_MIN_BYTES && byteLength <= STASH_MAX_BYTES;
}

/**
 * Build the negotiable variants for one body. Algorithms already present in
 * `have` (e.g. the variant a miss-response was served with) are not rebuilt.
 *
 * br/gzip are only attempted at or below `SYNC_MAX_SIZE` (synchronous APIs —
 * above the cap they would block the request thread, the FIX 7/8 contract).
 * zstd prefers the async API and falls back to a size-gated sync call inside
 * `compressZstd`. A variant that did not shrink the body is dropped.
 */
export async function buildCompressionVariants(
  body: string,
  byteLength: number,
  have?: Record<string, Uint8Array>,
): Promise<Record<string, Uint8Array>> {
  const variants: Record<string, Uint8Array> = {};
  if (have) {
    for (const [algo, variant] of Object.entries(have)) variants[algo] = variant;
  }
  const tasks: Promise<void>[] = [];

  if (!variants.br && hasNativeCompression() && byteLength <= SYNC_MAX_SIZE) {
    tasks.push(
      compressAsync(body, "br", byteLength)
        .then((br) => {
          if (br && br.byteLength < byteLength) variants.br = br;
        })
        .catch(() => {}),
    );
  }
  if (!variants.gzip && hasNativeCompression() && byteLength <= SYNC_MAX_SIZE) {
    tasks.push(
      compressAsync(body, "gzip", byteLength)
        .then((gz) => {
          if (gz && gz.byteLength < byteLength) variants.gzip = gz;
        })
        .catch(() => {}),
    );
  }

  if (!variants.zstd && (hasAsyncZstd() || byteLength <= SYNC_MAX_SIZE)) {
    tasks.push(
      compressZstd(body, byteLength)
        .then((zstd) => {
          if (zstd && zstd.byteLength < byteLength) variants.zstd = zstd;
        })
        .catch(() => {}),
    );
  }

  await Promise.all(tasks);
  return variants;
}

/** Keys with a variant pass in flight — a re-set must not double the work. */
const inFlight = new Set<string>();

export interface VariantStashArgs {
  key: string;
  body: string;
  etag: string;
  byteLength: number;
  ttlMs: number;
  tenantId?: string | null;
  setOptions?: { tags?: string[]; skipSharedL1?: boolean };
  /** `/:entryId` keys: high-cardinality, variant CPU does not pay off. */
  skipPointRead?: boolean;
  /** Variants already produced by the caller (miss-response encoding). */
  have?: Record<string, Uint8Array>;
}

/**
 * Attach compression variants to an already-cached turbo entry, off the request
 * path. Fire-and-forget: callers `void` the promise (it never rejects).
 */
export async function scheduleTurboVariantStash(args: VariantStashArgs): Promise<void> {
  if (!shouldStashVariants(args.byteLength, args.skipPointRead === true)) return;
  if (inFlight.has(args.key)) return;
  inFlight.add(args.key);
  try {
    const variants = await buildCompressionVariants(args.body, args.byteLength, args.have);
    const hasVariants = Object.keys(variants).length > 0;
    // The body may have been superseded while we compressed. Re-check, then
    // re-set with `preserveStale` so freshness stays the concurrent writer's
    // decision. An empty object marks "compression attempted, nothing shrank"
    // so a later HIT does not retry the same incompressible body forever.
    const current = responseCache.get(args.key, args.tenantId ?? null);
    if (!current || current.etag !== args.etag || current.body !== args.body) return;
    const entry: CachedResponseEntry = {
      body: args.body,
      etag: args.etag,
      compressed: hasVariants ? variants : {},
    };
    responseCache.set(args.key, entry, args.ttlMs, args.tenantId ?? null, {
      ...args.setOptions,
      preserveStale: true,
    });
  } catch (err) {
    logger.debug(
      `[variant-stash] skipped for ${args.key}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    inFlight.delete(args.key);
  }
}
