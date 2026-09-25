/**
 * @file tests/unit/utils/http-preferences.test.ts
 * @description Unit guard for `Prefer` header parsing (RFC 7240) as the API honours it.
 *
 * Features:
 * - `return=minimal` is the only value that changes behaviour
 * - absent / unknown / malformed values keep the default representation (fails safe)
 * - last-wins for a repeated preference, and `respond-async` beside it is ignored
 */

import { describe, expect, it } from "vitest";
import { prefersMinimalReturn } from "@utils/http-preferences";

describe("prefersMinimalReturn", () => {
  it("is false when the header is absent or empty", () => {
    expect(prefersMinimalReturn(null)).toBe(false);
    expect(prefersMinimalReturn(undefined)).toBe(false);
    expect(prefersMinimalReturn("")).toBe(false);
  });

  it("recognises return=minimal in the forms clients actually send", () => {
    expect(prefersMinimalReturn("return=minimal")).toBe(true);
    expect(prefersMinimalReturn("Return=Minimal")).toBe(true);
    expect(prefersMinimalReturn(" return=minimal ")).toBe(true);
    expect(prefersMinimalReturn("respond-async, return=minimal")).toBe(true);
  });

  it("keeps the default for representation or unknown values", () => {
    expect(prefersMinimalReturn("return=representation")).toBe(false);
    expect(prefersMinimalReturn("wait=10")).toBe(false);
    expect(prefersMinimalReturn("return")).toBe(false);
    expect(prefersMinimalReturn("minimal")).toBe(false);
    expect(prefersMinimalReturn("return=")).toBe(false);
  });

  it("lets the last return preference win (RFC 7240 section 2)", () => {
    expect(prefersMinimalReturn("return=minimal, return=representation")).toBe(false);
    expect(prefersMinimalReturn("return=representation, return=minimal")).toBe(true);
  });

  it("recognises minimal return from URL query parameters", () => {
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?return=minimal"))).toBe(
      true,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?minimal=true"))).toBe(
      true,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?minimal=1"))).toBe(
      true,
    );
    expect(prefersMinimalReturn(null, "?return=minimal")).toBe(true);
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test"))).toBe(false);
  });
});
