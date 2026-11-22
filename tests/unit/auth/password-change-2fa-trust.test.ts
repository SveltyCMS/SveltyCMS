/**
 * @file tests/unit/auth/password-change-2fa-trust.test.ts
 * @description Regression tests: a real password change clears trusted 2FA devices.
 *
 * Both password-change entry points are covered — the service-level
 * `Auth.updateUserPassword()` (admin/reset path) and the self-service
 * `applyUserAttributeUpdate()` helper. Profile saves without a password must
 * leave the trusted-device list untouched.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Auth } from "@src/databases/auth";
import { applyUserAttributeUpdate } from "@utils/server/user-attribute-update.server";
import type { SessionStore, User } from "@src/databases/auth/types";
import type { DatabaseId } from "@src/databases/db-interface";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
  primeSessionMemoryCache: vi.fn(),
}));

vi.mock("@utils/server/layout-caches.server", () => ({
  invalidateLayoutUserCache: vi.fn(),
}));

vi.mock("@src/hooks/handle-turbo-get", () => ({
  invalidateTurboAuthForUser: vi.fn(),
}));

vi.mock("@utils/server/session-reauth.server", () => ({
  verifyReauthToken: vi.fn().mockReturnValue(true),
  verifyUserReauthToken: vi.fn().mockReturnValue(true),
  signReauthToken: vi.fn(),
  signUserReauthToken: vi.fn(),
  REAUTH_TOKEN_TTL_MS: 300_000,
}));

function memorySessionStore(): SessionStore {
  return {
    close: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deletePattern: vi.fn(async () => 0),
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    validateWithDB: vi.fn(async (sessionId, validate) => validate(sessionId)),
  };
}

describe("Auth.updateUserPassword", () => {
  it("clears trusted 2FA devices on a password rotation", async () => {
    const user = {
      _id: "user-1" as DatabaseId,
      email: "user@test.de",
      tenantId: "tenant-1" as DatabaseId,
      twoFactorTrustedDevices: ["device-fingerprint"],
    } as User;

    const updateUserAttributes = vi.fn(async (_id: string, _attrs: Partial<User>) => ({
      success: true,
      data: user,
    }));
    const dbAdapter = {
      auth: {
        getUserByEmail: vi.fn(async () => ({ success: true, data: user })),
        updateUserAttributes,
        getActiveSessions: vi.fn(async () => ({ success: true, data: [] })),
        invalidateAllUserSessions: vi.fn(async () => ({ success: true })),
      },
    };

    const auth = new Auth(
      dbAdapter as unknown as ConstructorParameters<typeof Auth>[0],
      memorySessionStore(),
    );
    const result = await auth.updateUserPassword(user.email, "NewValid1!", {
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(result.status).toBe(true);
    const update = updateUserAttributes.mock.calls[0]?.[1] as Partial<User>;
    expect(update.twoFactorTrustedDevices).toEqual([]);
    expect(update.password).toMatch(/^\$argon2/);
  });
});

function createEvent(_body: Record<string, unknown>): RequestEvent {
  return {
    locals: {
      user: { _id: "user-1", email: "user@test.de", role: "editor" },
      roles: [],
      session_id: "session-1",
    },
    request: {
      headers: new Headers({ "x-reauth-token": "reauth" }),
    },
    cookies: { get: vi.fn() },
    url: new URL("http://localhost/api/user/update-user-attributes"),
    getClientAddress: () => "127.0.0.1",
  } as unknown as RequestEvent;
}

interface AttributeUpdateMock {
  mock: { calls: Array<[string, Record<string, unknown>]> };
}

function createCms(updateUserAttributes: AttributeUpdateMock): LocalCMS {
  return {
    auth: {
      updateUserAttributes,
      getActiveSessions: vi.fn(async () => ({ success: true, data: [] })),
      invalidateAllUserSessions: vi.fn(async () => ({ success: true, data: [] })),
    },
  } as unknown as LocalCMS;
}

describe("applyUserAttributeUpdate — self-service password change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears trusted 2FA devices when the password changes", async () => {
    const updateUserAttributes = vi.fn(async (_id: string, _attrs: Record<string, unknown>) => ({
      success: true,
      data: { _id: "user-1", email: "user@test.de" },
    }));
    const event = createEvent({ password: "NewValid1!" });

    await applyUserAttributeUpdate(
      event,
      createCms(updateUserAttributes),
      "tenant-1" as DatabaseId,
      { password: "NewValid1!" },
    );

    const updates = updateUserAttributes.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updates.password).toBe("NewValid1!");
    expect(updates.twoFactorTrustedDevices).toEqual([]);
  });

  it("keeps trusted 2FA devices on a profile-only save", async () => {
    const updateUserAttributes = vi.fn(async (_id: string, _attrs: Record<string, unknown>) => ({
      success: true,
      data: { _id: "user-1", email: "user@test.de" },
    }));
    const event = createEvent({ username: "renamed" });

    await applyUserAttributeUpdate(
      event,
      createCms(updateUserAttributes),
      "tenant-1" as DatabaseId,
      { username: "renamed" },
    );

    const updates = updateUserAttributes.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updates).not.toHaveProperty("twoFactorTrustedDevices");
  });
});
