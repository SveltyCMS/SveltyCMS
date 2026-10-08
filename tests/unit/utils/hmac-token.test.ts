/**
 * @file tests/unit/utils/hmac-token.test.ts
 * @description Wire-format and TTL-predicate parity for the shared HMAC token
 * core behind pending-2fa-token.server.ts and session-reauth.server.ts.
 */

import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signHmacToken, verifyHmacToken } from "@utils/server/hmac-token.server";

const SECRET = "shared-test-secret";
const TTL_MS = 300_000;

describe("hmac-token shared core", () => {
  it("emits the exact wire format `${exp}:${base64url}` over the domain message", () => {
    const exp = Date.now() + TTL_MS;
    const token = signHmacToken("pending2fa", ["usr_1"], exp, SECRET);
    const segments = token.split(":");
    expect(segments).toHaveLength(2);
    expect(Number(segments[0])).toBe(exp);
    const expected = createHmac("sha256", SECRET)
      .update(`pending2fa:usr_1:${exp}`)
      .digest("base64url");
    expect(segments[1]).toBe(expected);
  });

  it("verifies legacy pending-2FA style messages (non-empty domain)", () => {
    const exp = Date.now() + TTL_MS;
    const sig = createHmac("sha256", SECRET).update(`pending2fa:usr_1:${exp}`).digest("base64url");
    expect(verifyHmacToken(`${exp}:${sig}`, "pending2fa", ["usr_1"], TTL_MS, SECRET)).toBe(true);
  });

  it("verifies legacy reauth-style messages (empty domain)", () => {
    const exp = Date.now() + TTL_MS;
    const sig = createHmac("sha256", SECRET).update(`u1:s1:${exp}`).digest("base64url");
    expect(verifyHmacToken(`${exp}:${sig}`, "", ["u1", "s1"], TTL_MS, SECRET)).toBe(true);
  });

  it("rejects a wrong part binding", () => {
    const token = signHmacToken("d", ["part-a"], Date.now() + TTL_MS, SECRET);
    expect(verifyHmacToken(token, "d", ["part-b"], TTL_MS, SECRET)).toBe(false);
  });

  it("rejects expired and far-future expiry", () => {
    const expired = signHmacToken("d", ["p"], Date.now() - 1, SECRET);
    expect(verifyHmacToken(expired, "d", ["p"], TTL_MS, SECRET)).toBe(false);
    const farFuture = signHmacToken("d", ["p"], Date.now() + TTL_MS + 60_000, SECRET);
    expect(verifyHmacToken(farFuture, "d", ["p"], TTL_MS, SECRET)).toBe(false);
  });

  it("rejects non-finite expiry, wrong segment counts, and falsy tokens", () => {
    expect(verifyHmacToken("abc:sig", "d", ["p"], TTL_MS, SECRET)).toBe(false);
    expect(verifyHmacToken("noseparator", "d", ["p"], TTL_MS, SECRET)).toBe(false);
    expect(verifyHmacToken("123:abc:def", "d", ["p"], TTL_MS, SECRET)).toBe(false);
    expect(verifyHmacToken(null, "d", ["p"], TTL_MS, SECRET)).toBe(false);
    expect(verifyHmacToken(undefined, "d", ["p"], TTL_MS, SECRET)).toBe(false);
    expect(verifyHmacToken("", "d", ["p"], TTL_MS, SECRET)).toBe(false);
  });

  it("rejects a digest length mismatch without throwing", () => {
    const token = signHmacToken("d", ["p"], Date.now() + TTL_MS, SECRET);
    const truncated = token.slice(0, token.indexOf(":") + 3);
    expect(verifyHmacToken(truncated, "d", ["p"], TTL_MS, SECRET)).toBe(false);
  });

  it("returns false for an empty secret", () => {
    const token = signHmacToken("d", ["p"], Date.now() + TTL_MS, SECRET);
    expect(verifyHmacToken(token, "d", ["p"], TTL_MS, "")).toBe(false);
  });
});
