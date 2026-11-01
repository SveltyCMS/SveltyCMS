/**
 * @file src/widgets/core/media-upload/media-cache.ts
 * @description Per-page cache + request coalescer for media documents.
 *
 * The Media widget and its read-only display pillar both hydrate assets from
 * the media API. An entry list renders one cell per row, so fetching per id
 * meant one `GET /api/media/:id` per row — a 25-row list cost 25 requests even
 * though the documents are small and shareable.
 *
 * Two layers fix that:
 * - `mediaCache` keeps the mapped `MediaFile` DTO per id (unchanged contract).
 * - `loadMediaDocs()` collects every id requested within the same task and
 *   issues ONE `GET /api/media/batch-get?ids=…` per ≤100 uncached ids, so a list
 *   of N rows costs one request instead of N.
 *
 * Server contract: `GET /api/media/batch-get?ids=a,b,c` answers
 * `{ success, data: MediaDoc[] }`.
 */

import type { MediaFile } from "./types";

/** One media document as delivered by the API. */
export type MediaDoc = Record<string, unknown>;

/** Mapped DTO cache shared by the widget and the display pillar. */
export const mediaCache = new Map<string, MediaFile>();

/** Raw documents, so both pillars keep their own field mapping. */
const docCache = new Map<string, MediaDoc>();

/** Ids waiting for the coalesced request, with their resolvers. */
let pendingIds = new Set<string>();
let pendingWaiters = new Map<string, Array<(doc: MediaDoc | null) => void>>();
let flushScheduled = false;

/** Server rejects more than this per request; stay below it. */
export const MEDIA_BATCH_LIMIT = 100;

/** Telemetry/test hook: how many HTTP requests the coalescer issued. */
export const mediaBatchStats = { requests: 0 };

/** Seed the raw cache (for callers that already hold the document). */
export function cacheMediaDoc(id: string, doc: MediaDoc): void {
  docCache.set(id, doc);
}

/** Read a cached raw document, if any. */
export function getCachedMediaDoc(id: string): MediaDoc | undefined {
  return docCache.get(id);
}

/** Clear every layer — used by tests and after a media mutation. */
export function resetMediaCache(): void {
  mediaCache.clear();
  docCache.clear();
  pendingIds.clear();
  pendingWaiters.clear();
  flushScheduled = false;
  mediaBatchStats.requests = 0;
}

function unwrapDoc(payload: unknown): MediaDoc | null {
  // The API answers `{ success, data }`; reading fields off the envelope
  // produced `undefined` for every field and a broken preview.
  const found =
    payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)
      ? (payload as { data?: unknown }).data
      : payload;
  return found && typeof found === "object" ? (found as MediaDoc) : null;
}

async function flushPending(): Promise<void> {
  flushScheduled = false;
  const batch = [...pendingIds];
  pendingIds = new Set();
  const waiters = pendingWaiters;
  pendingWaiters = new Map();

  const settle = (id: string, doc: MediaDoc | null) => {
    if (doc) docCache.set(id, doc);
    for (const resolve of waiters.get(id) ?? []) resolve(doc);
  };

  if (batch.length === 0) return;

  // One request per ≤limit chunk; a normal page (≤100 distinct ids) is one request.
  for (let start = 0; start < batch.length; start += MEDIA_BATCH_LIMIT) {
    const chunk = batch.slice(start, start + MEDIA_BATCH_LIMIT);
    try {
      mediaBatchStats.requests++;
      const response = await fetch(
        `/api/media/batch-get?ids=${encodeURIComponent(chunk.join(","))}`,
      );
      if (!response.ok) {
        for (const id of chunk) settle(id, null);
        continue;
      }
      const payload = (await response.json()) as unknown;
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { data?: unknown })?.data)
          ? ((payload as { data: unknown[] }).data as unknown[])
          : [];
      const byId = new Map<string, MediaDoc>();
      for (const item of items) {
        const doc = unwrapDoc(item);
        const id = doc ? String(doc._id ?? "") : "";
        if (doc && id) byId.set(id, doc);
      }
      for (const id of chunk) settle(id, byId.get(id) ?? null);
    } catch {
      for (const id of chunk) settle(id, null);
    }
  }
}

/**
 * Resolve media documents by id, coalescing every id requested in the same task
 * into one HTTP request. Cached ids never cause a request.
 */
/**
 * Values the list renders as "no media". They are DISPLAY placeholders, not ids, and
 * must never become a request: an entry list with 10 empty cells would otherwise ask
 * the server for `/api/media/-` ten times.
 */
const MEDIA_PLACEHOLDERS = new Set(["", "-", "\u2013", "\u2014"]);

function isMediaId(value: unknown): value is string {
  return typeof value === "string" && !MEDIA_PLACEHOLDERS.has(value.trim());
}

export function loadMediaDocs(ids: readonly string[]): Promise<Map<string, MediaDoc>> {
  const wanted = [...new Set(ids.filter(isMediaId))];
  const resolved = new Map<string, MediaDoc>();
  const misses: string[] = [];

  for (const id of wanted) {
    const cached = docCache.get(id);
    if (cached) resolved.set(id, cached);
    else misses.push(id);
  }

  if (misses.length === 0) return Promise.resolve(resolved);

  const waits = misses.map(
    (id) =>
      new Promise<MediaDoc | null>((resolve) => {
        pendingIds.add(id);
        const list = pendingWaiters.get(id);
        if (list) list.push(resolve);
        else pendingWaiters.set(id, [resolve]);
      }),
  );

  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => void flushPending());
  }

  return Promise.all(waits).then((docs) => {
    misses.forEach((id, index) => {
      const doc = docs[index];
      if (doc) resolved.set(id, doc);
    });
    return resolved;
  });
}
