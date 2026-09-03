/**
 * @file tests/unit/auth/timing-defense.test.ts
 * @description Unit tests for timing-attack normalization (CWE-208) on login.
 */

import { describe, it, expect } from "vitest";
import { verifyDummyPassword, DUMMY_ARGON2_HASH } from "@utils/security/crypto";

describe("Timing-Attack Defense (CWE-208)", () => {
  it("exports a valid DUMMY_ARGON2_HASH", () => {
    expect(DUMMY_ARGON2_HASH).toMatch(/^\$argon2id\$v=19\$/);
  });

  it("verifyDummyPassword executes and resolves to false", async () => {
    const result = await verifyDummyPassword("test-password");
    expect(result).toBe(false);
  });

  it("verifyDummyPassword handles empty/missing password gracefully", async () => {
    const result = await verifyDummyPassword("");
    expect(result).toBe(false);
  });
});
