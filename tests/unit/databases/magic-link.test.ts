/**
 * @file tests/unit/databases/magic-link.test.ts
 * @description Unit tests for magic-link service module.
 *
 * Covers successful token creation and user-not-found privacy
 * (always returns sent=true — do not reveal account existence).
 *
 * Mocks are intentionally complete so this file stays green when run in the
 * full databases suite (prevents vi.mock leakage from siblings like
 * cache-service.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/db", () => ({
  auth: {
    checkUser: vi.fn(),
    createToken: vi.fn().mockResolvedValue("magic-token-abc"),
    consumeToken: vi.fn(),
    createSession: vi.fn(),
    createSessionCookie: vi.fn(),
    updateUserAttributes: vi.fn(),
  },
  dbAdapter: {
    system: {
      preferences: {
        get: vi.fn().mockResolvedValue({ success: false, data: null }),
      },
    },
  },
  dbInitPromise: Promise.resolve(),
  getDb: vi.fn(),
  getAuth: vi.fn(),
  isDbConnected: vi.fn().mockReturnValue(true),
}));

// Full settings export surface — incomplete mocks from other files can omit
// getPublicSettingSync and break the publicEnv import chain under full suite.
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => false),
  getPublicSettingSync: vi.fn((key: string) =>
    key === "SITE_NAME" ? "SveltyCMS Test" : undefined,
  ),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
  loadSettingsCache: vi.fn(async () => ({ loaded: true, private: {}, public: {} })),
  invalidateSettingsCache: vi.fn(async () => {}),
  isCacheLoaded: vi.fn(() => true),
  getAllSettings: vi.fn(async () => ({ public: {}, private: {} })),
}));

vi.mock("@utils/email.server", () => ({
  sendMail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@src/services/security/audit-service", () => ({
  auditLogService: { log: vi.fn().mockResolvedValue(true) },
  AuditEventType: { MAGIC_LINK_REQUESTED: "magic_link_requested" },
}));

describe("magic-link service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMagicLinkForEmail should create token when user exists", async () => {
    const { auth } = await import("@src/databases/db");
    (auth.checkUser as any).mockResolvedValue({
      _id: "u1",
      email: "user@test.com",
    });

    const { sendMagicLinkForEmail } = await import("@src/databases/auth/magic-link");
    const event = {
      request: { url: "http://localhost:5173/login" },
    } as any;

    const result = await sendMagicLinkForEmail(event, "user@test.com");
    expect(result.sent).toBe(true);
    expect(auth.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", type: "magic_link" }),
    );
  });

  it("returns sent=true even when user not found (don't reveal existence)", async () => {
    const { auth } = await import("@src/databases/db");
    (auth.checkUser as any).mockResolvedValue(null);

    const { sendMagicLinkForEmail } = await import("@src/databases/auth/magic-link");
    const event = {
      request: { url: "http://localhost:5173/login" },
    } as any;

    const result = await sendMagicLinkForEmail(event, "unknown@test.com");
    expect(result.sent).toBe(true);
    expect(auth.createToken).not.toHaveBeenCalled();
  });
});
