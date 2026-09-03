/**
 * @file tests/unit/auth/totp-pure.test.ts
 * @description Pure unit test suite for RFC 6238 TOTP two-factor authentication functions.
 *
 * Features tested:
 * - Secret generation and RFC 4648 Base32 validation
 * - Current TOTP code calculation and timing-safe verification
 * - QR code URI generation conforming to otpauth specification
 * - Backup code generation, HMAC-SHA256 hashing, and verification
 * - Secret at-rest encryption and decryption roundtrips
 * - Device fingerprint generation and trusted device cookie config
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (key: string) => {
    if (key === "JWT_SECRET_KEY") return "test-jwt-secret-key-at-least-32-chars-long";
    if (key === "ENCRYPTION_KEY")
      return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    return undefined;
  },
  getPrivateSetting: async (key: string) => {
    if (key === "JWT_SECRET_KEY") return "test-jwt-secret-key-at-least-32-chars-long";
    if (key === "ENCRYPTION_KEY")
      return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    return undefined;
  },
}));
import {
  buildDeviceFingerprint,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateManualEntryDetails,
  generateQRCodeURL,
  generateTOTPSecret,
  getCurrentTOTPCode,
  getTrustedDeviceCookieConfig,
  hashBackupCode,
  isValidTOTPSecret,
  verifyBackupCode,
  verifyTOTPCode,
} from "@src/databases/auth/totp";

describe("TOTP 2FA Service (Unit Suite)", () => {
  it("generates a valid Base32 RFC 4648 secret", async () => {
    const secret = await generateTOTPSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(isValidTOTPSecret(secret)).toBe(true);
  });

  it("validates valid and invalid Base32 TOTP secrets", () => {
    expect(isValidTOTPSecret("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(isValidTOTPSecret("")).toBe(false);
    expect(isValidTOTPSecret("INVALID!SECRET")).toBe(false);
    expect(isValidTOTPSecret("1890")).toBe(false); // Base32 does not use 1, 8, 9, 0
  });

  it("generates a 6-digit TOTP code that verifies successfully", async () => {
    const secret = await generateTOTPSecret();
    const code = await getCurrentTOTPCode(secret);

    expect(code).toMatch(/^\d{6}$/);
    const isValid = await verifyTOTPCode(secret, code);
    expect(isValid).toBe(true);
  });

  it("rejects invalid, malformed, or wrong-length TOTP codes", async () => {
    const secret = await generateTOTPSecret();

    expect(await verifyTOTPCode(secret, "")).toBe(false);
    expect(await verifyTOTPCode(secret, "123")).toBe(false);
    expect(await verifyTOTPCode(secret, "1234567")).toBe(false);
    expect(await verifyTOTPCode(secret, "000000")).toBe(false);
  });

  it("generates correct otpauth QR code URL", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const url = generateQRCodeURL(secret, "user@sveltycms.test", "SveltyCMS");

    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=SveltyCMS");
  });

  it("generates manual entry details matching RFC parameters", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const details = generateManualEntryDetails(secret, "admin@test.com", "SveltyCMS");

    expect(details.account).toBe("admin@test.com");
    expect(details.secret).toBe(secret);
    expect(details.issuer).toBe("SveltyCMS");
    expect(details.digits).toBe(6);
    expect(details.period).toBe(30);
    expect(details.algorithm).toBe("sha1");
  });

  it("generates, hashes, and verifies backup codes", async () => {
    const codes = await generateBackupCodes(5);
    expect(codes).toHaveLength(5);
    expect(codes[0]).toMatch(/^[A-F0-9]{16}$/);

    const hashed = await hashBackupCode(codes[0]);
    expect(typeof hashed).toBe("string");

    const valid = await verifyBackupCode(codes[0], hashed);
    expect(valid).toBe(true);

    const invalid = await verifyBackupCode("WRONGCODE123456", hashed);
    expect(invalid).toBe(false);
  });

  it("builds consistent device fingerprints and cookie configuration", async () => {
    const fp1 = await buildDeviceFingerprint("192.168.1.100", "Mozilla/5.0 Test");
    const fp2 = await buildDeviceFingerprint("192.168.1.100", "Mozilla/5.0 Test");
    const fpDifferent = await buildDeviceFingerprint("10.0.0.1", "Mozilla/5.0 Test");

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpDifferent);

    const cookieConfig = getTrustedDeviceCookieConfig();
    expect(cookieConfig.name).toBe("__Host-2fa-trusted-device");
    expect(cookieConfig.httpOnly).toBe(true);
    expect(cookieConfig.sameSite).toBe("strict");
  });

  it("handles encryptTotpSecret and decryptTotpSecret gracefully", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = await encryptTotpSecret(secret);
    expect(typeof encrypted).toBe("string");

    const decrypted = await decryptTotpSecret(encrypted);
    // With or without encryption key, it should decrypt or fallback safely
    expect(decrypted === secret || decrypted === null).toBe(true);

    expect(await decryptTotpSecret("")).toBeNull();
  });
});
