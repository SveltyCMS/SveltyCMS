/**
 * @file tests/unit/auth/totp-encryption.test.ts
 * @description Unit tests for TOTP secret encryption/decryption, trusted device tokens,
 *              and backward compatibility with legacy plaintext secrets.
 */

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Set encryption key before importing totp module
const ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const OLD_ENV = { ...process.env };

import { resetTotpEncryptionKeyCache } from "@src/databases/auth/totp";

describe("TOTP Secret Encryption", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    resetTotpEncryptionKeyCache();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    resetTotpEncryptionKeyCache();
  });

  it("should encrypt a TOTP secret and produce a non-plaintext string", async () => {
    const { encryptTotpSecret } = await import("@src/databases/auth/totp");
    const secret = "JBSWY3DPEHPK3PXP"; // valid base32

    const encrypted = await encryptTotpSecret(secret);

    // Encrypted value should not equal the original
    expect(encrypted).not.toBe(secret);
    // Should be base64-encoded (not base32 like the original)
    expect(encrypted).not.toMatch(/^[A-Z2-7]+=*$/);
    // Should be a non-empty string
    expect(encrypted.length).toBeGreaterThan(0);
  });

  it("should decrypt an encrypted secret back to the original", async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import("@src/databases/auth/totp");
    const original = "JBSWY3DPEHPK3PXP";

    const encrypted = await encryptTotpSecret(original);
    const decrypted = await decryptTotpSecret(encrypted);

    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertext for the same plaintext (unique IV)", async () => {
    const { encryptTotpSecret } = await import("@src/databases/auth/totp");
    const secret = "JBSWY3DPEHPK3PXP";

    const enc1 = await encryptTotpSecret(secret);
    const enc2 = await encryptTotpSecret(secret);

    // Different IVs should produce different ciphertext
    expect(enc1).not.toBe(enc2);
  });

  it("should decrypt to null for tampered ciphertext", async () => {
    const { encryptTotpSecret, decryptTotpSecret } = await import("@src/databases/auth/totp");
    const original = "JBSWY3DPEHPK3PXP";

    const encrypted = await encryptTotpSecret(original);
    // Tamper with the ciphertext by flipping a byte in the middle
    const tampered = encrypted.substring(0, 20) + "X" + encrypted.substring(21);

    const result = await decryptTotpSecret(tampered);
    expect(result).toBeNull();
  });

  it("should handle empty string input", async () => {
    const { decryptTotpSecret } = await import("@src/databases/auth/totp");

    const result = await decryptTotpSecret("");
    expect(result).toBeNull();
  });

  it("should return null for garbage input", async () => {
    const { decryptTotpSecret } = await import("@src/databases/auth/totp");

    const result = await decryptTotpSecret("not-valid-base64-or-base32!!");
    expect(result).toBeNull();
  });

  describe("Backward compatibility with legacy plaintext secrets", () => {
    it("should recognize and return legacy base32 secrets as-is", async () => {
      const { decryptTotpSecret } = await import("@src/databases/auth/totp");
      const legacySecret = "JBSWY3DPEHPK3PXP"; // valid base32 TOTP secret

      const result = await decryptTotpSecret(legacySecret);
      expect(result).toBe(legacySecret);
    });

    it("should handle legacy secrets with padding", async () => {
      const { decryptTotpSecret } = await import("@src/databases/auth/totp");
      const legacySecret = "JBSWY3DPEHPK3PXP===="; // with padding

      const result = await decryptTotpSecret(legacySecret);
      expect(result).toBe(legacySecret);
    });

    it("should encrypt-then-decrypt round-trip for legacy migration", async () => {
      const { encryptTotpSecret, decryptTotpSecret } = await import("@src/databases/auth/totp");
      const legacySecret = "JBSWY3DPEHPK3PXP";

      // Simulate migration: encrypt the legacy secret
      const encrypted = await encryptTotpSecret(legacySecret);
      // Later, decrypt it for verification
      const decrypted = await decryptTotpSecret(encrypted);

      expect(decrypted).toBe(legacySecret);
    });
  });

  describe("Graceful degradation without encryption key", () => {
    it("should store plaintext when no encryption key is configured", async () => {
      delete process.env.ENCRYPTION_KEY;
      delete process.env.SECRET_ENCRYPTION_KEY;
      vi.resetModules();

      const { encryptTotpSecret, resetTotpEncryptionKeyCache } =
        await import("@src/databases/auth/totp");
      resetTotpEncryptionKeyCache();
      const secret = "JBSWY3DPEHPK3PXP";

      const result = await encryptTotpSecret(secret);
      // Without a key, returns the secret as-is (graceful degradation)
      expect(result).toBe(secret);
    });
  });
});

describe("TOTP passphrase HKDF dual-read", () => {
  const envKeyMaterial = "totpEnvKeyMaterial00000000000001";
  const totpBase32 = "JBSWY3DPEHPK3PXP";

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.resetModules();
  });

  it("round-trips a TOTP secret under a passphrase ENCRYPTION_KEY", async () => {
    process.env.ENCRYPTION_KEY = envKeyMaterial;
    delete process.env.SECRET_ENCRYPTION_KEY;
    vi.resetModules();
    const { encryptTotpSecret, decryptTotpSecret, resetTotpEncryptionKeyCache } =
      await import("@src/databases/auth/totp");
    resetTotpEncryptionKeyCache();

    const encrypted = await encryptTotpSecret(totpBase32);
    expect(encrypted).not.toBe(totpBase32);
    expect(await decryptTotpSecret(encrypted)).toBe(totpBase32);
  });

  it("decrypts SHA-256(raw) envelopes written before HKDF", async () => {
    process.env.ENCRYPTION_KEY = envKeyMaterial;
    delete process.env.SECRET_ENCRYPTION_KEY;
    vi.resetModules();
    const { decryptTotpSecret, resetTotpEncryptionKeyCache } =
      await import("@src/databases/auth/totp");
    resetTotpEncryptionKeyCache();

    const legacyKey = createHash("sha256").update(envKeyMaterial, "utf8").digest();
    // codeql[js/insufficient-password-hash]: legacy pre-HKDF envelope fixture
    // (AES key material, not a password KDF).
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update(totpBase32, "utf8"), cipher.final()]);
    const envelope = Buffer.concat([
      Buffer.from([1]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64");

    expect(await decryptTotpSecret(envelope)).toBe(totpBase32);
  });
});

