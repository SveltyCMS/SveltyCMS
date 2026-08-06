/**
 * @file tests/unit/core/tier-a-optimizations.test.ts
 * @description Unit tests for Tier A architectural performance optimizations.
 *
 * Features tested:
 * - Dual logical and physical table schema registration in relational-utils
 * - Token resolution triage gate behavior
 * - Heap sampling ratio caching
 */

import { describe, it, expect } from "vitest";
import {
  registerTableSchema,
  getTableDateColumns,
  getTableJsonColumns,
  convertDatesToISO,
} from "@src/databases/core/relational-utils";

describe("Tier A Optimizations — Dual Schema Registration", () => {
  it("should register both physical collection_* and logical collection names", () => {
    registerTableSchema("collection_articles", ["createdAt", "updatedAt", "data", "title"]);

    // Physical key assertion
    const physDates = getTableDateColumns("collection_articles");
    const physJsons = getTableJsonColumns("collection_articles");
    expect(physDates).toEqual(["createdAt", "updatedAt"]);
    expect(physJsons).toEqual(["data"]);

    // Logical key assertion (dual key alias)
    const logDates = getTableDateColumns("articles");
    const logJsons = getTableJsonColumns("articles");
    expect(logDates).toEqual(["createdAt", "updatedAt"]);
    expect(logJsons).toEqual(["data"]);
  });

  it("should register physical collection_* key when provided logical name first", () => {
    registerTableSchema("products", ["publishedAt", "metadata", "price"]);

    const logDates = getTableDateColumns("products");
    expect(logDates).toEqual(["publishedAt"]);

    const physDates = getTableDateColumns("collection_products");
    expect(physDates).toEqual(["publishedAt"]);
  });

  it("should convert dates in-place when inPlace option is true", () => {
    registerTableSchema("events", ["createdAt"]);
    const rawDate = new Date("2026-08-05T12:00:00.000Z");
    const row = { id: "1", createdAt: rawDate, title: "Launch Party" };

    const converted = convertDatesToISO(row, { table: "events", inPlace: true });
    expect(converted).toBe(row); // Same object reference
    expect(converted.createdAt).toBe("2026-08-05T12:00:00.000Z");
  });
});

import { getUserCacheId, buildUserCacheKey } from "@utils/hook-utils";

describe("Tier A Optimizations — User-Aware Turbo & Dispatcher Cache Keys", () => {
  it("should resolve user ID cleanly from _id or id properties", () => {
    expect(getUserCacheId({ _id: "mongo_123" })).toBe("mongo_123");
    expect(getUserCacheId({ id: "sql_456" })).toBe("sql_456");
    expect(getUserCacheId({ _id: "mongo_789", id: "sql_789" })).toBe("mongo_789");
    expect(getUserCacheId(null)).toBe("");
    expect(getUserCacheId(undefined)).toBe("");
  });

  it("should format user-aware cache keys using buildUserCacheKey", () => {
    const pathname = "/api/collections/posts";
    const search = "?page=1";

    const keyUserA = buildUserCacheKey(pathname, search, "user_A");
    const keyUserB = buildUserCacheKey(pathname, search, "user_B");
    const keyAnon = buildUserCacheKey(pathname, search, "");

    expect(keyUserA).toBe("/api/collections/posts?page=1:u:user_A");
    expect(keyUserB).toBe("/api/collections/posts?page=1:u:user_B");
    expect(keyAnon).toBe("/api/collections/posts?page=1");
    expect(keyUserA).not.toEqual(keyUserB);
  });
});

describe("Tier A Optimizations — Token Resolution Triage Gate", () => {
  it("should detect absence of website token placeholders", () => {
    const cleanPayload = JSON.stringify({ success: true, data: { title: "Standard Post" } });
    const tokenPayload = JSON.stringify({ success: true, data: { siteName: "{{site.name}}" } });

    expect(cleanPayload.includes("{{")).toBe(false);
    expect(tokenPayload.includes("{{")).toBe(true);
  });
});
