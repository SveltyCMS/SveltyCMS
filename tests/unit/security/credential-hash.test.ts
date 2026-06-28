/**
 * @file tests/unit/security/credential-hash.test.ts
 * @description Unit tests for credential hashing utilities.
 */

import { describe, it, expect } from "vitest";
import {
  hashCredentialSha256Hex,
  hashCredentialSha256HexSync,
} from "@src/utils/security/credential-hash";

describe("hashCredentialSha256Hex", () => {
  it("should produce deterministic hex SHA-256 output", async () => {
    const hash = await hashCredentialSha256Hex("test-credential");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCredentialSha256Hex("test-credential")).toBe(hash);
  });

  it("should differ for different inputs", async () => {
    const a = await hashCredentialSha256Hex("token-a");
    const b = await hashCredentialSha256Hex("token-b");
    expect(a).not.toBe(b);
  });

  it("sync and async hashes should match", async () => {
    const asyncHash = await hashCredentialSha256Hex("sync-parity-token");
    expect(hashCredentialSha256HexSync("sync-parity-token")).toBe(asyncHash);
  });
});
