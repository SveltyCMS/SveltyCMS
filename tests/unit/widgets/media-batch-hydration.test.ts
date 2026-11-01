/**
 * @file tests/unit/widgets/media-batch-hydration.test.ts
 * @description MEDIA N+1 regression guard (audit 2026-10-31, m5).
 *
 * The media widget's display pillar renders one cell per list row. Before this
 * fix each cell fetched its own document, so a 25-row entry list issued 25
 * `GET /api/media/:id` requests (measured below as the "legacy" control). The
 * shared coalescer must turn the same work into ONE request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_BATCH_LIMIT,
  loadMediaDocs,
  mediaBatchStats,
  resetMediaCache,
} from "@src/widgets/core/media-upload/media-cache";

const ROWS = 25;

function rows(count = ROWS): string[] {
  return Array.from({ length: count }, (_, i) => `media-${i}`);
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** Server answer for the ids embedded in a batch-get URL. */
function batchResponse(url: string) {
  const ids = decodeURIComponent(String(url).split("ids=")[1] ?? "").split(",");
  return okJson({
    success: true,
    data: ids.map((id) => ({
      _id: id,
      filename: `${id}.jpg`,
      mimeType: "image/jpeg",
      size: 1024,
      path: `mediaFolder/${id}.jpg`,
    })),
  });
}

describe("media widget hydration (m5: one request per list page)", () => {
  beforeEach(() => {
    resetMediaCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("CONTROL: the pre-fix per-row fetch shape costs one request per row", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const id = String(url).split("/").pop();
      return okJson({ success: true, data: { _id: id, filename: `${id}.jpg` } });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Exactly what display.svelte did before the fix: per-cell `/api/media/:id`.
    for (const id of rows()) {
      const response = await fetch(`/api/media/${encodeURIComponent(id)}`);
      await response.json();
    }

    expect(fetchMock).toHaveBeenCalledTimes(ROWS);
  });

  it("issues ONE batch request for a 25-row list", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => batchResponse(String(url)));
    vi.stubGlobal("fetch", fetchMock);

    // One effect per row, all in the same task — the coalescer must merge them.
    const perRow = rows().map((id) => loadMediaDocs([id]));
    const resolved = await Promise.all(perRow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mediaBatchStats.requests).toBe(1);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/media/batch-get?ids=");
    expect(decodeURIComponent(url)).toContain("media-0");
    expect(decodeURIComponent(url)).toContain("media-24");

    for (const id of rows()) {
      expect(resolved[Number(id.split("-")[1])]?.get(id)?._id).toBe(id);
    }
  });

  it("serves repeat renders from the cache without another request", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => batchResponse(String(url)));
    vi.stubGlobal("fetch", fetchMock);

    await loadMediaDocs(rows());
    const again = await loadMediaDocs(rows());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.size).toBe(ROWS);
  });

  it(`splits above ${MEDIA_BATCH_LIMIT} distinct ids into capped requests`, async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => batchResponse(String(url)));
    vi.stubGlobal("fetch", fetchMock);

    const ids = rows(MEDIA_BATCH_LIMIT + 40);
    const resolved = await loadMediaDocs(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resolved.size).toBe(MEDIA_BATCH_LIMIT + 40);
  });

  it("resolves missing documents as null instead of throwing", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await loadMediaDocs(rows(3));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved.size).toBe(0);
  });
});
