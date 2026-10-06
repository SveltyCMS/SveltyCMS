/**
 * @file tests/unit/services/audit-service-redaction.test.ts
 * @description Unit tests for AuditService sensitive credential redaction and cryptographic chaining.
 *
 * Features:
 * - Recursive redaction of sensitive credentials (passwords, secrets, tokens, api keys)
 * - Preservation of non-sensitive attributes in audit details
 * - Handling of deeply nested objects and boundary conditions
 * - Verification of SHA-256 hash chaining on logged entries
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@src/services/security/audit-service");
import {
  AuditService,
  AuditEventType,
  redactSensitiveDetails,
} from "@src/services/security/audit-service";
import type { DatabaseId } from "@src/databases/db-interface";

describe("AuditService sensitive redaction and integrity", () => {
  describe("redactSensitiveDetails", () => {
    it("redacts top-level sensitive fields matching regex patterns", () => {
      const input = {
        username: "johndoe",
        password: "super-secret-password",
        api_key: "ak_live_123456789",
        accessToken: "jwt.token.here",
        client_secret: "shhh",
        authorization: "Bearer xyz",
        credential: "cred_val",
        safeNote: "Hello World",
      };

      const redacted = redactSensitiveDetails(input);

      expect(redacted.username).toBe("johndoe");
      expect(redacted.safeNote).toBe("Hello World");
      expect(redacted.password).toBe("[REDACTED]");
      expect(redacted.api_key).toBe("[REDACTED]");
      expect(redacted.accessToken).toBe("[REDACTED]");
      expect(redacted.client_secret).toBe("[REDACTED]");
      expect(redacted.authorization).toBe("[REDACTED]");
      expect(redacted.credential).toBe("[REDACTED]");
    });

    it("recursively redacts nested sensitive fields inside child objects", () => {
      const input = {
        request: {
          headers: {
            authorization: "Bearer secret-token",
            contentType: "application/json",
          },
          body: {
            user: {
              email: "test@example.com",
              newPassword: "new-password-123",
            },
          },
        },
      };

      const redacted = redactSensitiveDetails(input) as {
        request: {
          headers: { authorization: string; contentType: string };
          body: { user: { email: string; newPassword: string } };
        };
      };

      expect(redacted.request.headers.authorization).toBe("[REDACTED]");
      expect(redacted.request.headers.contentType).toBe("application/json");
      expect(redacted.request.body.user.email).toBe("test@example.com");
      expect(redacted.request.body.user.newPassword).toBe("[REDACTED]");
    });

    it("handles null, undefined, or empty objects gracefully", () => {
      expect(redactSensitiveDetails({} as Record<string, unknown>)).toEqual({});
      expect(redactSensitiveDetails(null as unknown as Record<string, unknown>)).toBeNull();
    });
  });

  describe("AuditService.log cryptographic chain and entry redaction", () => {
    let service: AuditService;

    beforeEach(() => {
      vi.useFakeTimers();
      service = new AuditService();
    });

    afterEach(async () => {
      await service.flush().catch(() => {});
      vi.useRealTimers();
    });

    it("automatically redacts details and establishes SHA-256 hash chaining", async () => {
      // Mock flush so entries remain in buffer for inspection
      vi.spyOn(service, "flush").mockResolvedValue();

      await service.log(
        "auth.login",
        { id: "u1" as DatabaseId, email: "u1@example.com", role: "admin" },
        { id: "session1" as DatabaseId, type: "session" },
        AuditEventType.USER_LOGIN,
        "low",
        { password: "plain_password_attempt", browser: "Chrome" },
        "tenant_1" as DatabaseId,
        "success",
      );

      await service.log(
        "user.update",
        { id: "u1" as DatabaseId, email: "u1@example.com", role: "admin" },
        { id: "u2" as DatabaseId, type: "user" },
        AuditEventType.USER_UPDATED,
        "medium",
        { apiKey: "secret_api_key_value", role: "editor" },
        "tenant_1" as DatabaseId,
        "success",
      );

      const buffer = (service as unknown as { buffer: Array<Record<string, unknown>> }).buffer;
      expect(buffer).toHaveLength(2);

      const entry1 = buffer[0];
      const entry2 = buffer[1];

      // Redaction checks
      expect(entry1.details).toEqual({
        password: "[REDACTED]",
        browser: "Chrome",
      });
      expect(entry2.details).toEqual({
        apiKey: "[REDACTED]",
        role: "editor",
      });

      // SHA-256 format checks
      expect(entry1.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry2.hash).toMatch(/^[0-9a-f]{64}$/);

      // Chaining check: entry2's previousHash must equal entry1's hash
      expect(entry2.previousHash).toBe(entry1.hash);
    });
  });
});
