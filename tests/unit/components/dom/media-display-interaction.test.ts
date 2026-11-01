/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-display-interaction.test.ts
 * @description Real DOM tests for the read-only Media widget (entry-list cell).
 *
 * Regression pins for the 2026-10-21 recording: `/api/media/:id` answers with
 * `{ success, data }`, and reading fields off the envelope produced a broken
 * image in the entry list.
 *
 * ### Features:
 * - unwraps the API envelope before reading filename/thumbnails
 * - prefers the stored thumbnail over the original
 * - renders hydrated media objects without a network round-trip
 * - keeps an en dash for an empty value
 * - CONTROL: 25 mounted cells cost ONE `/api/media/batch-get` request and ZERO
 *   `/api/media/<id>` requests (the pre-fix per-cell shape)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaDisplay from "@src/widgets/core/media-upload/display.svelte";
import { resetMediaCache } from "@src/widgets/core/media-upload/media-cache";
import { createMediaRequestLog } from "../../widgets/media-request-log";
import { renderComponent, settle } from "./render";

/** One media document as the batch route delivers it. */
function mediaDoc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    filename: `${id}.jpg`,
    mimeType: "image/jpeg",
    url: `/files/original/${id}.jpg`,
    size: 1024,
    thumbnails: { thumbnail: { url: `/files/thumbnail/${id}.jpg` } },
    ...overrides,
  };
}

/**
 * Fetch stub for the media routes that counts every request by URL shape.
 *
 * A per-id `/api/media/<id>` call is still answered (with a single document) so
 * a regression to the per-cell shape fails on the counts instead of hanging on
 * an empty render — the URL is what the assertions pin, not the payload.
 */
function stubMediaFetch(fixtures: Record<string, Record<string, unknown>> = {}) {
  const { log, record } = createMediaRequestLog();
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const kind = record(url);
    const text = String(url);
    const ids =
      kind === "batch"
        ? decodeURIComponent(text.split("ids=")[1] ?? "")
            .split(",")
            .filter(Boolean)
        : [text.split("?")[0]?.split("/").pop() ?? ""];
    const data = ids.filter(Boolean).map((id) => fixtures[id] ?? mediaDoc(id));
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, log };
}

beforeEach(() => {
  resetMediaCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Media widget display (entry list)", () => {
  it("unwraps `{ success, data }` and renders the stored thumbnail", async () => {
    // The widget hydrates through the media BATCH route now (one request for every id
    // on the page), so the stub answers in that contract: `data` is an array.
    const { log } = stubMediaFetch({
      "media-1": mediaDoc("media-1", {
        filename: "photo.png",
        mimeType: "image/png",
        url: "/files/original/photo.png",
        size: 2048,
        thumbnails: { thumbnail: { url: "/files/thumbnail/photo.png" } },
        metadata: {},
      }),
    });

    const { target, cleanup } = renderComponent(MediaDisplay, { value: "media-1" });
    try {
      await settle();
      const img = await vi.waitFor(() => {
        const found = target.querySelector<HTMLImageElement>("img");
        expect(found).not.toBeNull();
        return found!;
      });

      expect(img.getAttribute("src")).toBe("/files/thumbnail/photo.png");
      expect(img.getAttribute("alt")).toBe("photo.png");
      expect(img.getAttribute("title")).toBe("photo.png");

      // One request, and it is the batch route.
      expect(log.urls).toHaveLength(1);
      expect(log.batch).toBe(1);
      expect(log.perId).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("CONTROL: 25 mounted cells cost ONE batch-get and no per-id request", async () => {
    const { fetchMock, log } = stubMediaFetch();
    const ids = Array.from({ length: 25 }, (_, i) => `row-${i}`);

    // One MediaDisplay per table cell: exactly the shape that used to issue one
    // `GET /api/media/<id>` per row. Mounted synchronously so the coalescer sees
    // all 25 ids in the same task.
    const mounted = ids.map((id) => renderComponent(MediaDisplay, { value: id }));
    try {
      await settle();
      await vi.waitFor(() => {
        expect(log.batch).toBe(1);
      });

      expect(log.perId).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(decodeURIComponent(log.urls[0] ?? "")).toContain("row-0");
      expect(decodeURIComponent(log.urls[0] ?? "")).toContain("row-24");

      // Every cell rendered its thumbnail from that one response.
      await vi.waitFor(() => {
        const missing = mounted.filter(({ target }) => !target.querySelector("img"));
        expect(missing).toHaveLength(0);
      });

      for (const { target } of mounted) {
        const img = target.querySelector<HTMLImageElement>("img");
        expect(img?.getAttribute("src")).toMatch(/^\/files\/thumbnail\/row-\d+\.jpg$/);
      }
    } finally {
      for (const { cleanup } of mounted) cleanup();
    }
  });

  it("renders a hydrated media object without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { target, cleanup } = renderComponent(MediaDisplay, {
      value: [
        {
          _id: "media-2",
          filename: "inline.jpg",
          mimeType: "image/jpeg",
          url: "/files/inline.jpg",
        },
      ],
    });

    try {
      await settle();
      const img = target.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("/files/inline.jpg");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("renders an en dash when no media is selected", async () => {
    const { target, cleanup } = renderComponent(MediaDisplay, { value: null });
    try {
      await settle();
      expect(target.textContent).toContain("–");
      expect(target.querySelector("img")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
