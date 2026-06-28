/**
 * @file tests/unit/hooks/magic-links-authentication.test.ts
 * @description Unit tests for Magic Link authentication (requesting links and verification).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { requestMagicLink } from "@src/routes/login/auth.remote";
import { verifyMagicLink } from "@src/databases/auth/magic-link";
import { auth } from "@src/databases/db";
import { sendMail } from "@utils/email.server";

// Mock environment
vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

// Mock SvelteKit functions
vi.mock("$app/server", () => ({
  command: (_access: string, fn: Function) => fn,
  query: (_access: string, fn: Function) => fn,
  getRequestEvent: () => ({
    request: {
      url: "http://localhost/login",
      headers: new Headers(),
    },
  }),
}));

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  auth: {
    checkUser: vi.fn(),
    createToken: vi.fn(),
    consumeToken: vi.fn(),
    createSession: vi.fn(),
    createSessionCookie: vi.fn(),
    updateUserAttributes: vi.fn().mockResolvedValue({ success: true }),
  },
  dbInitPromise: Promise.resolve(),
  dbAdapter: {
    system: {
      preferences: {
        get: vi.fn().mockResolvedValue({ success: true, data: "localhost" }),
      },
    },
  },
}));

vi.mock("@utils/email.server", () => ({
  sendMail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
  AuditEventType: {
    MAGIC_LINK_REQUESTED: "magic_link_requested",
    MAGIC_LINK_SUCCESS: "magic_link_success",
  },
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: {
    SITE_NAME: "SveltyCMS Test",
    HOST_PROD: "https://test.sveltycms.com",
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSetting: vi.fn().mockResolvedValue("SveltyCMS Test"),
  getUntypedSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@utils/hook-utils", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@utils/server/collection-utils.server", () => ({
  getCachedFirstCollectionPath: vi.fn().mockResolvedValue("/config/collectionbuilder"),
}));

describe("Magic Link Authentication Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Requesting Magic Link", () => {
    it("should successfully generate a magic token and send mail", async () => {
      const mockUser = {
        _id: "user-456",
        email: "test@user.com",
        username: "testuser",
      };
      (auth.checkUser as any).mockResolvedValue(mockUser);
      (auth.createToken as any).mockResolvedValue("test-magic-token-xyz");

      const result = await requestMagicLink({ email: "test@user.com" });

      expect(auth.checkUser).toHaveBeenCalledWith({ email: "test@user.com" });
      expect(auth.createToken).toHaveBeenCalledWith({
        user_id: "user-456",
        expires: expect.any(String),
        type: "magic_link",
      });
      expect(sendMail).toHaveBeenCalledWith({
        recipientEmail: "test@user.com",
        subject: "Sign in to SveltyCMS",
        templateName: "magic-link",
        props: {
          email: "test@user.com",
          magicLink: expect.stringContaining("magic_token=test-magic-token-xyz"),
          expiresInMinutes: 15,
        },
        languageTag: "en",
      });
      expect(result.success).toBe(true);
    });

    it("should fail gracefully when user does not exist", async () => {
      (auth.checkUser as any).mockResolvedValue(null);

      const result = await requestMagicLink({ email: "nonexistent@user.com" });

      expect(auth.createToken).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      expect(result.success).toBe(true); // Matches original behavior (prevents user enumeration)
    });
  });

  describe("Verifying Magic Link via verifyMagicLink", () => {
    it("should login and return redirectPath when token is valid", async () => {
      const mockUser = { _id: "user-456", email: "test@user.com" };
      (auth.checkUser as any).mockResolvedValue(mockUser);
      (auth.consumeToken as any).mockResolvedValue({ status: true });
      (auth.createSession as any).mockResolvedValue({ _id: "sess-123" });
      (auth.createSessionCookie as any).mockReturnValue({
        name: "session_id",
        value: "sess-123",
        attributes: {},
      });

      const cookies = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      };

      const result = await verifyMagicLink({
        token: "test-token",
        email: "test@user.com",
        cookies,
        request: { headers: new Headers() },
        userLanguage: "en",
      });

      expect(result.success).toBe(true);
      expect(result.redirectPath).toBe("/config/collectionbuilder");
      expect(auth.consumeToken).toHaveBeenCalledWith("test-token", "user-456", "magic_link");
      expect(cookies.set).toHaveBeenCalledWith("session_id", "sess-123", expect.any(Object));
    });

    it("should return an error when token validation fails", async () => {
      const mockUser = { _id: "user-456", email: "test@user.com" };
      (auth.checkUser as any).mockResolvedValue(mockUser);
      (auth.consumeToken as any).mockResolvedValue({
        status: false,
        message: "Token expired",
      });

      const cookies = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      };

      const result = await verifyMagicLink({
        token: "invalid-token",
        email: "test@user.com",
        cookies,
        request: { headers: new Headers() },
        userLanguage: "en",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Token expired");
      expect(cookies.set).not.toHaveBeenCalled();
    });
  });
});
