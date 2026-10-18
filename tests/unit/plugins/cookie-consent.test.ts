/**
 * @file tests/unit/plugins/cookie-consent.test.ts
 * @description Unit tests for Cookie Consent Manager plugin and server consent logging API.
 *
 * Exercises the server-side audit logging function `handleConsentLog`:
 * insertion into `sys_consent_audit`, allowedOrigins validation, and public route registration.
 *
 * ### Features:
 * - logs valid consent decision to sys_consent_audit table
 * - validates allowedOrigins when configured
 * - rejects disallowed origins without writing to the database
 * - exposes public POST /api/plugins/cookie-consent/consent route in plugin parts
 */

import { describe, expect, it, vi } from "vitest";
import { handleConsentLog } from "@src/plugins/cookie-consent/api.server";
import { parts } from "@src/plugins/cookie-consent/index.server";
import type { IDBAdapter } from "@src/databases/db-interface";

describe("Cookie Consent Manager Plugin", () => {
  it("registers public POST /api/plugins/cookie-consent/consent route in plugin parts", () => {
    const routePart = parts.find((p) => p.type === "route");
    expect(routePart).toBeDefined();

    if (routePart && routePart.type === "route") {
      const consentRoute = routePart.routes.find(
        (r) => r.path === "/api/plugins/cookie-consent/consent",
      );
      expect(consentRoute).toBeDefined();
      expect(consentRoute?.method).toBe("POST");
      expect(consentRoute?.requiredCapabilities).toBe("public");
    }
  });

  it("logs consent decision to sys_consent_audit collection", async () => {
    const insertMock = vi.fn().mockResolvedValue({ success: true, id: "audit_1" });
    const mockDb = {
      crud: {
        insert: insertMock,
      },
    } as unknown as IDBAdapter;

    const payload = {
      consentId: "test-consent-uuid",
      categories: { necessary: true, analytics: true, marketing: false },
      acceptedAt: "2026-10-18T12:00:00.000Z",
      userAgent: "Mozilla/5.0 TestBrowser",
      origin: "https://example.com",
    };

    const result = await handleConsentLog(mockDb, payload, "tenant-1");
    expect(result.success).toBe(true);
    expect(result.message).toContain("successfully");

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      "sys_consent_audit",
      expect.objectContaining({
        consentId: "test-consent-uuid",
        categories: { necessary: true, analytics: true, marketing: false },
        acceptedAt: "2026-10-18T12:00:00.000Z",
        userAgent: "Mozilla/5.0 TestBrowser",
        origin: "https://example.com",
        tenantId: "tenant-1",
      }),
    );
  });

  it("allows consent log when origin matches allowedOrigins", async () => {
    const insertMock = vi.fn().mockResolvedValue({ success: true, id: "audit_2" });
    const mockDb = {
      crud: {
        insert: insertMock,
      },
    } as unknown as IDBAdapter;

    const payload = {
      consentId: "allowed-consent-uuid",
      categories: { necessary: true, analytics: false, marketing: false },
      acceptedAt: "2026-10-18T12:00:00.000Z",
      origin: "https://frontend.example.com",
    };

    const allowedOrigins = ["https://frontend.example.com", "https://staging.example.com"];
    const result = await handleConsentLog(mockDb, payload, "tenant-1", allowedOrigins);

    expect(result.success).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("rejects consent log when origin is not in allowedOrigins", async () => {
    const insertMock = vi.fn();
    const mockDb = {
      crud: {
        insert: insertMock,
      },
    } as unknown as IDBAdapter;

    const payload = {
      consentId: "blocked-consent-uuid",
      categories: { necessary: true, analytics: true, marketing: true },
      acceptedAt: "2026-10-18T12:00:00.000Z",
      origin: "https://malicious-site.com",
    };

    const allowedOrigins = ["https://trusted.example.com"];
    const result = await handleConsentLog(mockDb, payload, "tenant-1", allowedOrigins);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Origin not allowed");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("handles db insertion failure gracefully", async () => {
    const insertMock = vi.fn().mockRejectedValue(new Error("Database write error"));
    const mockDb = {
      crud: {
        insert: insertMock,
      },
    } as unknown as IDBAdapter;

    const payload = {
      consentId: "error-consent-uuid",
      categories: { necessary: true, analytics: true, marketing: false },
      acceptedAt: "2026-10-18T12:00:00.000Z",
    };

    const result = await handleConsentLog(mockDb, payload, "tenant-1");
    expect(result.success).toBe(false);
    expect(result.message).toBe("Database write error");
  });
});
