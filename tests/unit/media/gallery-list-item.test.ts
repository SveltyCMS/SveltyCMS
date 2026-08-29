/**
 * @file tests/unit/media/gallery-list-item.test.ts
 * @description Gallery SSR row mapper — allowlisted fields only.
 */

import { describe, expect, it } from "vitest";
import { toGalleryListItem } from "@src/routes/(app)/mediagallery/gallery-list-item";

describe("toGalleryListItem", () => {
  it("keeps tile + details fields and drops advancedMetadata", () => {
    const row = toGalleryListItem({
      _id: "m1",
      hash: "abc",
      filename: "hero.jpg",
      mimeType: "image/jpeg",
      path: "global",
      url: "/files/global/original/hero.jpg",
      size: 1200,
      width: 800,
      height: 600,
      createdAt: "2026-08-23T00:00:00.000Z",
      thumbnails: {
        thumbnail: { url: "/files/global/thumbnail/hero.jpg", width: 200, height: 150, size: 40 },
        junk: { notUrl: true },
      },
      metadata: {
        focalPoint: { x: 40, y: 60 },
        tags: ["hero"],
        advancedMetadata: { huge: "blob" },
        embedding: [1, 2, 3],
      },
      versions: [{ version: 1, url: "/files/v1.jpg", createdAt: "2026-08-23T00:00:00.000Z" }],
    });
    expect(row).toMatchObject({
      _id: "m1",
      filename: "hero.jpg",
      type: "image",
      thumbnail: { url: "/files/global/thumbnail/hero.jpg" },
      metadata: { focalPoint: { x: 40, y: 60 }, tags: ["hero"] },
    });
    expect(row?.metadata).not.toHaveProperty("advancedMetadata");
    expect(row?.metadata).not.toHaveProperty("embedding");
    expect(row?.thumbnails.thumbnail?.url).toBe("/files/global/thumbnail/hero.jpg");
    expect(row?.thumbnails.junk).toBeUndefined();
  });

  it("returns null when required identity fields are missing", () => {
    expect(toGalleryListItem({ filename: "a.jpg", mimeType: "image/jpeg" })).toBeNull();
    expect(toGalleryListItem({ hash: "x", mimeType: "image/jpeg" })).toBeNull();
    expect(toGalleryListItem({})).toBeNull();
  });
});
