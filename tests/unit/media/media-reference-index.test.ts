/**
 * @file tests/unit/media/media-reference-index.test.ts
 * @description Gallery-facing batch lookup for published media references.
 */

import { describe, expect, it } from "vitest";
import { MediaReferenceIndex } from "@src/utils/media/media-reference-index";

describe("MediaReferenceIndex.collectPublishedIds", () => {
  it("returns only ids referenced by published entries", () => {
    const index = new MediaReferenceIndex();
    index.setReferences("img-a", [
      {
        mediaId: "img-a",
        mediaPath: "img-a",
        collectionId: "posts",
        collectionName: "Posts",
        entryId: "draft-1",
        fieldPath: "hero",
      },
    ]);
    index.setReferences("img-b", [
      {
        mediaId: "img-b",
        mediaPath: "img-b",
        collectionId: "posts",
        collectionName: "Posts",
        entryId: "live-1",
        fieldPath: "hero",
      },
    ]);
    index.markBuilt();

    const published = new Set(["live-1"]);
    expect(
      index.collectPublishedIds(["img-a", "img-b", "img-c"], (entryId) => published.has(entryId)),
    ).toEqual(["img-b"]);
  });

  it("maps 100 ids without allocating per-id promise machinery", () => {
    const index = new MediaReferenceIndex();
    const ids = Array.from({ length: 100 }, (_, i) => `m-${i}`);
    for (const id of ids) {
      index.setReferences(id, [
        {
          mediaId: id,
          mediaPath: id,
          collectionId: "c",
          collectionName: "C",
          entryId: "e1",
          fieldPath: "f",
        },
      ]);
    }
    index.markBuilt();
    const t0 = performance.now();
    for (let n = 0; n < 2_000; n++) {
      index.collectPublishedIds(ids, () => true);
    }
    expect(performance.now() - t0).toBeLessThan(50);
    expect(index.collectPublishedIds(ids, () => true)).toHaveLength(100);
  });
});
