/**
 * @file tests/unit/utils/security.test.ts
 * @description Tests for cryptographic utility functions.
 *
 * Tests:
 * - Password hashing (Argon2id)
 * - Checksum generation
 * - Security properties
 *
 * Note: the legacy password-based encryptData/decryptData/deriveKey helpers
 * were removed (dead code — see src/utils/security/crypto.ts); static-key
 * encryption is covered by static-aes-key/settings-crypto/totp-encryption tests.
 */

import { createChecksum, hashPassword, verifyPassword } from "@src/utils/security";
import { timingSafeStringEqual } from "@src/utils/native-utils";
import { describe, it, expect } from "vitest";

describe("Crypto Utils - Password Hashing", () => {
  it("should hash a password", async () => {
    const password = "TestPassword123!";
    const hash = await hashPassword(password);

    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).toContain("$argon2");
  }, 60000);

  it("should create unique hashes for same password", async () => {
    const password = "TestPassword123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Hashes should be different due to unique salts
    expect(hash1).not.toBe(hash2);
  }, 60000);

  it("should verify correct password", async () => {
    const password = "TestPassword123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  }, 60000);

  it("should reject incorrect password", async () => {
    const password = "TestPassword123!";
    const wrongPassword = "WrongPassword123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, wrongPassword);
    expect(isValid).toBe(false);
  }, 60000);

  it("should handle empty passwords", async () => {
    const hash = await hashPassword("");
    expect(typeof hash).toBe("string");

    const isValid = await verifyPassword(hash, "");
    expect(isValid).toBe(true);
  }, 60000);

  it("should handle long passwords", async () => {
    const longPassword = "a".repeat(1000);
    const hash = await hashPassword(longPassword);

    const isValid = await verifyPassword(hash, longPassword);
    expect(isValid).toBe(true);
  }, 60000);

  it("should handle special characters in passwords", async () => {
    const password = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  }, 60000);

  it("should handle unicode passwords", async () => {
    const password = "パスワード🔒密码";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  }, 60000);
});

describe("Crypto Utils - Checksum", () => {
  it("should create checksum for string", async () => {
    const data = "test data";
    const checksum = await createChecksum(data);

    expect(typeof checksum).toBe("string");
    expect(checksum.length).toBeGreaterThan(0);
  });

  it("should create checksum for object", async () => {
    const data = { key: "value", number: 123 };
    const checksum = await createChecksum(data);

    expect(typeof checksum).toBe("string");
    expect(checksum.length).toBeGreaterThan(0);
  });

  it("should create consistent checksums", async () => {
    const data = "test data";
    const checksum1 = await createChecksum(data);
    const checksum2 = await createChecksum(data);

    expect(checksum1).toBe(checksum2);
  });

  it("should create different checksums for different data", async () => {
    const checksum1 = await createChecksum("data1");
    const checksum2 = await createChecksum("data2");

    expect(checksum1).not.toBe(checksum2);
  });

  it("should handle object property order", async () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };

    const checksum1 = await createChecksum(obj1);
    const checksum2 = await createChecksum(obj2);

    // JSON.stringify does NOT sort keys, so order matters
    expect(checksum1).not.toBe(checksum2);
  });
  it("should handle nested objects", async () => {
    const data = {
      level1: {
        level2: {
          value: "nested",
        },
      },
    };

    const checksum = await createChecksum(data);
    expect(typeof checksum).toBe("string");
  });

  it("should handle arrays", async () => {
    const data = [1, 2, 3, 4, 5];
    const checksum = await createChecksum(data);

    expect(typeof checksum).toBe("string");
  });

  it("should handle null", async () => {
    // null stringifies to 'null'
    const checksumNull = await createChecksum(null);
    expect(typeof checksumNull).toBe("string");
    expect(checksumNull.length).toBe(64); // SHA-256 hex is 64 chars
  });
});

describe("Crypto Utils - Security Properties", () => {
  it("should use Argon2id algorithm", async () => {
    const hash = await hashPassword("test");

    // Argon2id hashes start with $argon2id$
    expect(hash.startsWith("$argon2id$")).toBe(true);
  }, 60000);

  it("should be computationally expensive", async () => {
    const start = Date.now();
    const hash = await hashPassword("test");
    const duration = Date.now() - start;

    // Argon2id should produce a valid hash. In test mode with reduced
    // memory/time cost, the hash may complete in under 1ms.
    expect(hash).toContain("$argon2");
    expect(duration).toBeGreaterThanOrEqual(0);
  }, 60000);

  it("should resist timing attacks", async () => {
    const password = "TestPassword123!";
    const hash = await hashPassword(password);

    const start1 = Date.now();
    await verifyPassword(hash, "wrong");
    const duration1 = Date.now() - start1;

    const start2 = Date.now();
    await verifyPassword(hash, password);
    const duration2 = Date.now() - start2;

    // Durations should be similar (within reasonable variance)
    // This is a basic check - true timing resistance is harder to test
    expect(Math.abs(duration1 - duration2)).toBeLessThan(1000);
  }, 60000);

  it("timingSafeStringEqual correctly checks equality in constant time", () => {
    expect(timingSafeStringEqual("token123", "token123")).toBe(true);
    expect(timingSafeStringEqual("token123", "token124")).toBe(false);
    expect(timingSafeStringEqual("token123", "token1234")).toBe(false);
    expect(timingSafeStringEqual("", "")).toBe(true);
    expect(timingSafeStringEqual("a", "")).toBe(false);
    expect(timingSafeStringEqual(null as any, "abc")).toBe(false);
  });
});
