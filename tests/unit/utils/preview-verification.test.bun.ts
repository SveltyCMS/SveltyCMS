import { describe, it, expect } from "bun:test";
import { verifyPreviewToken } from "../../../src/utils/preview-verification";
import crypto from "node:crypto";

describe("Preview Verification Utility", () => {
  const secret = "test-preview-secret-at-least-32-chars-long";
  const userId = "user123";
  const entryId = "entry456";

  it("should verify a valid token", () => {
    const expires = Date.now() + 10000;
    const payload = `${userId}:${entryId}:${expires}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 32);
    const token = Buffer.from(`${payload}:${signature}`).toString("base64url");

    const result = verifyPreviewToken(token, secret);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(userId);
    expect(result.entryId).toBe(entryId);
  });

  it("should reject an expired token", () => {
    const expires = Date.now() - 10000;
    const payload = `${userId}:${entryId}:${expires}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 32);
    const token = Buffer.from(`${payload}:${signature}`).toString("base64url");

    const result = verifyPreviewToken(token, secret);
    expect(result.valid).toBe(false);
  });

  it("should reject an invalid signature", () => {
    const expires = Date.now() + 10000;
    const payload = `${userId}:${entryId}:${expires}`;
    const token = Buffer.from(`${payload}:invalid-sig`).toString("base64url");

    const result = verifyPreviewToken(token, secret);
    expect(result.valid).toBe(false);
  });

  it("should reject a malformed token", () => {
    const result = verifyPreviewToken("not-a-token", secret);
    expect(result.valid).toBe(false);
  });
});
