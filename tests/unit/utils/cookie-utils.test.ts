/**
 * @file tests/unit/utils/cookie-utils.test.ts
 * @description Unit tests for high-performance cookie parsing.
 */

import { describe, expect, it } from "vitest";
import { parseCookies } from "@src/utils/cookie-utils";

describe("parseCookies", () => {
  it("should return empty object for empty or non-string input", () => {
    expect(parseCookies(null)).toEqual(Object.create(null));
    expect(parseCookies(undefined)).toEqual(Object.create(null));
    expect(parseCookies("")).toEqual(Object.create(null));
  });

  it("should parse standard cookie header string", () => {
    const header = "session_id=abc123; user_theme=dark; lang=en";
    const parsed = parseCookies(header);
    expect(parsed).toEqual({
      session_id: "abc123",
      user_theme: "dark",
      lang: "en",
    });
  });

  it("should handle URI encoded cookie values", () => {
    const header = "user=John%20Doe; greeting=Hello%2C%20World!";
    const parsed = parseCookies(header);
    expect(parsed).toEqual({
      user: "John Doe",
      greeting: "Hello, World!",
    });
  });

  it("should ignore prototype pollution keys", () => {
    const header = "__proto__=evil; constructor=bad; prototype=malicious; safe=true";
    const parsed = parseCookies(header);
    expect(parsed.__proto__).toBeUndefined();
    expect(parsed.constructor).toBeUndefined();
    expect(parsed.prototype).toBeUndefined();
    expect(parsed.safe).toBe("true");
  });
});
