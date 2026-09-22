/**
 * @file tests/benchmarks/modules/seed-burst.ts
 * @description HTTP collection seed burst with retry + dataset-integrity gate.
 *
 * Features:
 * - Batch path: chunked `POST /api/collections/:id/bulk` (default 500 items, the
 *   migration-scale batch size) — dataset setup stops dominating harness wall time
 * - Per-item path (`chunkSize: 1`) kept verbatim for A/B measurement and for
 *   callers that want the measured create lane to seed themselves
 * - Chunk-level fallback to per-item creates: a non-retryable bulk failure never
 *   loses rows silently, it degrades to the per-item path for that range
 * - Retries 401/429/503 and socket drops (the 14/100k silent-reject class)
 * - Logs status/body on non-retryable failures (no more silent `catch {}`)
 * - Aborts when created !== requested so 100k workloads never run short
 */

import { logger } from "@utils/logger";

const TRANSIENT = new Set([401, 408, 429, 502, 503]);
const MAX_ATTEMPTS = 5;

/** Default batch size — matches `migration-scale.test.ts` BATCH_SIZE and stays ≤ MAX_BULK_ITEMS. */
export const DEFAULT_SEED_CHUNK_SIZE = 500;

export interface SeedBurstOptions {
  url: string;
  headers: Record<string, string>;
  count: number;
  concurrency: number;
  payloadAt: (i: number) => unknown;
  existing?: string[];
  retryDelayMultiplier?: number;
  /**
   * Items per bulk POST. `1` reproduces the original per-item create lane;
   * `0`/undefined uses `DEFAULT_SEED_CHUNK_SIZE`.
   */
  chunkSize?: number;
}

export async function seedHttpCollectionBurst(opts: SeedBurstOptions): Promise<string[]> {
  const createdIds = opts.existing ?? [];
  const start = createdIds.length;
  const needed = opts.count - start;
  if (needed <= 0) return createdIds;

  const chunkSize =
    opts.chunkSize === 0 ? DEFAULT_SEED_CHUNK_SIZE : (opts.chunkSize ?? DEFAULT_SEED_CHUNK_SIZE);
  const failures: string[] = [];

  if (chunkSize > 1) {
    await seedBurstChunked(opts, start, createdIds, chunkSize, failures);
  } else {
    await seedBurstPerItem(opts, start, createdIds, failures);
  }

  if (createdIds.length !== opts.count) {
    const sample = failures.slice(0, 8).join(" | ");
    throw new Error(
      `Dataset integrity: seeded ${createdIds.length}/${opts.count} (lost ${opts.count - createdIds.length}). ${sample}`,
    );
  }
  return createdIds;
}

/** Per-item POST loop (original behavior — one create request per document). */
async function seedBurstPerItem(
  opts: SeedBurstOptions,
  start: number,
  createdIds: string[],
  failures: string[],
): Promise<void> {
  let nextIndex = start;

  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= opts.count) break;
        const id = await seedOne(
          opts.url,
          opts.headers,
          opts.payloadAt(i),
          i,
          failures,
          opts.retryDelayMultiplier,
        );
        if (id) createdIds.push(id);
      }
    }),
  );
}

/**
 * Chunked `POST …/bulk` loop. Workers claim chunks off a shared cursor, so a slow
 * chunk never idles the pool. A chunk that fails on a retryable status is retried;
 * anything else (or a response whose `data` length does not match the chunk) falls
 * back to per-item creates for that range — rows are never dropped silently.
 */
async function seedBurstChunked(
  opts: SeedBurstOptions,
  start: number,
  createdIds: string[],
  chunkSize: number,
  failures: string[],
): Promise<void> {
  const bulkUrl = `${opts.url.replace(/\/+$/, "")}/bulk`;
  const total = opts.count - start;
  const chunkCount = Math.ceil(total / chunkSize);
  let nextChunk = 0;

  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
      while (true) {
        const chunk = nextChunk++;
        if (chunk >= chunkCount) break;
        const from = start + chunk * chunkSize;
        const to = Math.min(opts.count, from + chunkSize);

        const ids = await seedChunk(bulkUrl, opts, from, to, failures);
        if (ids) {
          for (let i = 0; i < ids.length; i++) createdIds.push(ids[i]!);
          continue;
        }
        // Bulk path unavailable/failed for this range — degrade, never drop.
        for (let i = from; i < to; i++) {
          const id = await seedOne(
            opts.url,
            opts.headers,
            opts.payloadAt(i),
            i,
            failures,
            opts.retryDelayMultiplier,
          );
          if (id) createdIds.push(id);
        }
      }
    }),
  );
}

/** One chunk POST. Returns the created ids in payload order, or null to fall back. */
async function seedChunk(
  bulkUrl: string,
  opts: SeedBurstOptions,
  from: number,
  to: number,
  failures: string[],
): Promise<string[] | null> {
  const payload: unknown[] = [];
  for (let i = from; i < to; i++) payload.push(opts.payloadAt(i));
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(bulkUrl, { method: "POST", headers: opts.headers, body });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ _id?: string; id?: string }> };
        const rows = Array.isArray(json?.data) ? json.data : [];
        if (rows.length !== payload.length) {
          failures.push(`bulk[${from}..${to}) returned ${rows.length}/${payload.length} rows`);
          return null;
        }
        const ids: string[] = [];
        for (let i = 0; i < rows.length; i++) {
          const id = rows[i]?._id || rows[i]?.id;
          if (!id) {
            failures.push(`bulk[${from}..${to}) row ${i} has no id`);
            return null;
          }
          ids.push(String(id));
        }
        return ids;
      }
      const text = await res.text().catch(() => "");
      if (TRANSIENT.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
        if ((opts.retryDelayMultiplier ?? 40) > 0) {
          await sleep((opts.retryDelayMultiplier ?? 40) * (attempt + 1) * (attempt + 1));
        }
        continue;
      }
      failures.push(`bulk[${from}..${to}) HTTP ${res.status} ${text.slice(0, 160)}`);
      logger.warn(`[SeedBurst] bulk HTTP ${res.status} [${from}..${to}): ${text.slice(0, 200)}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        if ((opts.retryDelayMultiplier ?? 40) > 0) {
          await sleep((opts.retryDelayMultiplier ?? 40) * (attempt + 1) * (attempt + 1));
        }
        continue;
      }
      failures.push(`bulk[${from}..${to}) ${msg}`);
      logger.warn(`[SeedBurst] bulk network [${from}..${to}): ${msg}`);
      return null;
    }
  }
  return null;
}

async function seedOne(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  index: number,
  failures: string[],
  retryDelayMultiplier = 40,
): Promise<string | null> {
  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body });
      if (res.ok) {
        const json = (await res.json()) as { data?: { _id?: string; id?: string } };
        const id = json?.data?._id || json?.data?.id;
        if (id) return String(id);
        failures.push(`i=${index} ok-without-id`);
        return null;
      }
      const text = await res.text().catch(() => "");
      if (TRANSIENT.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
        if (retryDelayMultiplier > 0) {
          await sleep(retryDelayMultiplier * (attempt + 1) * (attempt + 1));
        }
        continue;
      }
      failures.push(`i=${index} HTTP ${res.status} ${text.slice(0, 160)}`);
      logger.warn(`[SeedBurst] HTTP ${res.status} i=${index}: ${text.slice(0, 200)}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        if (retryDelayMultiplier > 0) {
          await sleep(retryDelayMultiplier * (attempt + 1) * (attempt + 1));
        }
        continue;
      }
      failures.push(`i=${index} ${msg}`);
      logger.warn(`[SeedBurst] network i=${index}: ${msg}`);
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
