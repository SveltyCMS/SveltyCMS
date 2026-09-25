/**
 * @file src/utils/media/variant-job-scheduler.server.ts
 * @description Single-flight, bounded-concurrency scheduler for deferred variant jobs.
 *
 * ### Design
 * - **Single-flight per (tenantId, hash)**: concurrent uploads or repairs of the
 *   same bytes share ONE preset pipeline run; every subscriber receives the same
 *   variant list and updates its own media record. Identical bytes never
 *   re-encode in parallel.
 * - **Bounded concurrency**: bulk imports previously fired one full preset
 *   pipeline per upload simultaneously, saturating libvips threads and
 *   raw-buffer memory. Jobs run FIFO, `SVELTY_VARIANT_JOBS` (default 2) at a
 *   time — upload responses stay unaffected (fire-and-forget).
 * - **Failure isolation**: a failed pipeline logs and resolves empty — the
 *   original file stays intact and subscribers no-op. Variant paths are
 *   deterministic, so a lost job self-heals on the next dedupe repair.
 *
 * Features:
 * - Per-process singleton shared across MediaService instances
 * - FIFO with dedupe across queued + running keys
 * - Env-tunable concurrency (`SVELTY_VARIANT_JOBS`, 1–8, default 2)
 */

import { logger } from "@utils/logger";
import type { ImageVariant } from "@src/services/media/image-processor";
import { processImageWithPresets } from "@src/services/media/image-processor";
import { getFile } from "@utils/media/media-storage.server";
import type { DatabaseId } from "@src/content/types";

/** Presets every deferred job runs (same set the streamed path always used). */
const VARIANT_PRESETS = ["thumbnail", "card", "default"] as const;

const MAX_CONCURRENT = (() => {
  const env = Number(process.env.SVELTY_VARIANT_JOBS);
  return Number.isFinite(env) && env > 0 ? Math.min(Math.max(1, Math.floor(env)), 8) : 2;
})();

interface QueuedJob {
  key: string;
  hash: string;
  relPath: string;
  tenantId?: DatabaseId | null;
  /** Resolves the shared promise every subscriber of this key is waiting on. */
  resolve: (variants: ImageVariant[]) => void;
}

export interface VariantJobRequest {
  hash: string;
  relPath: string;
  tenantId?: DatabaseId | null;
  /** Invoked exactly once per subscriber with the resolved variant list. */
  onVariants: (variants: ImageVariant[]) => Promise<void>;
}

/**
 * Key → shared promise. The shared promise ALWAYS resolves (empty list on
 * failure), so subscribers never see a rejection and the map entry is safe to
 * delete once the run finishes.
 */
const inflight = new Map<string, Promise<ImageVariant[]>>();
const queue: QueuedJob[] = [];
let activeLanes = 0;

function subscribe(
  shared: Promise<ImageVariant[]>,
  onVariants: VariantJobRequest["onVariants"],
): void {
  shared.then((variants) => {
    onVariants(variants).catch((err: unknown) => {
      logger.warn("[MediaVariant] Record update after variant generation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}

async function runLane(): Promise<void> {
  activeLanes++;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      try {
        const fileBuffer = await getFile(job.relPath);
        const variants = await processImageWithPresets(
          fileBuffer,
          job.hash,
          [...VARIANT_PRESETS],
          job.tenantId,
        );
        job.resolve(variants);
      } catch (err: unknown) {
        logger.warn("[MediaVariant] Background variant generation failed — original intact", {
          error: err instanceof Error ? err.message : String(err),
        });
        job.resolve([]);
      } finally {
        inflight.delete(job.key);
      }
    }
  } finally {
    activeLanes--;
  }
}

/**
 * Schedule deferred variant generation for one uploaded file. Safe to call
 * concurrently for the same (tenantId, hash): one pipeline runs, every
 * subscriber gets the same list for its own record update.
 */
export function scheduleVariantJob(req: VariantJobRequest): void {
  const key = `${req.tenantId ?? "global"}:${req.hash}`;

  const existing = inflight.get(key);
  if (existing) {
    subscribe(existing, req.onVariants);
    return;
  }

  const shared = new Promise<ImageVariant[]>((resolve) => {
    queue.push({ key, hash: req.hash, relPath: req.relPath, tenantId: req.tenantId, resolve });
  });
  inflight.set(key, shared);
  subscribe(shared, req.onVariants);

  if (activeLanes < MAX_CONCURRENT) void runLane();
}

/** Test/telemetry probe: how many pipeline runs are currently queued+inflight. */
export function pendingVariantJobs(): number {
  return inflight.size;
}
