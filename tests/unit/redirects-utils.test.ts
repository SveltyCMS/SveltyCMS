/**
 * @file tests/unit/redirects-utils.test.ts
 * @description Unit tests for redirect validation — especially the save-time
 * ReDoS guard (isSafeRedirectRegex) that keeps catastrophic patterns out of the DB.
 */

import { describe, it, expect } from "vitest";
import {
  isSafeRedirectRegex,
  validateRedirectFrom,
} from "@src/routes/(app)/config/redirects/redirects-utils";

describe("isSafeRedirectRegex - ReDoS guard", () => {
  it("rejects nested-quantifier patterns (exponential backtracking)", () => {
    expect(isSafeRedirectRegex("^(a+)+$")).toBe(false);
    expect(isSafeRedirectRegex("([a-zA-Z]+)*")).toBe(false);
    expect(isSafeRedirectRegex("(a|a)*$")).toBe(false);
    expect(isSafeRedirectRegex("(a{2,5})+")).toBe(false);
    expect(isSafeRedirectRegex("((a)+)+")).toBe(false);
    expect(isSafeRedirectRegex("((a|b)*)+")).toBe(false);
    expect(isSafeRedirectRegex("(a?)+")).toBe(false);
    expect(isSafeRedirectRegex("(a*)*")).toBe(false);
  });

  it("rejects quantified ambiguous alternations", () => {
    expect(isSafeRedirectRegex("(ab|cd)+")).toBe(false);
    expect(isSafeRedirectRegex("(a|aa)*")).toBe(false);
  });

  it("allows safe patterns (single quantifiers, optional groups, plain alternation)", () => {
    expect(isSafeRedirectRegex("^/blog/.*$")).toBe(true);
    expect(isSafeRedirectRegex("^/products/[0-9]+")).toBe(true);
    expect(isSafeRedirectRegex("^/old/(.*)$")).toBe(true);
    expect(isSafeRedirectRegex("/blog/[0-9]{4}/[a-z]+")).toBe(true);
    expect(isSafeRedirectRegex("(a|b)?")).toBe(true);
    expect(isSafeRedirectRegex("(a+)?")).toBe(true);
    expect(isSafeRedirectRegex("(ab|cd)")).toBe(true);
    expect(isSafeRedirectRegex("(ab)+")).toBe(true);
    expect(isSafeRedirectRegex("a{2,5}")).toBe(true);
  });

  it("allows an explicit catch-all wildcard (admin intent)", () => {
    expect(isSafeRedirectRegex(".*")).toBe(true);
  });

  it("rejects empty, non-compiling, and oversized patterns", () => {
    expect(isSafeRedirectRegex("")).toBe(false); // new RegExp("") matches everything
    expect(isSafeRedirectRegex("(unclosed")).toBe(false);
    expect(isSafeRedirectRegex("a".repeat(600))).toBe(false);
  });
});

describe("validateRedirectFrom", () => {
  it("rejects catastrophic regex sources at save time", () => {
    expect(validateRedirectFrom("^(a+)+$", true)).not.toBeNull();
    expect(validateRedirectFrom("(a|a)*", true)).not.toBeNull();
  });

  it("accepts safe regex sources", () => {
    expect(validateRedirectFrom("^/old/(.*)$", true)).toBeNull();
    expect(validateRedirectFrom("/old-path", true)).toBeNull();
  });

  it("keeps non-regex path rules enforced", () => {
    expect(validateRedirectFrom("", false)).not.toBeNull();
    expect(validateRedirectFrom("relative", false)).not.toBeNull();
    expect(validateRedirectFrom("/valid-path", false)).toBeNull();
  });
});