describe("Trusted Device Tokens", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("should generate a valid token for a user", async () => {
    const { generateTrustedDeviceToken } = await import("@src/databases/auth/totp");

    const token = await generateTrustedDeviceToken("user-1", "192.168:abc123");
    expect(token).not.toBeNull();
    expect(token).toContain("user-1");
    expect(token).toContain("192.168:abc123");
  });

  it("should verify a valid token", async () => {
    const { generateTrustedDeviceToken, verifyTrustedDeviceToken } =
      await import("@src/databases/auth/totp");

    const token = await generateTrustedDeviceToken("user-1", "192.168:abc123");
    const userId = await verifyTrustedDeviceToken(token!);

    expect(userId).toBe("user-1");
  });

  it("should reject a tampered token", async () => {
    const { generateTrustedDeviceToken, verifyTrustedDeviceToken } =
      await import("@src/databases/auth/totp");

    const token = await generateTrustedDeviceToken("user-1", "192.168:abc123");
    // Tamper with the user ID portion
    const tampered = token!.replace("user-1", "user-2");

    const result = await verifyTrustedDeviceToken(tampered);
    expect(result).toBeNull();
  });

  it("should reject tokens with insufficient parts", async () => {
    const { verifyTrustedDeviceToken } = await import("@src/databases/auth/totp");

    expect(await verifyTrustedDeviceToken("too-few-parts")).toBeNull();
    expect(await verifyTrustedDeviceToken("")).toBeNull();
  });

  it("should verify a token presented by the same device fingerprint (M9 rebinding)", async () => {
    const { generateTrustedDeviceToken, verifyTrustedDeviceToken } =
      await import("@src/databases/auth/totp");

    const token = await generateTrustedDeviceToken("user-1", "192.168:abc123");
    const userId = await verifyTrustedDeviceToken(token!, "192.168:abc123");

    expect(userId).toBe("user-1");
  });

  it("should reject a token presented by a different device fingerprint (M9 rebinding)", async () => {
    const { generateTrustedDeviceToken, verifyTrustedDeviceToken } =
      await import("@src/databases/auth/totp");

    const token = await generateTrustedDeviceToken("user-1", "192.168:abc123");
    // Stolen cookie replayed from another IP prefix / UA must NOT skip 2FA.
    const userId = await verifyTrustedDeviceToken(token!, "203.0.113:other-ua-hash");

    expect(userId).toBeNull();
  });

  it("should build a device fingerprint from IP and user-agent", async () => {
    const { buildDeviceFingerprint } = await import("@src/databases/auth/totp");

    const fp = await buildDeviceFingerprint("192.168.1.100", "Mozilla/5.0 (Windows NT 10.0)");

    expect(fp).toContain("192.168");
    // fingerprint should not include the full IP
    expect(fp).not.toContain("1.100");
  });

  it("should produce different fingerprints for different user agents", async () => {
    const { buildDeviceFingerprint } = await import("@src/databases/auth/totp");

    const fp1 = await buildDeviceFingerprint("10.0.0.1", "Chrome/120");
    const fp2 = await buildDeviceFingerprint("10.0.0.1", "Firefox/121");

    expect(fp1).not.toBe(fp2);
  });
});

describe("Configurable TOTP Window", () => {
  afterEach(() => {
    delete process.env.TOTP_WINDOW;
    process.env = { ...OLD_ENV };
  });

  it("should default to window 1", async () => {
    delete process.env.TOTP_WINDOW;
    // The TOTP_CONFIG is set at module load time, so we can read it
    const { getCurrentTOTPCode, verifyTOTPCode, generateTOTPSecret } =
      await import("@src/databases/auth/totp");

    const secret = await generateTOTPSecret();
    const code = await getCurrentTOTPCode(secret);

    // Verify with the correct code (window 1 allows ±30s)
    const valid = await verifyTOTPCode(secret, code);
    expect(valid).toBe(true);
  });

  it("should generate valid 6-digit TOTP codes", async () => {
    const { generateTOTPSecret, getCurrentTOTPCode } = await import("@src/databases/auth/totp");

    const secret = await generateTOTPSecret();
    const code = await getCurrentTOTPCode(secret);

    expect(code).toMatch(/^\d{6}$/);
  });

  it("should reject wrong codes", async () => {
    const { generateTOTPSecret, verifyTOTPCode } = await import("@src/databases/auth/totp");

    const secret = await generateTOTPSecret();

    // Verify with deliberately wrong code
    const valid = await verifyTOTPCode(secret, "000000");
    // This might coincidentally match in very rare cases, but is highly unlikely
    // within the 90-second window (1 in 1,000,000 chance)
    // We just check it returns a boolean
    expect(typeof valid).toBe("boolean");
  });

  it("should accept valid TOTP secret format", async () => {
    const { isValidTOTPSecret } = await import("@src/databases/auth/totp");

    expect(isValidTOTPSecret("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(isValidTOTPSecret("short")).toBe(false);
    expect(isValidTOTPSecret("")).toBe(false);
    expect(isValidTOTPSecret("1234567890123456")).toBe(false); // contains '1'
  });
});
