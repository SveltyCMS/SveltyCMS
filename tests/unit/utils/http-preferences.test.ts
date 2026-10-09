/**
 * @file tests/unit/utils/http-preferences.test.ts
 * @description Unit guard for `Prefer` header parsing (RFC 7240) as the API honours it.
 *
 * Features:
 * - minimal is the API default (absent / unknown / malformed values keep it)
 * - `return=representation` is the explicit opt-out back to full bodies
 * - last-wins for a repeated preference, and `respond-async` beside it is ignored
 */

import { describe, expect, it } from "vitest";
import { prefersMinimalReturn } from "@utils/http-preferences";

describe("prefersMinimalReturn", () => {
  it("defaults to minimal when the header is absent or empty", () => {
    expect(prefersMinimalReturn(null)).toBe(true);
    expect(prefersMinimalReturn(undefined)).toBe(true);
    expect(prefersMinimalReturn("")).toBe(true);
  });

  it("recognises return=minimal in the forms clients actually send", () => {
    expect(prefersMinimalReturn("return=minimal")).toBe(true);
    expect(prefersMinimalReturn("Return=Minimal")).toBe(true);
    expect(prefersMinimalReturn(" return=minimal ")).toBe(true);
    expect(prefersMinimalReturn("respond-async, return=minimal")).toBe(true);
  });

  it("opts back into representation explicitly", () => {
    expect(prefersMinimalReturn("return=representation")).toBe(false);
    expect(prefersMinimalReturn("Return=Representation")).toBe(false);
  });

  it("keeps the minimal default for unknown or malformed values", () => {
    expect(prefersMinimalReturn("wait=10")).toBe(true);
    expect(prefersMinimalReturn("return")).toBe(true);
    expect(prefersMinimalReturn("minimal")).toBe(true);
    expect(prefersMinimalReturn("return=")).toBe(true);
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
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?fields=_id"))).toBe(
      true,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?fields=id"))).toBe(
      true,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?fields=none"))).toBe(
      true,
    );
  });

  it("opts back into representation from URL query parameters", () => {
    expect(
      prefersMinimalReturn(null, new URL("https://example.com/api/test?return=representation")),
    ).toBe(false);
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?return=full"))).toBe(
      false,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?minimal=false"))).toBe(
      false,
    );
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test?minimal=0"))).toBe(
      false,
    );
    // A real projection implies representation — the status-only ack cannot carry it.
    expect(
      prefersMinimalReturn(null, new URL("https://example.com/api/test?fields=title,slug")),
    ).toBe(false);
  });

  it("defaults to minimal for a bare query-less URL", () => {
    expect(prefersMinimalReturn(null, new URL("https://example.com/api/test"))).toBe(true);
  });
});
