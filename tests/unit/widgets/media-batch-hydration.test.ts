/**
 * @file tests/unit/widgets/media-batch-hydration.test.ts
 * @description MEDIA N+1 regression guard (audit 2026-10-31, m5).
 *
 * The media widget's display pillar renders one cell per list row. Before this
 * fix every cell fetched its own document, so a 25-row entry list issued 25
 * `GET /api/media/:id` requests. The shared coalescer must turn the same work
 * into ONE `GET /api/media/batch-get` request and ZERO per-id requests.
 *
 * What regresses here is the request SHAPE, so every case counts calls by URL
 * through `media-request-log`. A stub that ignores its URL cannot tell the two
 * shapes apart, and a hand-written `fetch()` loop proves nothing about the
 * widget — the mounted-component control lives in
 * `tests/unit/components/dom/media-display-interaction.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_BATCH_LIMIT,
  loadMediaDocs,
  mediaBatchStats,
  resetMediaCache,
} from "@src/widgets/core/media-upload/media-cache";
import { classifyMediaUrl, createMediaRequestLog } from "./media-request-log";

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

/** Stub `fetch` that answers the batch contract and logs every URL asked for. */
function stubLoggedFetch() {
  const { log, record } = createMediaRequestLog();
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    record(url);
    return batchResponse(String(url));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, log };
}

describe("media widget hydration (m5: one request per list page)", () => {
  beforeEach(() => {
    resetMediaCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("CONTROL: the request log separates the pre-fix per-row shape from the batch shape", () => {
    // The counter must be able to FAIL on the shape it forbids, otherwise the
    // assertions below are vacuous.
    expect(classifyMediaUrl(`/api/media/${encodeURIComponent("media-7")}`)).toBe("per-id");
    expect(classifyMediaUrl("/api/media/batch-get?ids=media-0%2Cmedia-1")).toBe("batch");
    expect(classifyMediaUrl("/api/collections/entries")).toBe("other");
  });

  it("issues ONE batch request for a 25-row list and no per-id request", async () => {
    const { fetchMock, log } = stubLoggedFetch();

    // One effect per row, all in the same task — the coalescer must merge them.
    const perRow = rows().map((id) => loadMediaDocs([id]));
    const resolved = await Promise.all(perRow);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.batch).toBe(1);
    expect(log.perId).toBe(0);
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
    const { fetchMock, log } = stubLoggedFetch();

    await loadMediaDocs(rows());
    const again = await loadMediaDocs(rows());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.perId).toBe(0);
    expect(again.size).toBe(ROWS);
  });

  it(`splits above ${MEDIA_BATCH_LIMIT} distinct ids into capped requests`, async () => {
    const { fetchMock, log } = stubLoggedFetch();

    const ids = rows(MEDIA_BATCH_LIMIT + 40);
    const resolved = await loadMediaDocs(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log.batch).toBe(2);
    expect(log.perId).toBe(0);
    expect(resolved.size).toBe(MEDIA_BATCH_LIMIT + 40);
  });

  it("resolves missing documents as null instead of throwing", async () => {
    const { log, record } = createMediaRequestLog();
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      record(url);
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await loadMediaDocs(rows(3));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.perId).toBe(0);
    expect(resolved.size).toBe(0);
  });
});

it("never turns a placeholder row into a request (10 rows, half of them empty)", async () => {
  // The audited list stored "-" as DATA for an empty cell; the display still renders
  // an en dash. Neither may reach the wire: 10 rows -> ONE batch request carrying only
  // the 5 real ids, and no URL that mentions a placeholder.
  const tableRows = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? `media-${i}` : "-"));
  resetMediaCache();
  const { log } = stubLoggedFetch();

  const docs = await loadMediaDocs(tableRows);

  const urls = log.urls;
  const placeholderCalls = urls.filter(
    (u) => /\/api\/media\/[-\u2013\u2014]?($|\?)/.test(u) && !u.includes("batch-get"),
  );
  expect(placeholderCalls, "a placeholder must never be requested").toEqual([]);
  expect(urls.filter((u) => classifyMediaUrl(u) === "per-id")).toEqual([]);
  expect(urls.filter((u) => classifyMediaUrl(u) === "batch")).toHaveLength(1);
  expect(mediaBatchStats.requests).toBe(1);

  // Only the real ids are in the batch, and only they resolve.
  const batchUrl = urls.find((u) => u.includes("batch-get"))!;
  for (let i = 0; i < 10; i += 2) expect(batchUrl).toContain(`media-${i}`);
  expect(docs.size).toBe(5);
});
