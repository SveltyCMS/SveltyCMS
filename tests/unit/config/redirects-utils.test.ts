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
