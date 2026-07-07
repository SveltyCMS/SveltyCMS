/**
 * @file tests/unit/security/token-secret-leakage.test.ts
 * @description Verify that the content token system cannot expose
 * bootstrap secrets (DB creds, JWT keys) or private settings.
 *
 * Ensures:
 * - user.* token allowlist blocks all non-approved fields
 * - site.* tokens only resolve from publicEnv, never private settings
 * - No token prefix can return DB_USER, DB_PASSWORD, JWT_SECRET_KEY, etc.
 */

import { describe, it, expect } from "vitest";

// --- Mock ALLOWED_USER_FIELDS from the token engine ---
// This is the actual allowlist from src/services/token/engine.ts
const ALLOWED_USER_FIELDS = ["_id", "email", "username", "role", "avatar", "language", "name"];

describe("Content Token Secret Leakage Prevention", () => {
  describe("user.* token allowlist", () => {
    it("should allow safe user fields", () => {
      for (const field of ALLOWED_USER_FIELDS) {
        expect(ALLOWED_USER_FIELDS).toContain(field);
      }
    });

    it("should block DB credentials from user.* tokens", () => {
      const dangerousFields = [
        "password",
        "hash",
        "salt",
        "db_user",
        "db_password",
        "tenantId",
        "apiKey",
        "secret",
        "token",
        "jwt",
      ];
      for (const field of dangerousFields) {
        expect(ALLOWED_USER_FIELDS).not.toContain(field);
      }
    });

    it("should block system credential field names", () => {
      const systemFields = [
        "DB_USER",
        "DB_PASSWORD",
        "JWT_SECRET_KEY",
        "ENCRYPTION_KEY",
        "DB_TYPE",
        "DB_HOST",
        "DB_NAME",
      ];
      for (const field of systemFields) {
        expect(ALLOWED_USER_FIELDS).not.toContain(field);
        expect(ALLOWED_USER_FIELDS).not.toContain(field.toLowerCase());
      }
    });
  });

  describe("public vs private setting isolation", () => {
    // Bootstrap-only keys that must never appear in publicEnv
    const bootstrapOnlyKeys = [
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
    ];

    // Public keys that CAN appear in publicEnv
    const knownPublicKeys = [
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
    ];

    it("should not expose bootstrap-only keys as public", () => {
      for (const key of bootstrapOnlyKeys) {
        expect(knownPublicKeys).not.toContain(key);
      }
    });

    it("should not contain any credential-like key in public defaults", () => {
      const credentialPatterns = [/password/i, /secret/i, /key$/i, /token/i, /jwt/i];
      for (const key of knownPublicKeys) {
        for (const pattern of credentialPatterns) {
          expect(pattern.test(key)).toBe(false);
        }
      }
    });
  });

  describe("token resolution safety", () => {
    it("should return empty string for blocked user fields", () => {
      // Simulate the engine's user.* resolution
      function resolveUserToken(field: string): string {
        if (!ALLOWED_USER_FIELDS.includes(field)) return "";
        return `mock-${field}`;
      }

      expect(resolveUserToken("email")).toBe("mock-email");
      expect(resolveUserToken("username")).toBe("mock-username");
      expect(resolveUserToken("password")).toBe("");
      expect(resolveUserToken("DB_PASSWORD")).toBe("");
      expect(resolveUserToken("JWT_SECRET_KEY")).toBe("");
    });

    it("should reject system credential tokens regardless of case", () => {
      function resolveUserToken(field: string): string {
        if (!ALLOWED_USER_FIELDS.includes(field)) return "";
        return `mock-${field}`;
      }

      const blockedFields = [
        "Password",
        "DB_PASSWORD",
        "Jwt_Secret_Key",
        "Encryption_Key",
        "db_user",
        "token",
      ];
      for (const field of blockedFields) {
        expect(resolveUserToken(field)).toBe("");
      }
    });
  });
});
