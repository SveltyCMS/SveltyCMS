/**
 * @file tests/unit/databases/collection-name.test.ts
 * @description Physical table-name derivation regression tests (BUG-01).
 *
 * Features:
 * - canonical collection_ prefix + hyphen stripping
 * - idempotency on already-prefixed names
 * - case-sensitivity parity (PG: "Articles" _id vs "articles" slug must not collide)
 */

import { describe, it, expect } from "vitest";
import {
  collectionTableName,
  normalizeCollectionTableName,
  validatePhysicalTableName,
} from "@src/databases/core/collection-name";

describe("collectionTableName", () => {
  it("maps a plain id to the canonical table name", () => {
    expect(collectionTableName("Articles")).toBe("collection_Articles");
    expect(collectionTableName("blog-posts")).toBe("collection_blogposts");
    expect(collectionTableName("my_collection")).toBe("collection_my_collection");
  });

  it("strips hyphens from hyphenated ids (manual collection_${id} BUG-01)", () => {
    // Manual `collection_${id}` would yield "collection_blog-posts" — which is
    // NOT the physical table the adapters create ("collection_blogposts").
    expect(collectionTableName("blog-posts")).toBe("collection_blogposts");
  });

  it("is idempotent on already-prefixed names", () => {
    expect(collectionTableName("collection_blogposts")).toBe("collection_blogposts");
    expect(collectionTableName("collection_blog-posts")).toBe("collection_blogposts");
  });

  it("keeps case distinct on PG (BUG-01 regression: _id Articles vs slug articles)", () => {
    // PostgreSQL folds unquoted identifiers to lowercase; both physical names
    // must remain distinct so a schema `_id: "Articles"` (table
    // collection_Articles) never aliases a `slug: "articles"` collection.
    expect(collectionTableName("Articles")).toBe("collection_Articles");
    expect(collectionTableName("articles")).toBe("collection_articles");
    expect(collectionTableName("Articles")).not.toBe(collectionTableName("articles"));
  });
});

describe("normalizeCollectionTableName", () => {
  it("matches collectionTableName (single source of truth)", () => {
    expect(normalizeCollectionTableName("blog-posts")).toBe(collectionTableName("blog-posts"));
    expect(normalizeCollectionTableName("collection_blogposts")).toBe("collection_blogposts");
  });
});

describe("validatePhysicalTableName", () => {
  it("returns null for valid ids and an error for >63 char derived names", () => {
    expect(validatePhysicalTableName("blog-posts")).toBeNull();
    expect(validatePhysicalTableName("a".repeat(70))).toContain("exceeds 63 characters");
  });
});
