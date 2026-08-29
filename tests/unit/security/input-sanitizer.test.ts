/**
 * @file tests/unit/security/input-sanitizer.test.ts
 * @description Regression tests for containsXssVector / sanitizeObject pre-check.
 *
 * containsXssVector is the GATE for sanitizeString in sanitizeObject — a false
 * negative SKIPS sanitization, so it must be a superset of the dangerous
 * classes: all scriptable URL schemes (javascript:/vbscript:/data:) and any
 * `on…=` event handler.
 */

import { describe, it, expect } from "vitest";
import { containsXssVector, sanitizeObject } from "@src/utils/security/input-sanitizer";

describe("containsXssVector — URL schemes", () => {
  it("detects javascript: (plain and whitespace-injected)", () => {
    expect(containsXssVector('href="javascript:alert(1)"')).toBe(true);
    expect(containsXssVector("java\tscript:alert(1)")).toBe(true);
  });

  it("detects vbscript:", () => {
    expect(containsXssVector('href="vbscript:msgbox(1)"')).toBe(true);
  });

  it("detects data: scriptable URIs", () => {
    expect(containsXssVector("data:text/html;base64,PHNjcmlwdD4=")).toBe(true);
    expect(containsXssVector("data:image/svg+xml;base64,PHN2Zz4=")).toBe(true);
  });

  it("rejects plain text and harmless data-attribute strings", () => {
    expect(containsXssVector("Content for item… plain")).toBe(false);
    expect(containsXssVector('data-id="123"')).toBe(false);
    expect(containsXssVector("data-id: 123")).toBe(false);
  });
});

describe("containsXssVector — event handlers", () => {
  it("detects any on…= handler (not just the old four)", () => {
    expect(containsXssVector("onclick=alert(1)")).toBe(true);
    expect(containsXssVector("onload=alert(1)")).toBe(true);
    expect(containsXssVector("onfocus=alert(1)")).toBe(true);
    expect(containsXssVector("ontoggle=alert(1)")).toBe(true);
    expect(containsXssVector("onmouseover=alert(1)")).toBe(true);
  });
});

describe("sanitizeObject — gate behavior", () => {
  it("sanitizes strings that contain data: URIs (was a pre-check gap)", () => {
    const out = sanitizeObject({ desc: '<img src="data:text/html;base64,PHNjcmlwdD4=">' });
    expect(JSON.stringify(out)).not.toContain("data:text/html");
  });

  it("returns objects unchanged when no vector is present", () => {
    const input = { a: "hello", b: { c: "world" } };
    expect(sanitizeObject(input)).toBe(input);
  });
});
