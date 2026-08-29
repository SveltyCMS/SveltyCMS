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

/** Non-hex ENCRYPTION_KEY stand-in (32 chars). Not a user password. */
const ENV_KEY_MATERIAL = "static-aes-env-key-32-bytes!!!!";

/** Independent pre-HKDF digest of env key material (AES key bytes, not a login hash). */
function envKeySha256(envKeyMaterial: string): Buffer {
  // codeql[js/insufficient-password-hash]: env-key material → AES-256 key bytes
  // (compat digest), NOT a password KDF — login passwords are Argon2id.
  return createHash("sha256").update(envKeyMaterial, "utf8").digest();
}

describe("resolveStaticAesKey", () => {
  it("uses a 64-char hex string as a raw 32-byte key", () => {
    const hex = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    const resolved = resolveStaticAesKey(cryptoMod, hex, AES256_HKDF_INFO.totpSecret);
    expect(resolved.primary.equals(Buffer.from(hex, "hex"))).toBe(true);
    expect(resolved.fallbacks).toHaveLength(0);
  });

  it("uses strict standard base64 (44 chars → 32 bytes) as a raw key", () => {
    const b64 = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef").toString("base64");
    expect(b64.length).toBe(64);
    const resolved = resolveStaticAesKey(cryptoMod, b64, AES256_HKDF_INFO.totpSecret);
    expect(resolved.primary.equals(Buffer.from(b64, "base64").subarray(0, 32))).toBe(true);
    expect(resolved.fallbacks).toHaveLength(0);
  });

  it("uses strict base64url (-/_) as a raw key", () => {
    const raw = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef");
    const b64url = raw.toString("base64url");
    const resolved = resolveStaticAesKey(cryptoMod, b64url, AES256_HKDF_INFO.totpSecret);
    expect(resolved.primary.equals(raw.subarray(0, 32))).toBe(true);
    expect(resolved.fallbacks).toHaveLength(0);
  });

  it("derives non-hex env keys with HKDF-SHA-256, not SHA-256(raw)", () => {
    const resolved = resolveStaticAesKey(
      cryptoMod,
      ENV_KEY_MATERIAL,
      AES256_HKDF_INFO.pluginSettings,
    );
    const preHkdf = envKeySha256(ENV_KEY_MATERIAL);
    const hkdf = Buffer.from(
      hkdfSync("sha256", ENV_KEY_MATERIAL, AES256_HKDF_SALT, AES256_HKDF_INFO.pluginSettings, 32),
    );
    expect(resolved.primary.equals(hkdf)).toBe(true);
    expect(resolved.primary.equals(preHkdf)).toBe(false);
    expect(resolved.fallbacks.some((key) => key.equals(preHkdf))).toBe(true);
  });

  it("domain-separates plugin settings from TOTP for the same env key", () => {
    const plugin = resolveStaticAesKey(
      cryptoMod,
      ENV_KEY_MATERIAL,
      AES256_HKDF_INFO.pluginSettings,
    );
    const totp = resolveStaticAesKey(cryptoMod, ENV_KEY_MATERIAL, AES256_HKDF_INFO.totpSecret);
    expect(plugin.primary.equals(totp.primary)).toBe(false);
  });
});

describe("aesGcmDecryptWithKeys", () => {
  it("decrypts ciphertext written with the legacy SHA-256 key (dual-read)", () => {
    const legacyKey = envKeySha256(ENV_KEY_MATERIAL);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const ciphertext = Buffer.concat([cipher.update("secret-value", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const resolved = resolveStaticAesKey(cryptoMod, ENV_KEY_MATERIAL, AES256_HKDF_INFO.totpSecret);
    const decrypted = aesGcmDecryptWithKeys(
      { createDecipheriv },
      { keys: staticAesKeyRing(resolved), iv, authTag, ciphertext },
    );
    expect(decrypted?.toString("utf8")).toBe("secret-value");
  });

  it("decrypts ciphertext written with the primary HKDF key", () => {
    const resolved = resolveStaticAesKey(cryptoMod, ENV_KEY_MATERIAL, AES256_HKDF_INFO.totpSecret);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", resolved.primary, iv);
    const ciphertext = Buffer.concat([cipher.update("primary-key-value", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const decrypted = aesGcmDecryptWithKeys(
      { createDecipheriv },
      { keys: staticAesKeyRing(resolved), iv, authTag, ciphertext },
    );
    expect(decrypted?.toString("utf8")).toBe("primary-key-value");
  });

  it("returns null for a wrong key / garbled tag", () => {
    const resolved = resolveStaticAesKey(cryptoMod, ENV_KEY_MATERIAL, AES256_HKDF_INFO.totpSecret);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", resolved.primary, iv);
    const ciphertext = Buffer.concat([cipher.update("secret", "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const wrongKey = Buffer.alloc(32, 0x42);
    const result = aesGcmDecryptWithKeys(
      { createDecipheriv },
      { keys: [wrongKey], iv, authTag, ciphertext },
    );
    expect(result).toBeNull();

    const garbledTag = Buffer.from(authTag);
    garbledTag[0] ^= 0xff;
    const garbled = aesGcmDecryptWithKeys(
      { createDecipheriv },
      { keys: staticAesKeyRing(resolved), iv, authTag: garbledTag, ciphertext },
    );
    expect(garbled).toBeNull();
  });
});
