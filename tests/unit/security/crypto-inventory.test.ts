/**
 * @file tests/unit/security/crypto-inventory.test.ts
 * @description Regression tests for the cryptographic parameters documented in
 * `docs/reference/security/quantum-security.mdx`.
 *
 * These tests are the machine-checkable side of the inventory: if a primitive,
 * key length, IV length, Argon2 cost, WebAuthn algorithm or API-key hash changes,
 * the reference page must be updated in the same change.
 *
 * ### Features:
 * - AES-256-GCM key/IV/tag lengths
 * - production Argon2id parameters (pinned via the dummy hash)
 * - HKDF-SHA-256 derivation and legacy decrypt fallbacks
 * - WebAuthn registration algorithms (ES256, RS256)
 * - API-key HMAC-SHA-256 (not a bare SHA-256 digest)
 */

import { describe, expect, it, vi } from "vitest";
import { createHash, hkdfSync } from "node:crypto";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: () => "crypto-inventory-test-jwt-secret",
}));

import {
  AES256_HKDF_INFO,
  DUMMY_ARGON2_HASH,
  ENCRYPTION_CONFIG,
  resolveStaticAesKey,
} from "@utils/security/crypto";
import { hashApiKey } from "@src/databases/auth/api-keys";
import { buildRegistrationOptions } from "@src/databases/auth/webauthn/webauthn-service";

describe("documented crypto inventory", () => {
  it("uses AES-256-GCM with a 32-byte key and 16-byte IV/tag", () => {
    expect(ENCRYPTION_CONFIG).toMatchObject({
      algorithm: "aes-256-gcm",
      keyLength: 32,
      ivLength: 16,
      authTagLength: 16,
    });
  });

  it("keeps production Argon2id at m=65536, t=3, p=4", () => {
    // The test runtime uses the fast config, but the dummy hash is the
    // production-parameter hash used for timing normalization.
    expect(DUMMY_ARGON2_HASH).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
  });

  it("derives passphrase keys with HKDF-SHA-256 and keeps the legacy SHA-256 fallback", () => {
    const raw = "a passphrase-shaped key that is not 64 hex characters";
    const resolved = resolveStaticAesKey(
      { hkdfSync, createHash },
      raw,
      AES256_HKDF_INFO.fieldAtRest,
    );

    expect(resolved.primary).toHaveLength(32);
    const legacy = createHash("sha256").update(raw, "utf8").digest();
    expect(resolved.fallbacks.some((key) => key.equals(legacy))).toBe(true);
  });

  it("uses a 64-character hex key as raw 32 bytes with no KDF", () => {
    const hex = "ab".repeat(32);
    const resolved = resolveStaticAesKey(
      { hkdfSync, createHash },
      hex,
      AES256_HKDF_INFO.fieldAtRest,
    );

    expect(resolved.primary).toEqual(Buffer.from(hex, "hex"));
    expect(resolved.fallbacks).toHaveLength(0);
  });

  it("domain-separates the HKDF info strings", () => {
    const values = Object.values(AES256_HKDF_INFO);
    expect(new Set(values).size).toBe(values.length);
  });

  it("offers ES256 and RS256 for WebAuthn registration", () => {
    const options = buildRegistrationOptions(
      { _id: "user-1", email: "user@example.com", username: "user" } as never,
      "example.com",
      "challenge",
    );

    expect(options.pubKeyCredParams.map((param) => param.alg)).toEqual([-7, -257]);
  });

  it("hashes API keys with HMAC-SHA-256, not a bare SHA-256 digest", () => {
    const key = "sck_test_key_material_0123456789";
    const digest = hashApiKey(key);

    expect(digest).not.toBe(createHash("sha256").update(key).digest("base64url"));
    expect(hashApiKey(key)).toBe(digest);
  });
});
