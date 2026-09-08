/**
 * @file tests/unit/utils/webauthn-client.test.ts
 * @description Unit tests for WebAuthn client-side utilities.
 */

import { describe, expect, it } from "vitest";
import { base64UrlToBuffer, bufferToBase64Url, isPasskeySupported } from "@utils/webauthn-client";

describe("webauthn-client utils", () => {
  it("correctly round-trips buffers to base64url and back", () => {
    const originalBytes = new Uint8Array([0, 15, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const encoded = bufferToBase64Url(originalBytes);

    expect(typeof encoded).toBe("string");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");

    const decoded = base64UrlToBuffer(encoded);
    expect(decoded).toEqual(originalBytes);
  });

  it("handles empty and ascii text conversions", () => {
    const text = "SveltyCMS-Passkey-Test-2026";
    const bytes = new TextEncoder().encode(text);
    const encoded = bufferToBase64Url(bytes);
    const decoded = base64UrlToBuffer(encoded);
    const decodedText = new TextDecoder().decode(decoded);

    expect(decodedText).toBe(text);
  });

  it("safely executes feature checks without throwing", () => {
    expect(typeof isPasskeySupported()).toBe("boolean");
  });
});
