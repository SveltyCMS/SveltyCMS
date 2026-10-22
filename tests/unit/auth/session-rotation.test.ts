/**
 * @file tests/unit/auth/session-rotation.test.ts
 * @description Rotation must not sign the user out through the session policies.
 *
 * `handleSessionRotation` mints the successor and retires the predecessor. That
 * createSession call used to run the device/parallel caps as if it were a fresh
 * login, so the policy deleted the very session the request was rotating away
 * from — any in-flight request still carrying the old cookie then resolved to
 * "invalid session" and the hook cleared every session cookie (observed as
 * random sign-outs, worst right after a dev-server restart wiped the in-memory
 * rotation grace map). `isRotation: true` keeps both caps out of the way.
 *
 * Uses the real Auth class with an in-memory session store; only the DB edge is
 * mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Auth } from "@src/databases/auth";
import type { Session, SessionStore, User } from "@src/databases/auth/types";
import { dateToISODateString } from "@src/utils/date";

let sessionDevicePolicy: string | null = null;
let sessionMaxPerUser: number | null = null;

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "SESSION_DEVICE_POLICY") return sessionDevicePolicy;
    if (key === "SESSION_TTL_HOURS") return 24;
    if (key === "SESSION_MAX_PER_USER") return sessionMaxPerUser;
    return null;
  }),
  getPublicSettingSync: vi.fn(() => undefined),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
}));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0.0.0";

function createMemorySessionStore(): SessionStore {
  const map = new Map<string, User>();
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
      return map.get(String(sessionId)) ?? null;
    },
    async set(sessionId, user) {
      map.set(String(sessionId), user);
    },
    async validateWithDB(sessionId, dbValidationFn) {
      return (await dbValidationFn(sessionId)) ?? map.get(String(sessionId)) ?? null;
    },
  };
}

function createHarness(predecessor: Partial<Session> | null) {
  const user = {
    _id: "user-1",
    email: "admin@test.com",
    role: "admin",
    isAdmin: true,
  } as unknown as User;

  const deleteSession = vi.fn(async () => ({ success: true as const }));

  const dbAdapter = {
    auth: {
      createSession: vi.fn(async (sessionData: Record<string, unknown>) => ({
        success: true as const,
        data: {
          _id: "session-new",
          user_id: sessionData.user_id,
          expires: sessionData.expires,
          tenantId: sessionData.tenantId ?? null,
          userAgent: sessionData.userAgent,
        },
      })),
      getUserById: vi.fn(async () => ({ success: true as const, data: user })),
      getAllRoles: vi.fn(async () => ({ success: true as const, data: [] })),
      getActiveSessions: vi.fn(async () => ({
        success: true as const,
        data: predecessor ? [predecessor] : [],
      })),
      deleteSession,
    },
  } as any;

  const auth = new Auth(dbAdapter, createMemorySessionStore());
  return { auth, deleteSession };
}

const predecessor = {
  _id: "session-old",
  user_id: "user-1",
  expires: dateToISODateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  userAgent: UA,
  deviceId: undefined,
} as unknown as Session;

describe("Auth.createSession during token rotation", () => {
  beforeEach(() => {
    sessionDevicePolicy = "single-per-device";
    sessionMaxPerUser = 5;
  });

  it("does not evict the session being rotated away from", async () => {
    const { auth, deleteSession } = createHarness(predecessor);

    const created = await auth.createSession({
      user_id: "user-1" as never,
      expires: dateToISODateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      userAgent: UA,
      isRotation: true,
    });

    expect(created._id).toBe("session-new");
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("still enforces the device policy on a real login", async () => {
    const { auth, deleteSession } = createHarness(predecessor);

    await auth.createSession({
      user_id: "user-1" as never,
      expires: dateToISODateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      userAgent: UA,
    });

    expect(deleteSession).toHaveBeenCalledWith("session-old", undefined);
  });
});
