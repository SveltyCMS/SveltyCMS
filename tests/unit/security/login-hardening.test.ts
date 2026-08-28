/**
 * @file tests/unit/security/login-hardening.test.ts
 * @description Regression tests for the 2026 pen-test hardening batch:
 *
 * - Critical #1: passwordless API login (email-only body) must be rejected.
 * - High #2: verify2FA requires a signed pending-2FA token (no token, wrong
 *   user, tampered or expired token ⇒ rejected).
 * - High #5: GraphQL `users` / `media` resolvers enforce REST-parity RBAC
 *   (`user:read` / `media:read`) instead of any-logged-in-user.
 *
 * Uses the real Auth class + in-memory adapter (mirrors auth-lockout.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { AuthNamespace } from "@src/services/sdk/namespaces/auth-namespace";
import { hashPassword } from "@utils/security/crypto";
import {
  signPending2faToken,
  verifyPending2faToken,
  PENDING_2FA_TTL_MS,
} from "@src/utils/server/pending-2fa-token.server";
import type { User } from "@src/databases/auth/types";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "MULTI_TENANT") return false;
    if (key === "SESSION_TTL_HOURS") return 24;
    if (key === "SESSION_DEVICE_POLICY") return null;
    if (key === "JWT_SECRET_KEY") return "test-jwt-secret";
    return null;
  }),
  getPublicSettingSync: vi.fn(() => undefined),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

// AuthNamespace imports invalidateRolesCache (heavy hooks graph) — stub the boundary.
vi.mock("@src/hooks/handle-authorization", () => ({
  invalidateRolesCache: vi.fn(),
}));

// Production parity: Vitest sets isAutomatedTestHarness()=true by default, but the
// 2FA session-skip path only activates outside the harness.
vi.mock("@utils/private-config-policy", () => ({
  isAutomatedTestHarness: () => false,
}));

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
}));

interface AuthNsHarness {
  ns: AuthNamespace;
  createSession: ReturnType<typeof vi.fn>;
  updateUserAttributes: ReturnType<typeof vi.fn>;
}

/** In-memory adapter wrapped in AuthNamespace (the API login path). */
function createAuthNsHarness(
  userSeed: Partial<User> & { password: string; email: string },
): AuthNsHarness {
  const users = new Map<string, User>();
  const user: User = {
    _id: (userSeed._id as any) || "user-1",
    email: userSeed.email,
    role: (userSeed.role as any) || "admin",
    password: userSeed.password,
    failedAttempts: userSeed.failedAttempts ?? 0,
    lockoutUntil: userSeed.lockoutUntil ?? null,
    blocked: userSeed.blocked ?? false,
    is2FAEnabled: userSeed.is2FAEnabled ?? false,
    tenantId: "global" as any,
  } as User;
  users.set(String(user._id), user);
  users.set(user.email.toLowerCase(), user);

  const updateUserAttributes = vi.fn(async (id: string, attrs: Partial<User>) => {
    const existing = users.get(String(id));
    if (!existing) return { success: false };
    Object.assign(existing, attrs);
    users.set(existing.email.toLowerCase(), existing);
    return { success: true, data: true };
  });

  const createSession = vi.fn(async (sessionData: any) => ({
    success: true,
    data: {
      _id: "sess-1",
      user_id: sessionData.user_id,
      expires: sessionData.expires,
      tenantId: sessionData.tenantId ?? null,
    },
  }));

  const dbAdapter = {
    auth: {
      getUserByEmail: vi.fn(async ({ email }: { email: string }) => {
        const found = users.get(String(email).trim().toLowerCase()) ?? null;
        return { success: true, data: found };
      }),
      getUserById: vi.fn(async (id: string) => {
        const found = users.get(String(id)) ?? null;
        return { success: true, data: found };
      }),
      updateUserAttributes,
      createSession,
      getActiveSessions: vi.fn(async () => ({ success: true, data: [] })),
      deleteSession: vi.fn(async () => ({ success: true })),
      createUser: vi.fn(async (data: Partial<User>) => ({
        success: true,
        data: { _id: "new-user", ...data },
      })),
    },
  } as any;

  const ns = new AuthNamespace(dbAdapter);
  return { ns, createSession, updateUserAttributes };
}

