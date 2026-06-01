/**
 * @file tests/integration/databases/cache-integration.test.ts
 * @description Integration tests for the real CacheService.
 * Tests cache hits, misses, invalidation, TTL, patterns, and multi-tenancy.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { cacheService } from "@src/databases/cache/cache-service";

const TEST_TENANT = "cache-test-tenant";

describe("Cache Integration Tests (Real CacheService)", () => {
  beforeEach(async () => {
    await cacheService.invalidateAll();
  });

  describe("Basic Cache Operations", () => {
    test("should store and retrieve values", async () => {
      const testKey = "test:key";
      const testValue = { data: "test data" };

      await cacheService.set(testKey, testValue, 60, TEST_TENANT);
      const retrieved = await cacheService.get(testKey, TEST_TENANT);
      expect(retrieved).toEqual(testValue);
    });

    test("should return null for non-existent keys", async () => {
      const retrieved = await cacheService.get("nonexistent:key", TEST_TENANT);
      expect(retrieved).toBeNull();
    });

    test("should delete cached values", async () => {
      const testKey = "test:delete";
      await cacheService.set(testKey, { data: "to delete" }, 60, TEST_TENANT);
      await cacheService.delete(testKey, TEST_TENANT);

      const retrieved = await cacheService.get(testKey, TEST_TENANT);
      expect(retrieved).toBeNull();
    });

    test("should handle TTL expiration", async () => {
      const testKey = "test:ttl";
      await cacheService.set(testKey, { data: "expires soon" }, 1, TEST_TENANT);

      // Wait for expiration (1s TTL + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const retrieved = await cacheService.get(testKey, TEST_TENANT);
      expect(retrieved).toBeNull();
    });
  });

  describe("Pattern-Based Operations", () => {
    test("should clear entries by pattern", async () => {
      await cacheService.set("user:1:profile", { name: "User 1" }, 60, TEST_TENANT);
      await cacheService.set("user:2:profile", { name: "User 2" }, 60, TEST_TENANT);
      await cacheService.set("post:1:data", { title: "Post 1" }, 60, TEST_TENANT);

      await cacheService.clearByPattern("user:*", TEST_TENANT);

      const user1 = await cacheService.get("user:1:profile", TEST_TENANT);
      const user2 = await cacheService.get("user:2:profile", TEST_TENANT);
      const post1 = await cacheService.get("post:1:data", TEST_TENANT);

      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(post1).not.toBeNull();
    });

    test("should handle complex patterns", async () => {
      await cacheService.set("tenant:abc:user:1", { data: "a" }, 60, TEST_TENANT);
      await cacheService.set("tenant:abc:user:2", { data: "b" }, 60, TEST_TENANT);
      await cacheService.set("tenant:xyz:user:1", { data: "c" }, 60, TEST_TENANT);

      await cacheService.clearByPattern("tenant:abc:*", TEST_TENANT);

      const abc1 = await cacheService.get("tenant:abc:user:1", TEST_TENANT);
      const abc2 = await cacheService.get("tenant:abc:user:2", TEST_TENANT);
      const xyz1 = await cacheService.get("tenant:xyz:user:1", TEST_TENANT);

      expect(abc1).toBeNull();
      expect(abc2).toBeNull();
      expect(xyz1).not.toBeNull();
    });
  });

  describe("Cache invalidation", () => {
    test("should clear all entries with invalidateAll", async () => {
      await cacheService.set("key:1", { data: "a" }, 60, TEST_TENANT);
      await cacheService.set("key:2", { data: "b" }, 60, TEST_TENANT);

      await cacheService.invalidateAll(TEST_TENANT);

      const v1 = await cacheService.get("key:1", TEST_TENANT);
      const v2 = await cacheService.get("key:2", TEST_TENANT);
      expect(v1).toBeNull();
      expect(v2).toBeNull();
    });
  });

  describe("Multi-Tenant Isolation", () => {
    test("should isolate tenant data", async () => {
      await cacheService.set("resource", { owner: "t1" }, 60, "t1");
      await cacheService.set("resource", { owner: "t2" }, 60, "t2");

      const t1Resource = await cacheService.get("resource", "t1");
      const t2Resource = await cacheService.get("resource", "t2");

      expect(t1Resource).toEqual({ owner: "t1" });
      expect(t2Resource).toEqual({ owner: "t2" });
    });
  });

  describe("Complex Data Types", () => {
    test("should handle nested objects", async () => {
      const complexData = {
        string: "text",
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { deep: { value: "nested" } },
        nullValue: null,
      };

      await cacheService.set("complex:data", complexData, 60, TEST_TENANT);
      const retrieved = await cacheService.get("complex:data", TEST_TENANT);
      expect(retrieved).toEqual(complexData);
    });
  });
});
