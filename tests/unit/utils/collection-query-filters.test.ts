/**
 * @file tests/unit/utils/collection-query-filters.test.ts
 * @description Tests for URL filter parsing, schema whitelist, and cache key hashing.
 */

import { describe, expect, it } from "vitest";
import type { Schema } from "@src/content/types";
import {
  buildCollectionQueryCacheKey,
  getAllowedFilterFieldIds,
  hashQueryPayload,
  parseCollectionListQuery,
  parseUrlFilterParams,
  stableSerialize,
  whitelistFilterParams,
} from "@utils/collection-query-filters";

const sampleCollection = {
  _id: "col_posts",
  name: "Posts",
  fields: [
    { label: "Title", db_fieldName: "title" },
    { label: "Status", db_fieldName: "status" },
  ],
} as unknown as Schema;

describe("collection-query-filters", () => {
  describe("stableSerialize + hashQueryPayload", () => {
    it("produces order-independent hashes for filter maps", () => {
      const a = hashQueryPayload({
        filter: { status: { contains: "publish" }, title: { contains: "hi" } },
        search: "",
      });
      const b = hashQueryPayload({
        filter: { title: { contains: "hi" }, status: { contains: "publish" } },
        search: "",
      });
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}$/);
    });

    it("changes hash when search or filter changes", () => {
      const base = hashQueryPayload({ filter: {}, search: "" });
      const withSearch = hashQueryPayload({ filter: {}, search: "hello" });
      const withFilter = hashQueryPayload({
        filter: { status: { contains: "draft" } },
        search: "",
      });
      expect(base).not.toBe(withSearch);
      expect(base).not.toBe(withFilter);
    });

    it("stableSerialize sorts object keys", () => {
      expect(stableSerialize({ b: 1, a: 2 })).toBe(stableSerialize({ a: 2, b: 1 }));
    });
  });

  describe("parseUrlFilterParams", () => {
    it("parses filter_* params and ignores empty values", () => {
      const params = new URLSearchParams({
        filter_status: "publish",
        filter_title: "  hello  ",
        filter_empty: "",
        search: "global",
        page: "2",
      });
      expect(parseUrlFilterParams(params)).toEqual({
        status: { contains: "publish" },
        title: { contains: "hello" },
      });
    });

    it("drops garbage createdAt filters", () => {
      const params = new URLSearchParams({
        filter_createdAt: "not-a-date",
        filter_updatedAt: "2024-01-01",
      });
      const parsed = parseUrlFilterParams(params);
      expect(parsed.createdAt).toBeUndefined();
      expect(parsed.updatedAt).toEqual({ contains: "2024-01-01" });
    });
  });

  describe("whitelistFilterParams", () => {
    it("keeps only schema-allowed fields", () => {
      const allowed = getAllowedFilterFieldIds(sampleCollection);
      expect(allowed.has("title")).toBe(true);
      expect(allowed.has("status")).toBe(true);
      expect(allowed.has("createdAt")).toBe(true);

      const raw = {
        title: { contains: "x" },
        evil: { contains: "$ne" },
        status: { contains: "draft" },
      };
      expect(whitelistFilterParams(raw, allowed)).toEqual({
        title: { contains: "x" },
        status: { contains: "draft" },
      });
    });
  });

  describe("parseCollectionListQuery", () => {
    it("returns whitelisted filters, pagination, and queryHash", () => {
      const params = new URLSearchParams({
        page: "3",
        pageSize: "25",
        search: "news",
        sort: "title",
        order: "asc",
        filter_title: "hello",
        filter_hacked: "1",
      });
      const q = parseCollectionListQuery(params, sampleCollection);
      expect(q.page).toBe(3);
      expect(q.pageSize).toBe(25);
      expect(q.search).toBe("news");
      expect(q.sort).toEqual({ field: "title", direction: "asc" });
      expect(q.filter).toEqual({ title: { contains: "hello" } });
      expect(q.filter.hacked).toBeUndefined();
      expect(q.queryHash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe("buildCollectionQueryCacheKey", () => {
    it("uses collection: prefix for invalidateCollection pattern", () => {
      const key = buildCollectionQueryCacheKey({
        collectionId: "col_posts",
        page: 1,
        pageSize: 10,
        queryHash: "abcd1234",
        language: "en",
        tenantId: "t1",
        userId: "u1",
      });
      expect(key.startsWith("collection:col_posts:")).toBe(true);
      expect(key).toContain("query:abcd1234");
      expect(key).toContain("page:1");
      expect(key).toContain("lang:en");
      expect(key).toContain("tenant:t1");
    });
  });
});
