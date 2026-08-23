/**
 * @file tests/unit/utils/static-aes-key.test.ts
 * @description HKDF-SHA-256 static AES key resolution and GCM dual-read.
 *
 * Features tested:
 * - Hex / strict-base64 keys used as raw 32-byte AES keys (no KDF)
 * - Passphrase keys derived via HKDF-SHA-256 (domain-separated)
 * - Decrypt fallback to SHA-256(raw) envelopes written before HKDF
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AES256_HKDF_INFO,
  AES256_HKDF_SALT,
  aesGcmDecryptWithKeys,
  resolveStaticAesKey,
  staticAesKeyRing,
} from "@utils/security/crypto";

const cryptoMod = { hkdfSync, createHash };

describe("resolveStaticAesKey", () => {
  it("uses a 64-char hex string as a raw 32-byte key", () => {
    const hex = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const resolved = resolveStaticAesKey(cryptoMod, hex, AES256_HKDF_INFO.totpSecret);
    expect(resolved.primary.equals(Buffer.from(hex, "hex"))).toBe(true);
    expect(resolved.fallbacks).toHaveLength(0);
  });

  it("derives passphrase keys with HKDF-SHA-256, not SHA-256(raw)", () => {
    const passphrase = "passphrase-key-must-be-32chars!!";
    const resolved = resolveStaticAesKey(cryptoMod, passphrase, AES256_HKDF_INFO.pluginSettings);
    const sha256 = createHash("sha256").update(passphrase, "utf8").digest();
    const hkdf = Buffer.from(
      hkdfSync("sha256", passphrase, AES256_HKDF_SALT, AES256_HKDF_INFO.pluginSettings, 32),
    );
    expect(resolved.primary.equals(hkdf)).toBe(true);
    expect(resolved.primary.equals(sha256)).toBe(false);
    expect(resolved.fallbacks.some((key) => key.equals(sha256))).toBe(true);
  });

  it("domain-separates plugin settings from TOTP for the same passphrase", () => {
    const passphrase = "passphrase-key-must-be-32chars!!";
    const plugin = resolveStaticAesKey(cryptoMod, passphrase, AES256_HKDF_INFO.pluginSettings);
    const totp = resolveStaticAesKey(cryptoMod, passphrase, AES256_HKDF_INFO.totpSecret);
    expect(plugin.primary.equals(totp.primary)).toBe(false);
  });
});

describe("aesGcmDecryptWithKeys dual-read", () => {
  it("decrypts ciphertext written with the legacy SHA-256 key", () => {
    const passphrase = "passphrase-key-must-be-32chars!!";
    const legacyKey = createHash("sha256").update(passphrase, "utf8").digest();
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update("secret-value", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const resolved = resolveStaticAesKey(cryptoMod, passphrase, AES256_HKDF_INFO.totpSecret);
    const decrypted = aesGcmDecryptWithKeys(
      { createDecipheriv },
      {
        keys: staticAesKeyRing(resolved),
        iv,
        authTag,
        ciphertext,
      },
    );
    expect(decrypted?.toString("utf8")).toBe("secret-value");
  });
});
