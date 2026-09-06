/**
 * @file tests/unit/stores/collection-metadata-store.test.ts
 * @description Unit tests for collectionMetadata reactive store and tag color mapping.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  collectionMetadata,
  getTagColor,
} from "../../../src/stores/collection-metadata-store.svelte";

describe("collectionMetadata store", () => {
  beforeEach(() => {
    collectionMetadata.setUserId("test_user");
    collectionMetadata.favorites = [];
    collectionMetadata.tagMap = {};
  });

  it("toggles favorite status correctly", () => {
    expect(collectionMetadata.isFavorite("col_1")).toBe(false);

    const added = collectionMetadata.toggleFavorite("col_1");
    expect(added).toBe(true);
    expect(collectionMetadata.isFavorite("col_1")).toBe(true);
    expect(collectionMetadata.favorites).toContain("col_1");

    const removed = collectionMetadata.toggleFavorite("col_1");
    expect(removed).toBe(false);
    expect(collectionMetadata.isFavorite("col_1")).toBe(false);
    expect(collectionMetadata.favorites).not.toContain("col_1");
  });

  it("manages tags correctly", () => {
    expect(collectionMetadata.getTags("col_2")).toEqual([]);

    collectionMetadata.addTag("col_2", "news");
    collectionMetadata.addTag("col_2", "featured");
    expect(collectionMetadata.getTags("col_2")).toEqual(["news", "featured"]);

    // Does not duplicate tags
    collectionMetadata.addTag("col_2", "news");
    expect(collectionMetadata.getTags("col_2")).toEqual(["news", "featured"]);

    // Removes tag
    collectionMetadata.removeTag("col_2", "news");
    expect(collectionMetadata.getTags("col_2")).toEqual(["featured"]);

    // Overwrites tags
    collectionMetadata.setTags("col_2", ["blog", "article"]);
    expect(collectionMetadata.getTags("col_2")).toEqual(["blog", "article"]);

    // Cleans up empty tags
    collectionMetadata.setTags("col_2", []);
    expect(collectionMetadata.getTags("col_2")).toEqual([]);
    expect(collectionMetadata.tagMap["col_2"]).toBeUndefined();
  });

  it("returns sorted unique tags across all collections", () => {
    collectionMetadata.setTags("col_a", ["tech", "ai"]);
    collectionMetadata.setTags("col_b", ["ai", "robotics", "gadgets"]);

    expect(collectionMetadata.getAllUniqueTags()).toEqual(["ai", "gadgets", "robotics", "tech"]);
  });

  it("computes deterministic WCAG-compliant status-shade colors for tags", () => {
    const color1 = getTagColor("news");
    const color2 = getTagColor("news");
    const color3 = getTagColor("blog");

    expect(color1).toEqual(color2);
    expect(color1.bg).toContain("-500/10");
    expect(color1.text).toContain("-500");
    expect(color1.border).toContain("-500/30");
    expect(color3.bg).toContain("-500/10");
  });
});
