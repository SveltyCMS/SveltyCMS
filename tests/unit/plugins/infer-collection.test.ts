/**
 * @vitest-environment node
 * @file tests/unit/plugins/infer-collection.test.ts
 * @description Unit tests for migration target collection inference.
 */

import { describe, it, expect } from "vitest";
import {
  inferTargetCollectionFromMigration,
  resolveTargetCollection,
} from "@plugins/smart-importer/infer-collection";
import type { SNCEntry } from "@plugins/smart-importer/types";

function entryWithType(type: string): SNCEntry {
  return {
    externalId: "1",
    title: "Test",
    slug: "test",
    status: "draft",
    taxonomies: { vocabularies: [], terms: {} },
    rawCustomFields: { type },
    assetsToMirror: [],
  };
}

describe("infer-collection", () => {
  it("uses WordPress post_type from detected content types", () => {
    expect(
      inferTargetCollectionFromMigration({
        format: "wordpress",
        contentTypes: ["post"],
      }),
    ).toBe("post");
  });

  it("uses primary content type from parsed entries", () => {
    expect(
      inferTargetCollectionFromMigration({
        format: "wordpress",
        contentTypes: ["post", "page"],
        entries: [entryWithType("post"), entryWithType("post"), entryWithType("page")],
      }),
    ).toBe("post");
  });

  it("uses first selected type when multiple types lack entry samples", () => {
    expect(
      inferTargetCollectionFromMigration({
        format: "wordpress",
        contentTypes: ["post", "page"],
        selectedContentTypes: ["post", "page"],
      }),
    ).toBe("post");
    expect(
      inferTargetCollectionFromMigration({
        format: "wordpress",
        contentTypes: ["post", "page"],
        selectedContentTypes: ["page", "post"],
      }),
    ).toBe("page");
  });

  it("prefers explicit user collection name", () => {
    expect(
      resolveTargetCollection("My Articles", {
        format: "wordpress",
        contentTypes: ["post"],
      }),
    ).toBe("my_articles");
  });

  it("infers from entries when explicit name is empty", () => {
    expect(
      resolveTargetCollection("", {
        format: "wordpress",
        entries: [entryWithType("product")],
      }),
    ).toBe("product");
  });
});
