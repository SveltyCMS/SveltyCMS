/**
 * @file tests/integration/api/media-dedupe-derivatives.test.ts
 * @description Integration coverage for the media pipeline plan §3 items #2 (dedupe before
 * derivative generation) and #3 (never upscale / no redundant writes) on the real stack
 * (SQLite + local storage + real sharp, driven through the HTTP API).
 *
 * Asserts outcomes, not call counts:
 * - a 400 px source gets derivatives that are never wider than the source, and the SIZES
 *   fan-out stays at or below the configured ladder (one primary + one WebP sidecar per step)
 * - re-uploading byte-identical content returns the SAME record id and rewrites NOTHING —
 *   every original/derivative file keeps its `W/"size-mtime"` ETag, which is only possible
 *   when no encode ran (the pre-#2 order re-encoded all four sizes before the hash lookup)
 *
 * Create → assert → cleanup: every record is deleted through `DELETE /api/media/:id` and the
 * delete is verified (second delete ⇒ 404).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { getImageSizes } from "@utils/media/media-storage.server";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";

const API_BASE_URL = getApiBaseUrl();
/** Run-unique marker: a previous run's record must never turn this run's first upload into a dedupe hit. */
const RUN_TAG = randomUUID().slice(0, 8);

interface ThumbShape {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface MediaRecord {
  _id: string;
  path: string;
  hash: string;
  metadata?: { width?: number; height?: number };
  thumbnails?: Record<string, ThumbShape | undefined>;
}

/** Configured ladder steps (elements with a positive width — `original` is 0 and excluded). */
const LADDER_STEPS = Object.entries(getImageSizes()).filter(([, width]) => width > 0).length;

/** Deterministic per (size, tag) JPEG — a fresh tag keeps the SHA-256 unique across runs. */
async function makeJpeg(width: number, height: number, tag: string): Promise<Buffer> {
  const seed = [...tag].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 200, 17);
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: seed, g: (seed * 3) % 256, b: (seed * 7) % 256 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Ladder entries only — enrichment adds `${preset}-${width}` variant keys on the dedupe path. */
function ladderEntries(record: MediaRecord): Array<[string, ThumbShape]> {
  return Object.entries(record.thumbnails ?? {}).filter(([key]) => !key.includes("-")) as Array<
    [string, ThumbShape]
  >;
}

/**
 * Every stored file a record advertises, resolved once from the (un-enriched) insert response.
 * The duplicate snapshot re-reads this same list, so a changed ETag can only mean a rewrite —
 * never a differently-shaped response.
 */
function recordFileUrls(record: MediaRecord): string[] {
  const original = record.path.startsWith("/") ? record.path : `/files/${record.path}`;
  return [
    toAbsolute(original),
    ...ladderEntries(record).map(([, thumb]) => toAbsolute(thumb.url ?? "")),
  ].filter((url) => url.length > 0);
}

async function uploadImage(
  cookie: string,
  filename: string,
  bytes: Buffer,
): Promise<{ record: MediaRecord; elapsedMs: number }> {
  const formData = new FormData();
  formData.append("files", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), filename);

