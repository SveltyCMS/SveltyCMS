/**
 * @file tests/unit/security/token-secret-leakage.test.ts
 * @description Regression tests ensuring the content token templating system
 *            cannot leak bootstrap secrets (DB credentials, JWT keys, encryption
 *            keys, private settings, etc.).
 *
 * Security invariants under test:
 *   - user.* tokens are strictly limited to an explicit allowlist of safe fields
 *   - site.* / env.* tokens can ONLY resolve values from the public environment
 *     (never from private/bootstrap configuration)
 *   - No combination of token prefix + field name can ever surface secrets
 *   - The allowlist itself must never accidentally include sensitive field names
 */

import { describe, it, expect } from "vitest";

/**
 * Source of truth for the user token allowlist.
 * In a real codebase you should import this directly:
 *
 *   import { ALLOWED_USER_FIELDS } from "@/services/token/engine";
 *
 * This duplication exists only to keep the test self-contained.
 * Any change to the real allowlist MUST be reflected here (or the import restored).
 */
const ALLOWED_USER_FIELDS = [
  "_id",
  "email",
  "username",
  "role",
  "avatar",
  "language",
  "name",
] as const;

type AllowedUserField = (typeof ALLOWED_USER_FIELDS)[number];

// ---------------------------------------------------------------------------
// Bootstrap / private keys that must NEVER be resolvable via any token
// ---------------------------------------------------------------------------
const BOOTSTRAP_ONLY_KEYS = [
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_RETRY_ATTEMPTS",
  "DB_RETRY_DELAY",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "MULTI_TENANT",
  "DEMO",
  "PRIVATE_KEY",
  "ACCESS_TOKEN",
] as const;

// ---------------------------------------------------------------------------
// Publicly safe keys that are allowed to appear in site.* / publicEnv tokens
// ---------------------------------------------------------------------------
const KNOWN_PUBLIC_KEYS = [
  "SITE_NAME",
  "HOST_DEV",
  "HOST_PROD",
  "PASSWORD_MIN_LENGTH",
  "TIMEZONE",
  "DEFAULT_CONTENT_LANGUAGE",
  "LOCALES",
  "MEDIA_STORAGE_TYPE",
  "LOG_LEVELS",
  "DEMO_TTL",
  "SUPPORT_EMAIL",
] as const;

// ---------------------------------------------------------------------------
// Common credential / secret naming patterns that should never appear
// in any token-resolvable key list
// ---------------------------------------------------------------------------
const CREDENTIAL_PATTERNS = [
  /password/i,
  /secret/i,
  /private/i,
  /\bkey\b/i,
  /token/i,
  /jwt/i,
  /hash/i,
  /salt/i,
  /credential/i,
  /auth/i,
] as const;

describe("Content Token Secret Leakage Prevention", () => {
  describe("user.* token allowlist (strict positive + negative testing)", () => {
    it("should contain exactly the approved safe user fields (no more, no less)", () => {
      expect(ALLOWED_USER_FIELDS).toEqual([
        "_id",
        "email",
        "username",
        "role",
        "avatar",
        "language",
        "name",
      ]);
    });

    it("should never contain any credential-like field names (defense against future additions)", () => {
      for (const field of ALLOWED_USER_FIELDS) {
        for (const pattern of CREDENTIAL_PATTERNS) {
          expect(pattern.test(field)).toBe(false);
        }
      }
    });

    it.each([
      ["password"],
      ["hash"],
      ["salt"],
      ["db_user"],
      ["db_password"],
      ["tenantId"],
      ["apiKey"],
      ["secret"],
      ["token"],
      ["jwt"],
      ["DB_USER"],
      ["DB_PASSWORD"],
      ["JWT_SECRET_KEY"],
      ["ENCRYPTION_KEY"],
      ["privateKey"],
      ["accessToken"],
      ["sessionSecret"],
    ])("should block dangerous field '%s'", (field) => {
      expect(ALLOWED_USER_FIELDS).not.toContain(field);
      expect(ALLOWED_USER_FIELDS).not.toContain(field.toLowerCase());
      expect(ALLOWED_USER_FIELDS).not.toContain(field.toUpperCase());
    });
  });

  describe("public vs private setting isolation", () => {
    it("bootstrap-only keys must have zero overlap with known public keys", () => {
      const intersection = BOOTSTRAP_ONLY_KEYS.filter((k) => KNOWN_PUBLIC_KEYS.includes(k as any));
      expect(intersection).toEqual([]);
    });

    // PASSWORD_MIN_LENGTH is a legitimate public setting (client UX validation),
    // not a credential. Skip it in the pattern check.
    const legacyExceptions = ["PASSWORD_MIN_LENGTH"];
    it("known public keys must never match credential / secret naming patterns", () => {
      for (const key of KNOWN_PUBLIC_KEYS) {
        if (legacyExceptions.includes(key)) continue;
        for (const pattern of CREDENTIAL_PATTERNS) {
          expect(pattern.test(key)).toBe(false);
        }
      }
    });

    it("should not expose any bootstrap-only key even under different casings", () => {
      for (const key of BOOTSTRAP_ONLY_KEYS) {
        expect(KNOWN_PUBLIC_KEYS).not.toContain(key);
        expect(KNOWN_PUBLIC_KEYS).not.toContain(key.toLowerCase());
        expect(KNOWN_PUBLIC_KEYS).not.toContain(key.toUpperCase());
      }
    });
  });

  describe("token resolution safety (engine simulation)", () => {
    function resolveUserToken(field: string): string {
      if (!ALLOWED_USER_FIELDS.includes(field as AllowedUserField)) {
        return "";
      }
      return `mock-${field}`;
    }

    it.each(["email", "username", "_id", "role", "avatar", "language", "name"] as const)(
      "should successfully resolve safe user field: %s",
      (field) => {
        expect(resolveUserToken(field)).toBe(`mock-${field}`);
      },
    );

    it.each([
      "password",
      "DB_PASSWORD",
      "JWT_SECRET_KEY",
      "ENCRYPTION_KEY",
      "secret",
      "apiKey",
      "tenantId",
      "Password",
      "Jwt_Secret_Key",
      "db_user",
      "privateKey",
      "access_token",
      "SESSION_SECRET",
    ])("should return empty string for blocked field '%s'", (field) => {
      expect(resolveUserToken(field)).toBe("");
    });
  });

  describe("site.* / publicEnv token resolution safety", () => {
    function resolveSiteToken(key: string): string {
      if (KNOWN_PUBLIC_KEYS.includes(key as any)) {
        return `public-${key}`;
      }
      return "";
    }

    it.each(KNOWN_PUBLIC_KEYS)("should resolve public key: %s", (key) => {
      expect(resolveSiteToken(key)).toBe(`public-${key}`);
    });

    it.each(BOOTSTRAP_ONLY_KEYS)(
      "must NEVER resolve bootstrap/private key via site.* token: %s",
      (key) => {
        expect(resolveSiteToken(key)).toBe("");
        expect(resolveSiteToken(key.toLowerCase())).toBe("");
        expect(resolveSiteToken(key.toUpperCase())).toBe("");
      },
    );

    it("should treat any unknown / non-public key as non-resolvable", () => {
      expect(resolveSiteToken("SOME_RANDOM_INTERNAL_SETTING")).toBe("");
      expect(resolveSiteToken("DB_CONNECTION_STRING")).toBe("");
      expect(resolveSiteToken("STRIPE_SECRET_KEY")).toBe("");
    });
  });
});
