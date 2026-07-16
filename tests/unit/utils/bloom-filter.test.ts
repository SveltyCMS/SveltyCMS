/**
 * @file tests/unit/utils/bloom-filter.test.ts
 * @description Unit tests for hardened BloomFilter with serialize/deserialize.
 */
import { describe, it, expect } from "vitest";
import { BloomFilter } from "@utils/bloom-filter";

describe("BloomFilter", () => {
  describe("add and has", () => {
    it("returns false for items not added", () => {
      const bf = new BloomFilter(100, 0.01);
      expect(bf.has("missing")).toBe(false);
    });

    it("returns true for items that were added", () => {
      const bf = new BloomFilter(100, 0.01);
      bf.add("hello");
      expect(bf.has("hello")).toBe(true);
    });

    it("ignores empty strings", () => {
      const bf = new BloomFilter(100, 0.01);
      bf.add("");
      expect(bf.has("")).toBe(false);
    });

    it("handles multiple items", () => {
      const bf = new BloomFilter(1000, 0.01);
      const items = ["apple", "banana", "cherry", "date", "elderberry"];
      for (const item of items) bf.add(item);
      for (const item of items) expect(bf.has(item)).toBe(true);
    });
  });

  describe("clear", () => {
    it("removes all items", () => {
      const bf = new BloomFilter(100, 0.01);
      bf.add("test");
      bf.clear();
      expect(bf.has("test")).toBe(false);
    });
  });

  describe("serialize and deserialize", () => {
    it("round-trips correctly", () => {
      const bf = new BloomFilter(100, 0.01);
      bf.add("alpha");
      bf.add("beta");

      const serialized = bf.serialize();
      const restored = BloomFilter.deserialize(serialized, 100, 0.01);

      expect(restored.has("alpha")).toBe(true);
      expect(restored.has("beta")).toBe(true);
      expect(restored.has("gamma")).toBe(false);
    });

    it("produces valid base64", () => {
      const bf = new BloomFilter(100, 0.01);
      const serialized = bf.serialize();
      expect(() => Buffer.from(serialized, "base64")).not.toThrow();
    });
  });

  describe("capacity", () => {
    it("handles large item sets within expected false positive rate", () => {
      const n = 1000;
      const bf = new BloomFilter(n, 0.01);
      for (let i = 0; i < n; i++) bf.add(`item-${i}`);

      // All added items should be found
      for (let i = 0; i < n; i++) {
        expect(bf.has(`item-${i}`)).toBe(true);
      }

      // False positives for un-added items should be rare (< 5% at n items)
      let fp = 0;
      const trials = 1000;
      for (let i = 0; i < trials; i++) {
        if (bf.has(`unseen-${i}`)) fp++;
      }
      expect(fp / trials).toBeLessThan(0.05);
    });
  });
});
