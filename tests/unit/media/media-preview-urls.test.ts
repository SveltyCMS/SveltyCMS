/**
 * @file tests/unit/media/media-preview-urls.test.ts
 * @description Preview and asset URL resolution for gallery tiles.
 *
 * ### Features:
 * - Absolute URLs stay untouched when `MEDIASERVER_URL` is configured
 * - Relative `/files/...` URLs are prefixed with the media server
 * - Thumbnail-only previews never leak the original document URL
 * - The rendition ladder is ordered and de-duplicated
 */

import { afterEach, describe, expect, it } from "vitest";
import { publicEnv } from "@src/stores/global-settings.svelte";
import {
  mediaDisplayUrl,
  mediaPreviewCandidates,
  mediaThumbnailUrl,
  mediaUrl,
} from "../../../src/utils/media/media-utils";
import type { MediaItem } from "../../../src/utils/media/media-models";

const MEDIA_SERVER = "https://media.example.com";

/** Minimal media record for `mediaUrl()` — only `url` is read on these paths. */
function original(url: string): MediaItem {
  return { url } as unknown as MediaItem;
}

afterEach(() => {
  publicEnv.MEDIASERVER_URL = undefined;
});

describe("mediaUrl — media server handling", () => {
  it("leaves absolute URLs untouched", () => {
    publicEnv.MEDIASERVER_URL = MEDIA_SERVER;

    expect(mediaUrl(original("https://cdn.example.com/global/hero.jpg"))).toBe(
      "https://cdn.example.com/global/hero.jpg",
    );
    expect(mediaUrl(original("http://cdn.example.com/global/hero.jpg"))).toBe(
      "http://cdn.example.com/global/hero.jpg",
    );
  });

  it("prefixes relative /files/ URLs when a media server is configured", () => {
    publicEnv.MEDIASERVER_URL = `${MEDIA_SERVER}/`;

    expect(mediaUrl(original("/files/global/hash/original/hero.jpg"))).toBe(
      `${MEDIA_SERVER}/files/global/hash/original/hero.jpg`,
    );
    expect(mediaUrl(original("global/hash/original/hero.jpg"))).toBe(
      `${MEDIA_SERVER}/files/global/hash/original/hero.jpg`,
    );
  });

  it("returns the relative URL when no media server is configured", () => {
    expect(mediaUrl(original("/files/global/hash/original/hero.jpg"))).toBe(
      "/files/global/hash/original/hero.jpg",
    );
    expect(mediaUrl(original("global/hash/original/hero.jpg"))).toBe(
      "/files/global/hash/original/hero.jpg",
    );
  });

  it("resolves a requested size through the same helper", () => {
    publicEnv.MEDIASERVER_URL = MEDIA_SERVER;

    const item = {
      type: "image",
      url: "/files/global/original/hero.jpg",
      thumbnails: { sm: { url: "/files/global/sm/hero.jpg" } },
    } as unknown as MediaItem;

    expect(mediaUrl(item, "sm")).toBe(`${MEDIA_SERVER}/files/global/sm/hero.jpg`);
  });
});

describe("mediaThumbnailUrl — document previews", () => {
  it("never falls back to the original document URL", () => {
    expect(mediaThumbnailUrl({ url: "/files/global/report.pdf" })).toBe("");
    expect(
      mediaThumbnailUrl({
        url: "/files/global/report.pdf",
        thumbnail: { url: "/files/global/report-normalized.jpg" },
      }),
    ).toBe("");
  });

  it("returns the first available derivative", () => {
    expect(
      mediaThumbnailUrl({
        url: "/files/global/report.pdf",
        thumbnails: { md: { url: "/files/global/md.jpg" } },
      }),
    ).toBe("/files/global/md.jpg");
  });
});

describe("mediaPreviewCandidates — rendition ladder", () => {
  const item = {
    url: "/files/global/original/hero.jpg",
    thumbnail: { url: "/files/global/normalized.jpg" },
    thumbnails: {
      thumbnail: { url: "/files/global/thumbnail.jpg" },
      sm: { url: "/files/global/sm.jpg" },
      md: { url: "/files/global/md.jpg" },
      lg: { url: "/files/global/lg.jpg" },
    },
  };

  it("starts with the preferred size, then thumbnail → sm → md → lg", () => {
    expect(mediaPreviewCandidates(item, "md")).toEqual([
      "/files/global/md.jpg",
      "/files/global/thumbnail.jpg",
      "/files/global/sm.jpg",
      "/files/global/lg.jpg",
    ]);
  });

  it("appends the normalized thumbnail and original only when asked", () => {
    expect(mediaPreviewCandidates(item, "thumbnail")).toEqual([
      "/files/global/thumbnail.jpg",
      "/files/global/sm.jpg",
      "/files/global/md.jpg",
      "/files/global/lg.jpg",
    ]);

    expect(mediaPreviewCandidates(item, "thumbnail", { includeOriginal: true })).toEqual([
      "/files/global/thumbnail.jpg",
      "/files/global/sm.jpg",
      "/files/global/md.jpg",
      "/files/global/lg.jpg",
      "/files/global/normalized.jpg",
      "/files/global/original/hero.jpg",
    ]);
  });

  it("resolves every candidate through the media server", () => {
    publicEnv.MEDIASERVER_URL = MEDIA_SERVER;

    expect(mediaPreviewCandidates(item, "sm")).toEqual([
      `${MEDIA_SERVER}/files/global/sm.jpg`,
      `${MEDIA_SERVER}/files/global/thumbnail.jpg`,
      `${MEDIA_SERVER}/files/global/md.jpg`,
      `${MEDIA_SERVER}/files/global/lg.jpg`,
    ]);
  });

  it("drops empty and duplicate URLs", () => {
    expect(
      mediaPreviewCandidates(
        {
          url: "/files/global/original/hero.jpg",
          thumbnail: { url: "/files/global/original/hero.jpg" },
          thumbnails: {
            thumbnail: { url: "" },
            sm: { url: "/files/global/sm.jpg" },
            md: { url: "/files/global/sm.jpg" },
          },
        },
        "thumbnail",
        { includeOriginal: true },
      ),
    ).toEqual(["/files/global/sm.jpg", "/files/global/original/hero.jpg"]);
  });
});

describe("mediaDisplayUrl — absolute candidates", () => {
  it("leaves an absolute derivative untouched when a media server is configured", () => {
    publicEnv.MEDIASERVER_URL = MEDIA_SERVER;

    expect(
      mediaDisplayUrl({
        url: "/files/global/original/hero.jpg",
        thumbnails: { sm: { url: "https://cdn.example.com/global/sm.jpg" } },
      }),
    ).toBe("https://cdn.example.com/global/sm.jpg");
  });
});