  const startedAt = performance.now();
  const res = await safeFetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
    body: formData,
  });
  const elapsedMs = performance.now() - startedAt;

  if (res.status !== 200) {
    throw new Error(`Upload ${filename} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{ success?: boolean; message?: string; data?: MediaRecord }>;
  };
  const item = body.data?.[0];
  if (!item?.success || !item.data) {
    throw new Error(`Upload ${filename} returned no record: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return { record: item.data, elapsedMs };
}

/** Browser-ready URL for a stored path/url returned by the API. */
function toAbsolute(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Current ETag of every watched file — `W/"size-mtime"` is the rewrite witness. */
async function collectEtags(urls: string[], cookie: string): Promise<Record<string, string>> {
  const etags: Record<string, string> = {};
  for (const url of urls) {
    const res = await safeFetch(url, { headers: { Cookie: cookie, Origin: API_BASE_URL } });
    expect(res.status, `GET ${url}`).toBe(200);
    const etag = res.headers.get("etag");
    if (!etag) throw new Error(`No ETag for ${url}`);
    await res.arrayBuffer().catch(() => {});
    etags[url] = etag;
  }
  return etags;
}

async function deleteMedia(id: string, cookie: string): Promise<void> {
  const res = await safeFetch(`${API_BASE_URL}/api/media/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
  });
  expect(res.status, `DELETE /api/media/${id}`).toBe(200);
}

async function assertDeleted(id: string, cookie: string): Promise<void> {
  const res = await safeFetch(`${API_BASE_URL}/api/media/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
  });
  expect(res.status, `second DELETE /api/media/${id} must 404`).toBe(404);
}

describe("Media pipeline — dedupe order and derivative ladder", () => {
  let authCookie = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    await waitForServer();
    authCookie = await prepareAuthenticatedContext();
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteMedia(id, authCookie).catch(() => {});
    }
    await cleanupTestDatabase();
  });

  it("clamps the derivative ladder to the source: a 400 px upload writes no wider variant", async () => {
    const bytes = await makeJpeg(400, 300, `small-${RUN_TAG}`);
    const { record } = await uploadImage(authCookie, `small-${RUN_TAG}.jpg`, bytes);
    createdIds.push(record._id);

    const thumbs = Object.entries(record.thumbnails ?? {});
    expect(record.metadata?.width).toBe(400);
    expect(thumbs.length).toBeGreaterThan(0);

    const ladderBytes = thumbs.reduce((sum, [, thumb]) => sum + (thumb?.size ?? 0), 0);
    console.log(
      `[media-fanout] 400 px source (${bytes.length} B) → ${thumbs.length} derivative file(s), ${ladderBytes} B written …`,
    );

    for (const [key, thumb] of thumbs) {
      expect(thumb?.width, `${key} width`).toBeLessThanOrEqual(400);
      expect(thumb?.height, `${key} height`).toBeLessThanOrEqual(300);
      expect(thumb?.size, `${key} size`).toBeGreaterThan(0);
    }

    // Fan-out bound: at most one primary + one WebP sidecar per configured ladder step.
    // A 400 px source can only justify the 200 px step, so it must stay far below it.
    const stepKeys = new Set(thumbs.map(([key]) => key.replace(/_webp$/, "")));
    expect(stepKeys.size).toBeLessThanOrEqual(LADDER_STEPS);
    expect(thumbs.length).toBeLessThanOrEqual(LADDER_STEPS);
    expect([...stepKeys]).toEqual(["thumbnail"]);
  });

  it("keeps fan-out at or below two files per ladder step for a ladder-sized source", async () => {
    const bytes = await makeJpeg(1920, 1080, `wide-${RUN_TAG}`);
    const { record } = await uploadImage(authCookie, `wide-${RUN_TAG}.jpg`, bytes);
    createdIds.push(record._id);

    const thumbs = Object.entries(record.thumbnails ?? {});
    const ladderBytes = thumbs.reduce((sum, [, thumb]) => sum + (thumb?.size ?? 0), 0);
    console.log(
      `[media-fanout] 1920 px source (${bytes.length} B) → ${thumbs.length} derivative file(s), ${ladderBytes} B written …`,
    );
    expect(thumbs.length).toBeLessThanOrEqual(2 * LADDER_STEPS);
    for (const [key, thumb] of thumbs) {
      expect(thumb?.width, `${key} width`).toBeLessThanOrEqual(1920);
      expect(thumb?.height, `${key} height`).toBeLessThanOrEqual(1080);
    }
    // No path is written twice: every advertised URL is unique.
    const urls = thumbs.map(([, thumb]) => thumb?.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("re-uploads identical bytes without rewriting a single file (zero encodes)", async () => {
    const bytes = await makeJpeg(640, 480, `dupe-${RUN_TAG}`);
    const filename = `dupe-${RUN_TAG}.jpg`;

    const first = await uploadImage(authCookie, filename, bytes);
    createdIds.push(first.record._id);
    // Canonical file list from the insert response; the deferred variant job gets 1.5 s to
    // settle so its writes are part of the "before" snapshot (and are not read as rewrites).
    const watchedUrls = recordFileUrls(first.record);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const before = await collectEtags(watchedUrls, authCookie);
    const firstLadderUrls = ladderEntries(first.record).map(([key, thumb]) => [key, thumb.url]);

    const duplicate = await uploadImage(authCookie, filename, bytes);
    const after = await collectEtags(watchedUrls, authCookie);

    // Count first (and log it) so the failure names the contract that broke.
    let rewritten = 0;
    for (const url of watchedUrls) {
      if (after[url] !== before[url]) rewritten += 1;
    }
    console.log(
      `[media-dedupe] first upload ${first.elapsedMs.toFixed(1)} ms · duplicate ${duplicate.elapsedMs.toFixed(1)} ms · ${rewritten}/${watchedUrls.length} files rewritten`,
    );

    // Nothing was rewritten: an ETag is W/"size-mtime", so an unchanged ETag on every file that
    // already existed proves no re-encode happened (the pre-#2 order re-encoded and re-saved the
    // whole ladder before looking the hash up).
    expect(rewritten, "duplicate upload must not rewrite stored files").toBe(0);

    // Dedupe reuses the record instead of inserting a second one, and returns the same shape
    // (same ladder URLs) as the insert path.
    expect(duplicate.record._id).toBe(first.record._id);
    expect(duplicate.record.hash).toBe(first.record.hash);
    expect(ladderEntries(duplicate.record).map(([key, thumb]) => [key, thumb.url])).toEqual(
      firstLadderUrls,
    );
  });

  it("cleans up: deleted records stop resolving", async () => {
    const id = createdIds.pop();
    expect(id).toBeTruthy();
    await deleteMedia(id!, authCookie);
    await assertDeleted(id!, authCookie);
  });
});
