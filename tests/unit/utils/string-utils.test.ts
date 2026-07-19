/**
 * @file tests/unit/utils/string-utils.test.ts
 * @description Unit tests for centralized string-utils.ts
 */
import { describe, it, expect } from "vitest";
import { str } from "@utils/string-utils";

describe("string-utils", () => {
  describe("normalizeId", () => {
    it("trims whitespace", () => {
      expect(str.normalizeId("  hello  ")).toBe("hello");
    });

    it("preserves character set", () => {
      expect(str.normalizeId("User_Name-123")).toBe("User_Name-123");
    });

    it("handles empty string", () => {
      expect(str.normalizeId("")).toBe("");
    });
  });

  describe("toSafeKey", () => {
    it("trims and lowercases", () => {
      expect(str.toSafeKey("  HelloWorld  ")).toBe("helloworld");
    });

    it("strips non-alphanumeric except underscore and hyphen", () => {
      expect(str.toSafeKey("user@name!test#123")).toBe("usernametest123");
    });

    it("preserves hyphens and underscores", () => {
      expect(str.toSafeKey("my-key_test")).toBe("my-key_test");
    });

    it("handles empty string", () => {
      expect(str.toSafeKey("")).toBe("");
    });
  });

  describe("isEmpty", () => {
    it("returns true for null", () => {
      expect(str.isEmpty(null)).toBe(true);
    });

    it("returns true for undefined", () => {
      expect(str.isEmpty(undefined)).toBe(true);
    });

    it("returns true for empty string", () => {
      expect(str.isEmpty("")).toBe(true);
    });

    it("returns true for whitespace-only string", () => {
      expect(str.isEmpty("   ")).toBe(true);
    });

    it("returns false for non-empty string", () => {
      expect(str.isEmpty("hello")).toBe(false);
    });

    it("returns false for number zero", () => {
      expect(str.isEmpty(0)).toBe(false);
    });

    it("returns false for boolean false", () => {
      expect(str.isEmpty(false)).toBe(false);
    });
  });

  describe("truncate", () => {
    it("returns original when under limit", () => {
      expect(str.truncate("hello", 10)).toBe("hello");
    });

    it("truncates with ellipsis when over limit", () => {
      expect(str.truncate("hello world", 8)).toBe("hello wo...");
    });

    it("returns exact when at limit", () => {
      expect(str.truncate("12345", 5)).toBe("12345");
    });
  });

  describe("escapeRegex", () => {
    it("escapes special regex characters", () => {
      expect(str.escapeRegex("hello.world*test")).toBe("hello\\.world\\*test");
    });

    it("returns normal strings unchanged", () => {
      expect(str.escapeRegex("hello")).toBe("hello");
    });
  });
});
