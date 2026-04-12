/**
 * @file tests/unit/api/auth-2fa.test.ts
 * @description Whitebox unit tests for 2FA Authentication API endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequestEvent } from "../utils/mock-event";

const { mockDbAdapter } = vi.hoisted(() => ({
  mockDbAdapter: {
    auth: {
      authInterface: {},
      validateSession: vi.fn(),
      getUserById: vi.fn(),
      updateUserAttributes: vi.fn().mockResolvedValue({ success: true }),
      createSessionCookie: vi
        .fn()
        .mockReturnValue({ name: "session", value: "val", attributes: {} }),
      login: vi.fn(),
    },
    collections: {
      list: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      search: vi.fn(),
    },
    media: {
      find: vi.fn(),
      findById: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
    },
    widgets: {
      list: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    },
    system: {
      getHealth: vi.fn(),
      reinitialize: vi.fn(),
    },
    crud: {
      findMany: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock all dependencies
vi.mock("@src/databases/db", () => {
  return {
    dbAdapter: mockDbAdapter,
    auth: mockDbAdapter.auth,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getAuth: vi.fn().mockReturnValue(mockDbAdapter.auth),
  };
});

const { mockTwoFactorAuthService } = vi.hoisted(() => ({
  mockTwoFactorAuthService: {
    verify2FA: vi.fn(),
    initiate2FASetup: vi.fn(),
    complete2FASetup: vi.fn(),
    disable2FA: vi.fn(),
    get2FAStatus: vi.fn(),
    regenerateBackupCodes: vi.fn(),
  },
}));

vi.mock("@src/databases/auth/two-factor-auth", () => ({
  getDefaultTwoFactorAuthService: vi.fn().mockReturnValue(mockTwoFactorAuthService),
  TwoFactorAuthService: vi.fn().mockImplementation(function () {
    return mockTwoFactorAuthService;
  }),
}));

vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(undefined),
}));

vi.mock("@utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

vi.mock("@src/databases/auth", () => ({
  verifyPassword: vi.fn().mockResolvedValue(true),
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  getAllPermissions: vi.fn().mockReturnValue([]),
  checkPermissions: vi.fn().mockReturnValue(true),
  validateUserPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/password", () => ({
  verifyPassword: vi.fn().mockResolvedValue(true),
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));

// Removed unused auth import
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

const POST_SETUP = (event: any) => dispatcher(event);
const POST_VERIFY_SETUP = (event: any) => dispatcher(event);
const POST_VERIFY = (event: any) => dispatcher(event);
const POST_DISABLE = (event: any) => dispatcher(event);
const GET_BACKUP_CODES = (event: any) => dispatcher(event);
const POST_BACKUP_CODES = (event: any) => dispatcher(event);

// Helper to create mock event
const createMockEvent = (
  body: any = {},
  user: any = null,
  tenantId: string | undefined = "t1",
  action: string = "verify",
  options: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    method?: string;
  } = {},
) => {
  const method =
    options.method ||
    (action === "backup-codes" && Object.keys(body).length === 0 ? "GET" : "POST");
  return {
    ...createMockRequestEvent({
      method,
      url: `http://localhost/api/auth/2fa/${action}`,
      body,
      user,
      tenantId,
      dbAdapter: mockDbAdapter,
      headers: options.headers,
      cookies: options.cookies,
    }),
    params: { path: `auth/2fa/${action}` },
  };
};

describe("2FA API Unit Tests", () => {
  let mockTwoFactorService: any;
  let mockGetPrivateSettingSync: any;
  let mockVerifyPassword: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { getDefaultTwoFactorAuthService } = await import("@src/databases/auth/two-factor-auth");
    mockTwoFactorService = getDefaultTwoFactorAuthService({} as any);

    const { getPrivateSettingSync } = await import("@src/services/settings-service");
    mockGetPrivateSettingSync = getPrivateSettingSync;
    mockGetPrivateSettingSync.mockReturnValue(false);

    const { verifyPassword } = await import("@src/databases/auth");
    mockVerifyPassword = verifyPassword;
  });

  describe("POST /api/auth/2fa/verify", () => {
    it("should verify TOTP code successfully", async () => {
      mockTwoFactorService.verify2FA.mockResolvedValue({
        success: true,
        user: { _id: "user-1" },
      });

      const event = createMockEvent(
        { userId: "user-1", code: "123456" },
        { _id: "user-1", is2FAEnabled: true },
        undefined,
        "verify",
        {
          headers: { "X-CSRF-Token": "mock-csrf-token" },
          cookies: { csrf_token: "mock-csrf-token" },
        },
      );
      const response = await POST_VERIFY(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
      expect(mockTwoFactorService.verify2FA).toHaveBeenCalledWith("user-1", "123456", "t1");
    });

    it("should verify backup code successfully", async () => {
      mockTwoFactorService.verify2FA.mockResolvedValue({
        success: true,
        user: { _id: "user-1" },
      });

      const event = createMockEvent(
        { userId: "user-1", code: "backup-123" },
        { _id: "user-1", is2FAEnabled: true },
        undefined,
        "verify",
        {
          headers: { "X-CSRF-Token": "mock-csrf-token" },
          cookies: { csrf_token: "mock-csrf-token" },
        },
      );
      const response = await POST_VERIFY(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
    });

    it("should return success: false for invalid code", async () => {
      mockTwoFactorService.verify2FA.mockResolvedValue({
        success: false,
        message: "Invalid code",
      });

      const event = createMockEvent(
        { userId: "user-1", code: "000000" },
        { _id: "user-1", is2FAEnabled: true },
        undefined,
        "verify",
        {
          headers: { "X-CSRF-Token": "mock-csrf-token" },
          cookies: { csrf_token: "mock-csrf-token" },
        },
      );
      await expect(POST_VERIFY(event)).rejects.toThrow("Invalid code");
    });

    it("should throw TENANT_REQUIRED in multi-tenant mode without tenant context", async () => {
      mockGetPrivateSettingSync.mockReturnValue(true);

      const event = createMockEvent(
        { userId: "user-1", code: "123456" },
        { _id: "user-1" },
        undefined,
        "verify",
        {
          headers: { "X-CSRF-Token": "mock-csrf-token" },
          cookies: { csrf_token: "mock-csrf-token" },
        },
      );

      // Override tenantId for this specific test to be undefined
      (event.locals as any).tenantId = undefined;

      await expect(POST_VERIFY(event)).rejects.toThrow("Tenant ID required");
    });

    it("should use locals.tenantId in multi-tenant mode", async () => {
      mockGetPrivateSettingSync.mockReturnValue(true);
      mockTwoFactorService.verify2FA.mockResolvedValue({ success: true });

      const event = createMockEvent(
        { userId: "user-1", code: "123456" },
        { _id: "user-1" },
        "tenant-1",
        "verify",
        {
          headers: { "X-CSRF-Token": "mock-csrf-token" },
          cookies: { csrf_token: "mock-csrf-token" },
        },
      );
      await POST_VERIFY(event);

      expect(mockTwoFactorService.verify2FA).toHaveBeenCalledWith("user-1", "123456", "tenant-1");
    });
  });

  describe("POST /api/auth/2fa/setup", () => {
    it("should initiate setup for authenticated user", async () => {
      const user = { _id: "user-1", email: "test@example.com" };
      mockTwoFactorService.initiate2FASetup.mockResolvedValue({
        success: true,
        qrCode: "qr-data",
        secret: "secret",
      });

      const event = createMockEvent({}, user, undefined, "setup", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      const response = await POST_SETUP(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
      expect(result.data.secret).toBe("secret");
    });

    it("should throw UNAUTHORIZED for unauthenticated user", async () => {
      const event = createMockEvent({}, null, "t1", "setup");
      await expect(POST_SETUP(event)).rejects.toThrow("Authentication required");
    });

    it("should return success: false if user already has 2FA enabled during setup", async () => {
      const user = { _id: "user-1", is2FAEnabled: true };
      mockTwoFactorService.initiate2FASetup.mockResolvedValue({
        success: false,
        message: "2FA is already enabled",
      });
      const event = createMockEvent({}, user, undefined, "setup", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      const response = await POST_SETUP(event);
      const result = await response!.json();
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(false);
    });
  });

  describe("POST /api/auth/2fa/verify-setup", () => {
    it("should complete setup with valid code", async () => {
      const user = { _id: "user-1" };
      mockTwoFactorService.complete2FASetup.mockResolvedValue(true);

      const event = createMockEvent({ code: "123456" }, user, undefined, "verify-setup", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      const response = await POST_VERIFY_SETUP(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
    });

    it("should return success: false for wrong code", async () => {
      const user = { _id: "user-1" };
      mockTwoFactorService.complete2FASetup.mockResolvedValue(false);

      const event = createMockEvent({ code: "000000" }, user, undefined, "verify-setup", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      await expect(POST_VERIFY_SETUP(event)).rejects.toThrow("Invalid verification code");
    });
  });

  describe("POST /api/auth/2fa/disable", () => {
    it("should disable 2FA for enabled user", async () => {
      const user = {
        _id: "user-1",
        is2FAEnabled: true,
        password: "hashed_password",
      };
      mockVerifyPassword.mockResolvedValue(true);
      mockTwoFactorService.disable2FA.mockResolvedValue(true);

      const event = createMockEvent({ password: "correct_password" }, user, undefined, "disable", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      const response = await POST_DISABLE(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
    });

    it("should return success: false if disable fails", async () => {
      const user = {
        _id: "user-1",
        password: "hashed_password",
      };
      mockVerifyPassword.mockResolvedValue(true);
      mockTwoFactorService.disable2FA.mockResolvedValue(false);

      const event = createMockEvent({ password: "correct_password" }, user, undefined, "disable", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      await expect(POST_DISABLE(event)).rejects.toThrow("Failed to disable 2FA");
    });
  });

  describe("Backup Codes Management", () => {
    it("should return 2FA status (GET)", async () => {
      const user = { _id: "user-1" };
      mockTwoFactorService.get2FAStatus.mockResolvedValue({
        enabled: true,
        backupCodesRemaining: 5,
      });

      const event = createMockEvent({}, user, undefined, "backup-codes", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
      });
      const response = await GET_BACKUP_CODES(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(true);
    });

    it("should regenerate backup codes (POST)", async () => {
      const user = { _id: "user-1" };
      mockTwoFactorService.regenerateBackupCodes.mockResolvedValue(["n1", "n2"]);

      const event = createMockEvent({}, user, undefined, "backup-codes", {
        headers: { "X-CSRF-Token": "mock-csrf-token" },
        cookies: { csrf_token: "mock-csrf-token" },
        method: "POST",
      });
      const response = await POST_BACKUP_CODES(event);
      const result = await response!.json();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(["n1", "n2"]);
    });
  });
});
