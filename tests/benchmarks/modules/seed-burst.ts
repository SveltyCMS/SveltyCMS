/**
 * @file tests/benchmarks/modules/seed-burst.ts
 * @description HTTP collection seed burst with retry + dataset-integrity gate.
 *
 * Features:
 * - Retries 401/429/503 and socket drops (the 14/100k silent-reject class)
 * - Logs status/body on non-retryable failures (no more silent `catch {}`)
 * - Aborts when created !== requested so 100k workloads never run short
 */

import { logger } from "@utils/logger";

const TRANSIENT = new Set([401, 408, 429, 502, 503]);
const MAX_ATTEMPTS = 5;

export async function seedHttpCollectionBurst(opts: {
  url: string;
  headers: Record<string, string>;
  count: number;
  concurrency: number;
  payloadAt: (i: number) => unknown;
  existing?: string[];
}): Promise<string[]> {
  const createdIds = opts.existing ?? [];
  const start = createdIds.length;
  const needed = opts.count - start;
  if (needed <= 0) return createdIds;

  let nextIndex = start;
  const failures: string[] = [];

  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= opts.count) break;
        const id = await seedOne(opts.url, opts.headers, opts.payloadAt(i), i, failures);
        if (id) createdIds.push(id);
      }
    }),
  );

  if (createdIds.length !== opts.count) {
    const sample = failures.slice(0, 8).join(" | ");
    throw new Error(
      `Dataset integrity: seeded ${createdIds.length}/${opts.count} (lost ${opts.count - createdIds.length}). ${sample}`,
    );
  }
  return createdIds;
}

async function seedOne(
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  index: number,
  failures: string[],
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
        await sleep(40 * (attempt + 1) * (attempt + 1));
        continue;
      }
      failures.push(`i=${index} HTTP ${res.status} ${text.slice(0, 160)}`);
      logger.warn(`[SeedBurst] HTTP ${res.status} i=${index}: ${text.slice(0, 200)}`);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(40 * (attempt + 1) * (attempt + 1));
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
