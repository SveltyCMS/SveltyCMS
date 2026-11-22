/**
 * @file tests/unit/auth/password-reset-ordering.test.ts
 * @description Regression tests for password-reset ordering.
 *
 * The reset token must be claimed only after the strength policy accepted the
 * new password, and sessions must be revoked only after the write succeeded.
 * A weak password therefore never spends the link, and a failed write never
 * logs the user out with an unchanged password.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetPW } from "@src/routes/login/auth.remote";
import { auth } from "@src/databases/db";

const EMAIL = "reset@test.de";
const TOKEN = "t".repeat(40);
const STRONG = "ValidPass1!";
const WEAK = "weakpass1!";

vi.mock("$app/environment", () => ({ dev: true, browser: false }));

vi.mock("$app/server", () => ({
  command: (_access: string, fn: Function) => fn,
  query: (_access: string, fn: Function) => fn,
  getRequestEvent: () => ({
    request: { url: "http://localhost/login", headers: new Headers() },
    url: new URL("http://localhost/login"),
    setHeaders: vi.fn(),
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    locals: {},
  }),
}));

vi.mock("@src/databases/db", () => ({
  auth: {
    checkUser: vi.fn(),
    assertPasswordStrength: vi.fn(),
    consumeToken: vi.fn(),
    updateUserPassword: vi.fn(),
    invalidateAllUserSessions: vi.fn(),
    updateUserAttributes: vi.fn(),
  },
  dbInitPromise: Promise.resolve(),
  dbAdapter: {
    system: {
      preferences: {
        get: vi.fn().mockResolvedValue({ success: true, data: null }),
      },
    },
  },
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: vi.fn().mockResolvedValue(undefined) },
  AuditEventType: {
    PASSWORD_RESET_REQUESTED: "password_reset_requested",
    PASSWORD_RESET_SUCCESS: "password_reset_success",
  },
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: { SITE_NAME: "SveltyCMS Test", HOST_PROD: "", PASSWORD_MIN_LENGTH: 8 },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(8),
  getPublicSetting: vi.fn().mockResolvedValue("SveltyCMS Test"),
  getUntypedSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@utils/hook-utils", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  isAdmin: vi.fn().mockReturnValue(false),
}));

vi.mock("@src/hooks/handle-authorization", () => ({
  invalidateUserCountCache: vi.fn(),
}));

vi.mock("@utils/email.server", () => ({
  sendMail: vi.fn().mockResolvedValue({ success: true }),
}));

type ResetResult = { success: boolean; message?: string; code?: string; redirectPath?: string };

const authMocks = auth as unknown as {
  checkUser: ReturnType<typeof vi.fn>;
  assertPasswordStrength: ReturnType<typeof vi.fn>;
  consumeToken: ReturnType<typeof vi.fn>;
  updateUserPassword: ReturnType<typeof vi.fn>;
  invalidateAllUserSessions: ReturnType<typeof vi.fn>;
};

function callReset(password = STRONG): Promise<ResetResult> {
  return resetPW({
    password,
    confirmPassword: password,
    token: TOKEN,
    email: EMAIL,
  }) as Promise<ResetResult>;
}

describe("resetPW — validate → claim → write → revoke", () => {
  beforeEach(() => {
    process.env.TEST_MODE = "true";
    vi.clearAllMocks();

    authMocks.checkUser.mockResolvedValue({ _id: "user-1", email: EMAIL, blocked: false });
    authMocks.assertPasswordStrength.mockImplementation(() => undefined);
    authMocks.consumeToken.mockResolvedValue({ status: true, message: "Consumed" });
    authMocks.updateUserPassword.mockResolvedValue({
      status: true,
      invalidatedSessions: [],
    });
    authMocks.invalidateAllUserSessions.mockResolvedValue([]);
  });

  it("never spends the token when the strength policy rejects the password", async () => {
    authMocks.assertPasswordStrength.mockImplementation(() => {
      throw new Error(
        "Password must contain uppercase, lowercase, numbers, and special characters.",
      );
    });

    const result = await callReset(WEAK);

    expect(result.success).toBe(false);
    expect(result.code).toBe("WEAK_PASSWORD");
    expect(authMocks.consumeToken).not.toHaveBeenCalled();
    expect(authMocks.updateUserPassword).not.toHaveBeenCalled();
    expect(authMocks.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it("never spends the token for a blocked account", async () => {
    authMocks.checkUser.mockResolvedValue({ _id: "user-1", email: EMAIL, blocked: true });

    const result = await callReset();

    expect(result.success).toBe(false);
    expect(result.code).toBe("ACCOUNT_BLOCKED");
    expect(authMocks.assertPasswordStrength).not.toHaveBeenCalled();
    expect(authMocks.consumeToken).not.toHaveBeenCalled();
    expect(authMocks.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it("does not revoke sessions when the password write fails after the claim", async () => {
    authMocks.consumeToken.mockResolvedValue({ status: true, message: "Consumed" });
    authMocks.updateUserPassword.mockResolvedValue({ status: false, message: "write failed" });

    const result = await callReset();

    expect(result.success).toBe(false);
    expect(result.code).toBe("PASSWORD_UPDATE_FAILED");
    expect(authMocks.consumeToken).toHaveBeenCalledTimes(1);
    expect(authMocks.updateUserPassword).toHaveBeenCalledTimes(1);
    expect(authMocks.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it("reports a clear error when the write throws after the claim", async () => {
    authMocks.updateUserPassword.mockRejectedValue(new Error("adapter offline"));

    const result = await callReset();

    expect(result.success).toBe(false);
    expect(result.code).toBe("PASSWORD_UPDATE_FAILED");
    expect(result.message).toMatch(/could not be saved/i);
    expect(authMocks.invalidateAllUserSessions).not.toHaveBeenCalled();
  });

  it("runs validate → claim → write → revoke in that order", async () => {
    const result = await callReset();

    expect(result.success).toBe(true);
    const callOrder = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];
    expect(callOrder(authMocks.assertPasswordStrength)).toBeLessThan(
      callOrder(authMocks.consumeToken),
    );
    expect(callOrder(authMocks.consumeToken)).toBeLessThan(callOrder(authMocks.updateUserPassword));
    expect(callOrder(authMocks.updateUserPassword)).toBeLessThan(
      callOrder(authMocks.invalidateAllUserSessions),
    );
  });
});
