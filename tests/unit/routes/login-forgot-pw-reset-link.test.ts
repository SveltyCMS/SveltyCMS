/**
 * @file tests/unit/routes/login-forgot-pw-reset-link.test.ts
 * @description Regression guard for audit 2026-10-31 (blocker B1): an anonymous visitor must not
 * receive a password-reset link, and no `password_reset` token may be minted, when the instance has
 * no email provider — unless the deployment explicitly opts in outside production.
 *
 * Drives the real remote command (`forgotPW`), so the assertions cover the actual payload and the
 * actual token-creation call, not a copy of the decision logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { forgotPW } from "@src/routes/login/auth.remote";
import { auth } from "@src/databases/db";
import { sendMail } from "@utils/email.server";

const FLAG = "ALLOW_PASSWORD_RESET_LINK_IN_RESPONSE";
const EMAIL = "reset@test.de";

// ─── SvelteKit surface ───────────────────────────────────────────────────────
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

// ─── Dependencies ────────────────────────────────────────────────────────────
vi.mock("@src/databases/db", () => ({
  auth: {
    checkUser: vi.fn(),
    createToken: vi.fn(),
    consumeToken: vi.fn(),
    createSession: vi.fn(),
    createSessionCookie: vi.fn(),
    updateUserAttributes: vi.fn(),
    updateUserPassword: vi.fn(),
    invalidateAllUserSessions: vi.fn(),
  },
  dbInitPromise: Promise.resolve(),
  // No SMTP host configured → the "no email provider" branch under test.
  dbAdapter: {
    system: {
      preferences: {
        get: vi.fn().mockResolvedValue({ success: true, data: null }),
      },
    },
  },
  getDb: vi.fn(),
  getDbInitPromise: vi.fn().mockResolvedValue(null),
  isDbConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@utils/email.server", () => ({
  sendMail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: vi.fn().mockResolvedValue(undefined) },
  AuditEventType: {
    PASSWORD_RESET_REQUESTED: "password_reset_requested",
    PASSWORD_RESET_SUCCESS: "password_reset_success",
    MAGIC_LINK_REQUESTED: "magic_link_requested",
    MAGIC_LINK_SUCCESS: "magic_link_success",
  },
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: { SITE_NAME: "SveltyCMS Test", HOST_PROD: "https://test.sveltycms.com" },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSetting: vi.fn().mockResolvedValue("SveltyCMS Test"),
  getUntypedSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@utils/hook-utils", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  isAdmin: vi.fn().mockReturnValue(false),
}));

vi.mock("@utils/server/collection-utils.server", () => ({
  getCachedFirstCollectionPath: vi.fn().mockResolvedValue("/config/collectionbuilder"),
}));

describe("forgotPW — reset link exposure (B1)", () => {
  let prevAllow: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(() => {
    prevAllow = process.env[FLAG];
    prevNodeEnv = process.env.NODE_ENV;
    delete process.env[FLAG];
    // Non-production service (the local/E2E case) with the rate limiter out of the way.
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";

    vi.clearAllMocks();
    (auth.checkUser as any).mockResolvedValue({ _id: "user-1", email: EMAIL, username: "reset" });
    (auth.createToken as any).mockResolvedValue("token-abc");
  });

  afterEach(() => {
    if (prevAllow === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prevAllow;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("mints no token and returns no reset link by default (flag unset)", async () => {
    const result: any = await forgotPW({ email: EMAIL });

    // (b) the token creation path was never entered
    expect(auth.createToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    // (a) the payload carries no link — present-but-undefined at most
    expect(result.resetLink).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("token=");
    expect(result.smtpConfigured).toBe(false);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/no email provider is configured/i);
  });

  it("mints no token and returns no reset link when the flag is set to something else", async () => {
    process.env[FLAG] = "yes";

    const result: any = await forgotPW({ email: EMAIL });

    expect(auth.createToken).not.toHaveBeenCalled();
    expect(result.resetLink).toBeUndefined();
  });

  it("mints the token and returns the reset link when opted in outside production", async () => {
    process.env[FLAG] = "true";

    const result: any = await forgotPW({ email: EMAIL });

    expect(auth.createToken).toHaveBeenCalledWith({
      user_id: "user-1",
      expires: expect.any(String),
      type: "password_reset",
    });
    expect(result.resetLink).toContain("https://test.sveltycms.com/login?token=token-abc");
    expect(result.resetLink).toContain(`email=${encodeURIComponent(EMAIL)}`);
    expect(result.message).toMatch(/use the link below/i);
  });

  it("keeps the link off in production even with the flag set", async () => {
    process.env[FLAG] = "true";
    process.env.NODE_ENV = "production";

    const result: any = await forgotPW({ email: EMAIL });

    expect(auth.createToken).not.toHaveBeenCalled();
    expect(result.resetLink).toBeUndefined();
  });

  it("reads the flag at call time, so toggling it between calls takes effect", async () => {
    // Same imported module instance for both calls: a module-scope constant could not flip here.
    const denied: any = await forgotPW({ email: EMAIL });
    expect(denied.resetLink).toBeUndefined();
    expect(auth.createToken).not.toHaveBeenCalled();

    process.env[FLAG] = "true";
    const allowed: any = await forgotPW({ email: EMAIL });
    expect(auth.createToken).toHaveBeenCalledTimes(1);
    expect(allowed.resetLink).toContain("token=token-abc");

    delete process.env[FLAG];
    (auth.createToken as any).mockClear();
    const deniedAgain: any = await forgotPW({ email: EMAIL });
    expect(auth.createToken).not.toHaveBeenCalled();
    expect(deniedAgain.resetLink).toBeUndefined();
  });

  it("mints no token for an unknown address even with the flag on (no enumeration)", async () => {
    process.env[FLAG] = "true";
    (auth.checkUser as any).mockResolvedValue(null);

    const result: any = await forgotPW({ email: "nobody@test.de" });

    expect(auth.createToken).not.toHaveBeenCalled();
    expect(result.resetLink).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("answers with the same shape for a known and an unknown address (no user leak)", async () => {
    // Production default: flag unset. An attacker compares the two answers, so the key
    // set AND the values must be identical - not just "no token here".
    delete process.env[FLAG];
    (auth.checkUser as any)
      .mockResolvedValueOnce({ _id: "user-1", email: EMAIL })
      .mockResolvedValueOnce(null);

    const known: any = await forgotPW({ email: EMAIL });
    const unknown: any = await forgotPW({ email: "nobody@test.de" });

    expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
    expect(known).toEqual(unknown);
    expect(known.resetLink).toBeUndefined();
    expect(unknown.resetLink).toBeUndefined();
    // And no token was minted for either address.
    expect(auth.createToken).not.toHaveBeenCalled();
  });
});
