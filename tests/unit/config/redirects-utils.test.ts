/**
 * @file tests/unit/config/redirects-utils.test.ts
 * @description Unit tests for redirect manager pure helpers.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeRedirectPath,
  validateRedirectFrom,
  validateRedirectTo,
  normalizeRedirectType,
  validateRedirectDraft,
  toRedirectPayload,
  filterRedirectsByQuery,
  findRegexRedirect,
} from "../../../src/routes/(app)/config/redirects/redirects-utils";

describe("normalizeRedirectPath", () => {
  it("trims and prefixes relative paths", () => {
    expect(normalizeRedirectPath("  old  ")).toBe("/old");
    expect(normalizeRedirectPath("/already")).toBe("/already");
  });

  it("leaves absolute URLs and regex patterns alone", () => {
    expect(normalizeRedirectPath("https://ex.com/x")).toBe("https://ex.com/x");
    expect(normalizeRedirectPath("^/blog/(.*)$", true)).toBe("^/blog/(.*)$");
  });
});

describe("validateRedirectFrom / To", () => {
  it("requires from and to", () => {
    expect(validateRedirectFrom("")).toMatch(/required/i);
    expect(validateRedirectTo("")).toMatch(/required/i);
  });

  it("requires leading slash for relative from", () => {
    expect(validateRedirectFrom("no-slash")).toMatch(/start with \//i);
    expect(validateRedirectFrom("/ok")).toBeNull();
  });

  it("allows absolute to URLs", () => {
    expect(validateRedirectTo("https://example.com/new")).toBeNull();
    expect(validateRedirectTo("/new")).toBeNull();
    expect(validateRedirectTo("relative")).toMatch(/absolute|start with \//i);
  });
});

describe("normalizeRedirectType / payload", () => {
  it("defaults unknown types to 301", () => {
    expect(normalizeRedirectType(301)).toBe(301);
    expect(normalizeRedirectType("302")).toBe(302);
    expect(normalizeRedirectType(999)).toBe(301);
  });

  it("builds normalized payload and validates draft", () => {
    const payload = toRedirectPayload({
      from: "old",
      to: "new",
      type: 302,
      active: true,
      isRegex: false,
    });
    expect(payload.from).toBe("/old");
    expect(payload.to).toBe("/new");
    expect(payload.type).toBe(302);
    expect(Object.keys(validateRedirectDraft(payload))).toHaveLength(0);
  });

  it("returns field errors for bad draft", () => {
    const errors = validateRedirectDraft({
      from: "",
      to: "nope",
      type: 301,
      active: true,
      isRegex: false,
    });
    expect(errors.from).toBeTruthy();
    expect(errors.to).toBeTruthy();
  });
});

describe("findRegexRedirect", () => {
  const rows = [
    { source: "^/blog/[0-9]+$", target: "/news" },
    { source: "^/shop/(.*)$", target: "/store" },
  ];
  const pattern = (row: { source: string }) => row.source;

  it("returns the first matching pattern row", () => {
    expect(findRegexRedirect("/blog/42", rows, pattern)).toBe(rows[0]);
    expect(findRegexRedirect("/shop/shoes", rows, pattern)).toBe(rows[1]);
  });

  it("returns null when nothing matches or a stored pattern is invalid", () => {
    expect(findRegexRedirect("/about", rows, pattern)).toBeNull();
    expect(findRegexRedirect("/blog/42", [{ source: "(unclosed" }], (r) => r.source)).toBeNull();
  });

  it("bounds the visitor-controlled path and the stored pattern length", () => {
    expect(findRegexRedirect(`/${"a".repeat(3000)}`, rows, pattern)).toBeNull();
    const longPattern = `^${"a".repeat(600)}$`;
    expect(findRegexRedirect("/a", [{ source: longPattern }], (r) => r.source)).toBeNull();
  });

  it("evaluates at most 200 rules, in order", () => {
    const many = Array.from({ length: 205 }, (_, i) => ({ source: `^/p${i}$` }));
    expect(findRegexRedirect("/p199", many, (r) => r.source)).toBe(many[199]);
    expect(findRegexRedirect("/p200", many, (r) => r.source)).toBeNull();
  });
});

describe("filterRedirectsByQuery", () => {
  const rows = [
    { from: "/old-blog", to: "/blog" },
    { from: "/about", to: "/company" },
  ];

  it("returns all when query empty", () => {
    expect(filterRedirectsByQuery(rows, "")).toHaveLength(2);
  });

  it("filters by from or to", () => {
    expect(filterRedirectsByQuery(rows, "blog")).toEqual([rows[0]]);
    expect(filterRedirectsByQuery(rows, "company")).toEqual([rows[1]]);
    expect(filterRedirectsByQuery(rows, "zzzz")).toHaveLength(0);
  });
});
