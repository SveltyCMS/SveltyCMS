/**
 * @file tests/bun/utils/crypto.test.ts
 * @description Tests for cryptographic utility functions
 *
 * Tests:
 * - Password hashing (Argon2id)
 * - Random token generation
 * - Checksum generation
 * - AES-256-GCM encryption/decryption
 * - Key derivation (Argon2)
 * - Security properties (timing attack resistance)
 */

import {
  createChecksum,
  generateRandomToken,
  hashPassword,
  verifyPassword,
  encryptData,
  decryptData,
  deriveKey,
  ENCRYPTION_CONFIG as encryptionConfig,
} from "@src/utils/security";

describe("Crypto Utils - AES-256-GCM Encryption", () => {
  const testPassword = "TestPassword123!";
  const testData = {
    username: "admin",
    email: "admin@example.com",
    secret: "my-secret-key",
  };

  it("should encrypt data successfully", async () => {
    const encrypted = await encryptData(testData, testPassword);

    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);
    // Encrypted data should be base64 encoded
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
  });

  it("should decrypt data successfully with correct password", async () => {
    const encrypted = await encryptData(testData, testPassword);
    const decrypted = await decryptData(encrypted, testPassword);

    expect(decrypted).toEqual(testData);
  });

  it("should produce different ciphertext for same data (unique salt/IV)", async () => {
    const encrypted1 = await encryptData(testData, testPassword);
    const encrypted2 = await encryptData(testData, testPassword);

    // Each encryption should use unique salt and IV
    expect(encrypted1).not.toBe(encrypted2);
  });

  it("should fail to decrypt with wrong password", async () => {
    const encrypted = await encryptData(testData, testPassword);
    const wrongPassword = "WrongPassword123!";

    await expect(decryptData(encrypted, wrongPassword)).rejects.toThrow();
  });

  it("should fail to decrypt tampered data", async () => {
    const encrypted = await encryptData(testData, testPassword);
    // Tamper with the encrypted data
    const tampered = encrypted.slice(0, -2) + "XX";

    await expect(decryptData(tampered, testPassword)).rejects.toThrow();
  });

  it("should encrypt and decrypt nested objects", async () => {
    const nestedData = {
      user: {
        profile: {
          name: "John",
          settings: { theme: "dark" },
        },
      },
    };

    const encrypted = await encryptData(nestedData, testPassword);
    const decrypted = await decryptData(encrypted, testPassword);

    expect(decrypted).toEqual(nestedData);
  });

  it("should handle empty objects", async () => {
    const emptyData = {};

    const encrypted = await encryptData(emptyData, testPassword);
    const decrypted = await decryptData(encrypted, testPassword);

    expect(decrypted).toEqual(emptyData);
  });

  it("should handle special characters in data", async () => {
    const specialData = { text: "!@#$%^&*()_+-=[]{}|;:,.<>?/~`" };

    const encrypted = await encryptData(specialData, testPassword);
    const decrypted = await decryptData(encrypted, testPassword);

    expect(decrypted).toEqual(specialData);
  });

  it("should handle unicode in data", async () => {
    const unicodeData = { name: "José García", emoji: "🎉", chinese: "你好" };

    const encrypted = await encryptData(unicodeData, testPassword);
    const decrypted = await decryptData(encrypted, testPassword);

    expect(decrypted).toEqual(unicodeData);
  });

  it("should use correct encryption algorithm", async () => {
    expect(encryptionConfig.algorithm).toBe("aes-256-gcm");
    expect(encryptionConfig.keyLength).toBe(32); // 256 bits
  });
});

describe("Crypto Utils - Key Derivation", () => {
  const testPassword = "DeriveKey123!";

  it("should derive key from password", async () => {
    const salt = Buffer.alloc(16, "test-salt-");
    const key = await deriveKey(testPassword, salt);

    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32); // 256 bits for AES-256
  });

  it("should produce different keys for different passwords", async () => {
    const salt = Buffer.alloc(16, "test-salt-");
    const key1 = await deriveKey(testPassword, salt);
    const key2 = await deriveKey("DifferentPassword123!", salt);

    expect(key1.toString("hex")).not.toBe(key2.toString("hex"));
  });

  it("should produce same key for same password and salt", async () => {
    const salt = Buffer.alloc(16, "test-salt-");
    const key1 = await deriveKey(testPassword, salt);
    const key2 = await deriveKey(testPassword, salt);

    expect(key1.toString("hex")).toBe(key2.toString("hex"));
  });

  it("should produce different keys with different salts", async () => {
    const salt1 = Buffer.alloc(16, "salt-one----");
    const salt2 = Buffer.alloc(16, "salt-two----");
    const key1 = await deriveKey(testPassword, salt1);
    const key2 = await deriveKey(testPassword, salt2);

    // Keys should be different due to different salts
    expect(key1.toString("hex")).not.toBe(key2.toString("hex"));
  });
});

describe("Crypto Utils - Password Hashing", () => {
  it("should hash a password", async () => {
    const password = "TestPassword123!";
    const hash = await hashPassword(password);

    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).toContain("$argon2");
  });

  it("should create unique hashes for same password", async () => {
    const password = "TestPassword123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Hashes should be different due to unique salts
    expect(hash1).not.toBe(hash2);
  });

  it("should verify correct password", async () => {
    const password = "TestPassword123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it("should reject incorrect password", async () => {
    const password = "TestPassword123!";
    const wrongPassword = "WrongPassword123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, wrongPassword);
    expect(isValid).toBe(false);
  });

  it("should handle empty passwords", async () => {
    const hash = await hashPassword("");
    expect(typeof hash).toBe("string");

    const isValid = await verifyPassword(hash, "");
    expect(isValid).toBe(true);
  });

  it("should handle long passwords", async () => {
    const longPassword = "a".repeat(1000);
    const hash = await hashPassword(longPassword);

    const isValid = await verifyPassword(hash, longPassword);
    expect(isValid).toBe(true);
  });

  it("should handle special characters in passwords", async () => {
    const password = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it("should handle unicode passwords", async () => {
    const password = "パスワード🔒密码";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });
});

describe("Crypto Utils - Random Token Generation", () => {
  it("should generate random token of default length", async () => {
    const token = await generateRandomToken();

    expect(typeof token).toBe("string");
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("should generate token of specified length", async () => {
    const token = await generateRandomToken(16);

    expect(typeof token).toBe("string");
    expect(token.length).toBe(32); // 16 bytes = 32 hex chars
  });

  it("should generate unique tokens", async () => {
    const token1 = await generateRandomToken();
    const token2 = await generateRandomToken();

    expect(token1).not.toBe(token2);
  });

  it("should generate hexadecimal tokens", async () => {
    const token = await generateRandomToken();

    // Should only contain hex characters (0-9, a-f)
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("should handle small token sizes", async () => {
    const token = await generateRandomToken(1);

    expect(token.length).toBe(2); // 1 byte = 2 hex chars
  });

  it("should handle large token sizes", async () => {
    const token = await generateRandomToken(256);

    expect(token.length).toBe(512); // 256 bytes = 512 hex chars
  });
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
  });

  it("should be computationally expensive", async () => {
    const start = Date.now();
    await hashPassword("test");
    const duration = Date.now() - start;

    // Argon2id should take some time (at least a few ms)
    expect(duration).toBeGreaterThan(0);
  });

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
  });
});