describe("AuthNamespace.login — password requirement (Critical #1 regression)", () => {
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await hashPassword("ValidPass1!");
  });

  it("rejects a passwordless login (email-only body) without creating a session", async () => {
    const { ns, createSession } = createAuthNsHarness({
      email: "pwless@test.com",
      password: passwordHash,
    });

    const result = await ns.login({ email: "pwless@test.com" }, {});

    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid credentials");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an empty-string password", async () => {
    const { ns, createSession } = createAuthNsHarness({
      email: "empty-pw@test.com",
      password: passwordHash,
    });

    const result = await ns.login({ email: "empty-pw@test.com", password: "" }, {});

    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid credentials");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a blocked user even with a valid password", async () => {
    const { ns, createSession } = createAuthNsHarness({
      email: "blocked@test.com",
      password: passwordHash,
      blocked: true,
    });

    const result = await ns.login({ email: "blocked@test.com", password: "ValidPass1!" }, {});

    expect(result.success).toBe(false);
    expect(result.message).toBe("Account suspended or incomplete");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("accepts a valid password and mints a session (sanity that the gate is narrow)", async () => {
    const { ns, createSession } = createAuthNsHarness({
      email: "ok@test.com",
      password: passwordHash,
    });

    const result = await ns.login({ email: "ok@test.com", password: "ValidPass1!" }, {});

    expect(result.success).toBe(true);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("mints NO session for 2FA-enabled accounts (API 2FA flow completes the login)", async () => {
    const { ns, createSession } = createAuthNsHarness({
      email: "twofa@test.com",
      password: passwordHash,
      is2FAEnabled: true,
    });

    const result = await ns.login({ email: "twofa@test.com", password: "ValidPass1!" }, {});

    expect(result.success).toBe(true);
    const data = result.data as { user: User; session: any };
    expect(data.user.is2FAEnabled).toBe(true);
    expect(data.session).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("pending-2FA token — verify2FA gate (High #2 regression)", () => {
  it("round-trips a freshly signed token for the same user", () => {
    const token = signPending2faToken("usr_123");
    expect(verifyPending2faToken(token, "usr_123")).toBe(true);
  });

  it("rejects a token presented for a different user", () => {
    const token = signPending2faToken("usr_123");
    expect(verifyPending2faToken(token, "usr_456")).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signPending2faToken("usr_123");
    expect(verifyPending2faToken(`${token}x`, "usr_123")).toBe(false);
    expect(verifyPending2faToken(`${token.slice(0, -1)}`, "usr_123")).toBe(false);
  });

  it("rejects missing / malformed tokens", () => {
    expect(verifyPending2faToken(undefined, "usr_123")).toBe(false);
    expect(verifyPending2faToken(null, "usr_123")).toBe(false);
    expect(verifyPending2faToken("", "usr_123")).toBe(false);
    expect(verifyPending2faToken("not-a-token", "usr_123")).toBe(false);
  });

  it("rejects an expired token", () => {
    const exp = Date.now() - 1000;
    const sig = createHmac("sha256", "test-jwt-secret")
      .update(`pending2fa:usr_123:${exp}`)
      .digest("base64url");
    expect(verifyPending2faToken(`${exp}:${sig}`, "usr_123")).toBe(false);
  });

  it("rejects a token that claims a lifetime beyond the TTL", () => {
    const exp = Date.now() + PENDING_2FA_TTL_MS + 60_000;
    const sig = createHmac("sha256", "test-jwt-secret")
      .update(`pending2fa:usr_123:${exp}`)
      .digest("base64url");
    expect(verifyPending2faToken(`${exp}:${sig}`, "usr_123")).toBe(false);
  });
});

describe("GraphQL RBAC parity with REST (High #5 regression)", () => {
  it("blocks the users resolver for a logged-in user without user:read", async () => {
    const { userResolvers } = await import("@src/routes/api/graphql/resolvers/users");
    const resolver = userResolvers({ auth: { getAllUsers: vi.fn() } } as any).users;

    const editor = {
      _id: "gql-editor-no-read",
      email: "editor@test.com",
      role: "editor",
      permissions: [],
    } as User;

    await expect(
      resolver(undefined, { pagination: { page: 1, limit: 10 } }, { user: editor }),
    ).rejects.toThrow("Forbidden: insufficient permissions");
  });

  it("allows the users resolver for an admin (user:read granted)", async () => {
    const { userResolvers } = await import("@src/routes/api/graphql/resolvers/users");
    const getAllUsers = vi.fn(async () => ({ success: true, data: [] }));
    const resolver = userResolvers({ auth: { getAllUsers } } as any).users;

    const admin = {
      _id: "gql-admin-read",
      email: "admin@test.com",
      role: "admin",
      permissions: [],
    } as User;

    await resolver(undefined, { pagination: { page: 1, limit: 10 } }, { user: admin });
    expect(getAllUsers).toHaveBeenCalledTimes(1);
  });

  it("blocks the media resolver for a logged-in user without media:read", async () => {
    const { mediaResolvers } = await import("@src/routes/api/graphql/resolvers/media");
    const resolver = mediaResolvers({ crud: { findMany: vi.fn() } } as any).mediaImages;

    const editor = {
      _id: "gql-editor-no-media",
      email: "editor2@test.com",
      role: "editor",
      permissions: [],
    } as User;

    await expect(
      resolver(undefined, { pagination: { page: 1, limit: 50 } }, { user: editor }),
    ).rejects.toThrow("Forbidden: insufficient permissions");
  });

  it("allows the media resolver for an admin (media:read granted)", async () => {
    const { mediaResolvers } = await import("@src/routes/api/graphql/resolvers/media");
    const findMany = vi.fn(async () => ({ success: true, data: [] }));
    const resolver = mediaResolvers({ crud: { findMany } } as any).mediaImages;

    const admin = {
      _id: "gql-admin-media",
      email: "admin-media@test.com",
      role: "admin",
      permissions: [],
    } as User;

    await resolver(undefined, { pagination: { page: 1, limit: 50 } }, { user: admin });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
