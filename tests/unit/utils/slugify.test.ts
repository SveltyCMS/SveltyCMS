/**
 * @file tests/unit/utils/slugify.test.ts
 * @description Unit tests for slugify utility
 */

import { describe, expect, it } from "vitest";
import { slugify } from "@utils/slugify";

describe("slugify utility", () => {
  it("slugifies simple strings", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes diacritics and normalizes unicode", () => {
    expect(slugify("Café au Lait")).toBe("cafe-au-lait");
    expect(slugify("München ist schön")).toBe("munchen-ist-schon");
    expect(slugify("ÁÉÍÓÚ ñ")).toBe("aeiou-n");
  });

  it("handles special characters in strict mode natively", () => {
    expect(slugify("What's up? (Nothing much!)")).toBe("whats-up-nothing-much");
  });

  it("replaces spaces and underscores properly", () => {
    expect(slugify("hello_world  test.name")).toBe("hello-world-test-name");
  });

  it("respects custom replacement character", () => {
    expect(slugify("Hello World", { replacement: "_" })).toBe("hello_world");
  });

  it("respects lower case option", () => {
    expect(slugify("Hello World", { lower: false })).toBe("Hello-World");
  });

  it("respects strict mode disabled", () => {
    expect(slugify("What's up?", { strict: false })).toBe("what's-up?");
  });

  it("trims replacement chars from start and end", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
    expect(slugify("_Hello_World_")).toBe("hello-world");
  });

  it("does not trim if explicitly disabled", () => {
    expect(slugify("  Hello World  ", { trim: false })).toBe("-hello-world-");
  });

  it("prevents multiple sequential replacements", () => {
    expect(slugify("Hello    World")).toBe("hello-world");
    expect(slugify("Hello_-_.World")).toBe("hello-world");
  });
});
