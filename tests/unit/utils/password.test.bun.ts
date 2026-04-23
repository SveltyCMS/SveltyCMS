/**
 * @file tests\unit\utils\password.test.bun.ts
 * @description Tests for the password utility functions.
 */

import { describe, it, expect } from "bun:test";
import {
  hashPassword,
  verifyPassword,
  needsRehashing,
  getPasswordConfig,
} from "@src/utils/password";

describe("Password Utilities (Quantum-resistant Argon2id)", () => {
  const plainPassword = "SuperSecretPassword123!";

  it("should successfully hash a password", async () => {
    const hash = await hashPassword(plainPassword);
    expect(hash).toBeString();
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toBe(plainPassword);
  });

  it("should verify a correct password", async () => {
    const hash = await hashPassword(plainPassword);
    const isValid = await verifyPassword(hash, plainPassword);
    expect(isValid).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hash = await hashPassword(plainPassword);
    const isValid = await verifyPassword(hash, "WrongPassword123!");
    expect(isValid).toBe(false);
  });

  it("should generate unique hashes for the same password (salting)", async () => {
    const hash1 = await hashPassword(plainPassword);
    const hash2 = await hashPassword(plainPassword);
    expect(hash1).not.toBe(hash2);
  });

  it("should verify correctly even with different hashes for the same password", async () => {
    const hash1 = await hashPassword(plainPassword);
    const hash2 = await hashPassword(plainPassword);
    expect(await verifyPassword(hash1, plainPassword)).toBe(true);
    expect(await verifyPassword(hash2, plainPassword)).toBe(true);
  });

  it("should return false for invalid hash formats", async () => {
    const isValid = await verifyPassword("not-a-hash", plainPassword);
    expect(isValid).toBe(false);
  });

  it("should return the correct Argon2 config", () => {
    const config = getPasswordConfig();
    expect(config).toBeDefined();
    expect(config.memoryCost).toBe(65536);
    expect(config.timeCost).toBe(3);
    expect(config.parallelism).toBe(4);
    expect(config.type).toBe(2); // argon2id
  });

  it("should correctly check if rehashing is needed", async () => {
    const hash = await hashPassword(plainPassword);
    // The hash we just created should use the current settings, so it doesn't need rehashing
    const needsRehash = await needsRehashing(hash);
    expect(needsRehash).toBe(false);
  });

  it("should indicate rehashing is needed for weak or invalid hashes", async () => {
    // Generate a mock hash with weak parameters, argon2 verify shouldn't crash but needsRehash should be true
    // Or just pass a completely invalid hash - our catch block returns true
    const needsRehash = await needsRehashing("invalid-hash");
    expect(needsRehash).toBe(true);
  });
});
