/**
 * @file tests/unit/auth/auth-lockout.test.ts
 * @description Whitebox proofs for Auth.authenticate lockout + password strength.
 *
 * Uses the **real** Auth class with an in-memory adapter/session store.
 * Does not mock Auth, CacheService, or ensureFullInitialization — only the
 * DB edge (db.auth.*) that Auth delegates to.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Auth } from "@src/databases/auth";
import type { SessionStore, User } from "@src/databases/auth/types";
// User imported for DatabaseId-branded _id casts in harness seeds
import { hashPassword } from "@utils/security/crypto";
import { dateToISODateString } from "@src/utils/date";
import { createLockedUser } from "./utils/auth-test-utils";

// Session device policy override (null = default single-per-device)
let sessionDevicePolicy: string | null = null;
// Session TTL override (null = default 24h)
let sessionTtlHours: number | null = null;
// Max concurrent sessions per user override (null = default 0 / unlimited)
let sessionMaxPerUser: number | null = null;

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "PASSWORD_MIN_LENGTH") return 8;
    if (key === "MULTI_TENANT") return false;
    if (key === "SESSION_DEVICE_POLICY") return sessionDevicePolicy;
    if (key === "SESSION_TTL_HOURS") return sessionTtlHours;
    if (key === "SESSION_MAX_PER_USER") return sessionMaxPerUser;
    return null;
  }),
  getPublicSettingSync: vi.fn(() => undefined),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

// Session cache purge is called by device-session eviction — keep it a no-op spy
vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
}));

function createMemorySessionStore(): SessionStore {
  const map = new Map<string, { user: User; expires: string }>();
  return {
    async close() {
      map.clear();
    },
    async delete(sessionId) {
      map.delete(String(sessionId));
    },
    async deletePattern() {
      return 0;
    },
    async get(sessionId) {
      return map.get(String(sessionId))?.user ?? null;
    },
    async set(sessionId, user, expiration) {
      map.set(String(sessionId), { user, expires: expiration });
    },
    async validateWithDB(sessionId, dbValidationFn) {
      return (await dbValidationFn(sessionId)) ?? map.get(String(sessionId))?.user ?? null;
    },
  };
}

function createAuthHarness(userSeed: Partial<User> & { password: string }) {
  const users = new Map<string, User>();
  const user: User = {
    _id: (userSeed._id as any) || "user-1",
    email: userSeed.email || "user@test.com",
    role: (userSeed.role as any) || "editor",
    password: userSeed.password,
    failedAttempts: userSeed.failedAttempts ?? 0,
    lockoutUntil: userSeed.lockoutUntil ?? null,
    blocked: userSeed.blocked ?? false,
  } as User;
  users.set(String(user._id), user);
  users.set(user.email, user);

  const updateUserAttributes = vi.fn(async (id: string, attrs: Partial<User>) => {
    const existing = users.get(String(id));
    if (!existing) return { success: false };
    Object.assign(existing, attrs);
    users.set(existing.email, existing);
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
        const found = users.get(email.trim().toLowerCase()) ?? null;
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

  const auth = new Auth(dbAdapter, createMemorySessionStore());
  return { auth, dbAdapter, updateUserAttributes, createSession, users, user };
}

describe("Auth.authenticate (real Auth class — lockout & sessions)", () => {
  let passwordHash: string;

  beforeEach(async () => {
    passwordHash = await hashPassword("ValidPass1!");
    sessionDevicePolicy = null;
    sessionTtlHours = null;
    sessionMaxPerUser = null;
  });

  it("rejects authentication while account is locked", async () => {
    const locked = createLockedUser(5, 15);
    const { auth, createSession } = createAuthHarness({
      _id: locked._id as User["_id"],
      email: locked.email,
      password: passwordHash,
      failedAttempts: locked.failedAttempts,
      lockoutUntil: dateToISODateString(locked.lockoutUntil!),
      blocked: true,
    });

    const result = await auth.authenticate(locked.email, "ValidPass1!");
    // Auth.authenticate catches HttpError(423) and returns null (no session leak).
    expect(result).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("increments failedAttempts and locks after 5 wrong passwords", async () => {
    const { auth, updateUserAttributes, user } = createAuthHarness({
      email: "fail@test.com",
      password: passwordHash,
      failedAttempts: 4,
    });

    const result = await auth.authenticate("fail@test.com", "WrongPass1!");
    expect(result).toBeNull();

    expect(updateUserAttributes).toHaveBeenCalled();
    const lastCall = updateUserAttributes.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(user._id);
    expect(lastCall?.[1].failedAttempts).toBe(5);
    expect(lastCall?.[1].lockoutUntil).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("resets failedAttempts and creates a session on successful login", async () => {
    const { auth, updateUserAttributes, createSession } = createAuthHarness({
      email: "ok@test.com",
      password: passwordHash,
      failedAttempts: 2,
      lockoutUntil: null,
    });

    const result = await auth.authenticate("ok@test.com", "ValidPass1!");
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe("sess-1");
    expect(result?.user.email).toBe("ok@test.com");

    // Success path: updateUserAttributes(id, attrs, options?) — options may be undefined.
    const resetCall = updateUserAttributes.mock.calls.find(
      (c: any[]) => c[1]?.failedAttempts === 0 && c[1]?.lockoutUntil === null,
    );
    expect(resetCall).toBeTruthy();
    expect(resetCall![0]).toBe("user-1");
    expect(createSession).toHaveBeenCalled();
  });

  it("clears expired lockout then allows password verification", async () => {
    const expired = dateToISODateString(new Date(Date.now() - 60_000));
    const { auth, updateUserAttributes, createSession } = createAuthHarness({
      email: "expired-lock@test.com",
      password: passwordHash,
      failedAttempts: 5,
      lockoutUntil: expired,
    });

    const result = await auth.authenticate("expired-lock@test.com", "ValidPass1!");
    expect(result).not.toBeNull();
    // First update clears expired lockout; success path may also reset.
    expect(updateUserAttributes).toHaveBeenCalled();
    expect(createSession).toHaveBeenCalled();
  });

  it("returns null for unknown user without creating a session", async () => {
    const { auth, createSession } = createAuthHarness({
      email: "exists@test.com",
      password: passwordHash,
    });

    const result = await auth.authenticate("nobody@test.com", "ValidPass1!");
    expect(result).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("evicts the previous same-device session on re-login (one per user per device)", async () => {
    const { auth, dbAdapter, createSession } = createAuthHarness({
      email: "device@test.com",
      password: passwordHash,
    });
    const invalidateSessionCache = (await import("@src/hooks/handle-authentication"))
      .invalidateSessionCache as ReturnType<typeof vi.fn>;
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "sess-old-device",
          user_id: "user-1",
          userAgent: "UA-Chrome/Windows",
          rotated: false,
        },
        { _id: "sess-phone", user_id: "user-1", userAgent: "UA-Safari/iPhone", rotated: false },
        { _id: "sess-rotated", user_id: "user-1", userAgent: "UA-Chrome/Windows", rotated: true },
      ],
    });

    const result = await auth.authenticate("device@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Chrome/Windows",
      ipAddress: "1.2.3.4",
    });
    expect(result).not.toBeNull();

    // Device info is stored on the new session
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: "UA-Chrome/Windows", ipAddress: "1.2.3.4" }),
    );
    // Same-device non-rotated session is evicted from DB + cache
    expect(dbAdapter.auth.deleteSession).toHaveBeenCalledWith("sess-old-device", undefined);
    expect(invalidateSessionCache).toHaveBeenCalledWith("sess-old-device", null);
    // Other devices and rotated sessions are untouched
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalledWith("sess-phone", undefined);
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalledWith("sess-rotated", undefined);
  });

  it("keeps other-device sessions when logging in from a new device", async () => {
    const { auth, dbAdapter } = createAuthHarness({
      email: "d2@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        { _id: "sess-laptop", user_id: "user-1", userAgent: "UA-Chrome/Windows", rotated: false },
      ],
    });

    const result = await auth.authenticate("d2@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Safari/iPhone",
    });
    expect(result).not.toBeNull();
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalled();
  });

  it("does not evict when no device info is provided", async () => {
    const { auth, dbAdapter } = createAuthHarness({
      email: "legacy@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        { _id: "sess-old", user_id: "user-1", userAgent: "UA-Chrome/Windows", rotated: false },
      ],
    });

    const result = await auth.authenticate("legacy@test.com", "ValidPass1!");
    expect(result).not.toBeNull();
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalled();
  });

  it("honors allow-multiple policy (no eviction)", async () => {
    sessionDevicePolicy = "allow-multiple";
    const { auth, dbAdapter } = createAuthHarness({
      email: "multi@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        { _id: "sess-old", user_id: "user-1", userAgent: "UA-Chrome/Windows", rotated: false },
      ],
    });

    const result = await auth.authenticate("multi@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Chrome/Windows",
    });
    expect(result).not.toBeNull();
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalled();
  });

  it("single-per-user policy evicts sessions on other devices too", async () => {
    sessionDevicePolicy = "single-per-user";
    const { auth, dbAdapter } = createAuthHarness({
      email: "one@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        { _id: "sess-laptop", user_id: "user-1", userAgent: "UA-Chrome/Windows", rotated: false },
        { _id: "sess-phone", user_id: "user-1", userAgent: "UA-Safari/iPhone", rotated: false },
      ],
    });

    const result = await auth.authenticate("one@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Chrome/Windows",
    });
    expect(result).not.toBeNull();
    // Both other-device sessions are evicted under single-per-user
    expect(dbAdapter.auth.deleteSession).toHaveBeenCalledWith("sess-laptop", undefined);
    expect(dbAdapter.auth.deleteSession).toHaveBeenCalledWith("sess-phone", undefined);
  });

  it("applies SESSION_TTL_HOURS to the created session expiry", async () => {
    sessionTtlHours = 2;
    const { auth, createSession } = createAuthHarness({
      email: "ttl@test.com",
      password: passwordHash,
    });

    const result = await auth.authenticate("ttl@test.com", "ValidPass1!");
    expect(result).not.toBeNull();
    const sessionData = createSession.mock.calls.at(-1)?.[0];
    const diffHours = (new Date(sessionData.expires).getTime() - Date.now()) / 3_600_000;
    expect(diffHours).toBeGreaterThan(1.5);
    expect(diffHours).toBeLessThan(2.5);
  });

  it("caps concurrent sessions via SESSION_MAX_PER_USER (evicts oldest)", async () => {
    sessionDevicePolicy = "allow-multiple";
    sessionMaxPerUser = 2;
    const { auth, dbAdapter } = createAuthHarness({
      email: "cap@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "sess-oldest",
          user_id: "user-1",
          rotated: false,
          lastAccess: "2026-01-01T00:00:00.000Z",
        },
        {
          _id: "sess-mid",
          user_id: "user-1",
          rotated: false,
          lastAccess: "2026-02-01T00:00:00.000Z",
        },
        {
          _id: "sess-newest",
          user_id: "user-1",
          rotated: false,
          lastAccess: "2026-03-01T00:00:00.000Z",
        },
      ],
    });

    const result = await auth.authenticate("cap@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Chrome/Windows",
    });
    expect(result).not.toBeNull();
    // Cap 2 → 3 existing + 1 new = 4 → the two least recently active are evicted
    expect(dbAdapter.auth.deleteSession).toHaveBeenCalledWith("sess-oldest", undefined);
    expect(dbAdapter.auth.deleteSession).toHaveBeenCalledWith("sess-mid", undefined);
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalledWith("sess-newest", undefined);
  });

  it("SESSION_MAX_PER_USER = 0 leaves concurrent sessions untouched", async () => {
    sessionDevicePolicy = "allow-multiple";
    sessionMaxPerUser = 0;
    const { auth, dbAdapter } = createAuthHarness({
      email: "nocap@test.com",
      password: passwordHash,
    });
    dbAdapter.auth.getActiveSessions.mockResolvedValue({
      success: true,
      data: [
        {
          _id: "sess-a",
          user_id: "user-1",
          rotated: false,
          lastAccess: "2026-01-01T00:00:00.000Z",
        },
        {
          _id: "sess-b",
          user_id: "user-1",
          rotated: false,
          lastAccess: "2026-02-01T00:00:00.000Z",
        },
      ],
    });

    const result = await auth.authenticate("nocap@test.com", "ValidPass1!", undefined, undefined, {
      userAgent: "UA-Chrome/Windows",
    });
    expect(result).not.toBeNull();
    expect(dbAdapter.auth.deleteSession).not.toHaveBeenCalled();
  });
});

describe("Auth.createUser (real Auth class — password strength)", () => {
  it("rejects weak passwords via validatePasswordStrength", async () => {
    const { auth } = createAuthHarness({
      email: "seed@test.com",
      password: await hashPassword("ValidPass1!"),
    });

    await expect(
      auth.createUser({ email: "weak@test.com", password: "short", role: "editor" as any }),
    ).rejects.toBeTruthy();

    await expect(
      auth.createUser({
        email: "weak2@test.com",
        password: "nouppercase1!",
        role: "editor" as any,
      }),
    ).rejects.toBeTruthy();
  });

  it("accepts a strong password and hashes before createUser", async () => {
    const { auth, dbAdapter } = createAuthHarness({
      email: "seed@test.com",
      password: await hashPassword("ValidPass1!"),
    });

    const created = await auth.createUser({
      email: "strong@test.com",
      password: "ValidPass1!",
      role: "editor" as any,
    });

    expect(created._id).toBe("new-user");
    expect(dbAdapter.auth.createUser).toHaveBeenCalled();
    const payload = (dbAdapter.auth.createUser as any).mock.calls[0][0];
    expect(payload.email).toBe("strong@test.com");
    // Stored hash must not be plaintext
    expect(payload.password).not.toBe("ValidPass1!");
    expect(payload.password).toMatch(/^\$argon2/);
  });
});
