/**
 * @file tests/unit/auth/authenticate-hash-count.test.ts
 * @description Pins the CWE-208 invariant that Auth.authenticate runs exactly one
 * Argon2 verification on every null return: a real verify for a wrong password,
 * a dummy verify for unknown / passwordless / blocked / locked accounts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Auth } from "@src/databases/auth";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { SessionStore, User } from "@src/databases/auth/types";
import { dateToISODateString } from "@src/utils/date";

const cryptoMocks = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  verifyDummyPassword: vi.fn(),
}));

// Spies around the real exports: the default implementation remains the real
// Argon2 verification; individual tests override it (e.g. wrong-password).
vi.mock("@utils/security/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/security/crypto")>();
  return {
    ...actual,
    verifyPassword: cryptoMocks.verifyPassword,
    verifyDummyPassword: cryptoMocks.verifyDummyPassword,
  };
});

const STORED_HASH = "$argon2id$v=19$m=65536,p=4,t=3$stub$stub";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1" as User["_id"],
    email: "known@test.com",
    role: "editor",
    password: STORED_HASH,
    failedAttempts: 0,
    lockoutUntil: null,
    blocked: false,
    ...overrides,
  } as User;
}

function createHarness(user: User | null) {
  const getUserByEmail = vi.fn(async () => ({ success: true, data: user }));
  const updateUserAttributes = vi.fn(async () => ({ success: true, data: true }));
  const createSession = vi.fn(async () => ({ success: true, data: { _id: "session-1" } }));

  const dbAdapter = {
    auth: { getUserByEmail, updateUserAttributes, createSession },
  } as unknown as DatabaseAdapter;

  const sessionStore: SessionStore = {
    close: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deletePattern: vi.fn(async () => 0),
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    validateWithDB: vi.fn(async (sessionId, dbValidationFn) => dbValidationFn(sessionId)),
  };

  return {
    auth: new Auth(dbAdapter, sessionStore),
    getUserByEmail,
    updateUserAttributes,
    createSession,
  };
}

describe("Auth.authenticate — exactly one Argon2 verification per null return", () => {
  beforeEach(async () => {
    // Restore the real Argon2 implementations between tests.
    const actual =
      await vi.importActual<typeof import("@utils/security/crypto")>("@utils/security/crypto");
    cryptoMocks.verifyPassword.mockReset();
    cryptoMocks.verifyDummyPassword.mockReset();
    cryptoMocks.verifyPassword.mockImplementation(actual.verifyPassword);
    cryptoMocks.verifyDummyPassword.mockImplementation(actual.verifyDummyPassword);
  });

  it("unknown email: zero real verifies, one dummy verify", async () => {
    const { auth } = createHarness(null);

    const result = await auth.authenticate("unknown@test.com", "SomePass1!");

    expect(result).toBeNull();
    expect(cryptoMocks.verifyPassword).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyDummyPassword).toHaveBeenCalledTimes(1);
    expect(cryptoMocks.verifyDummyPassword).toHaveBeenCalledWith("SomePass1!");
  });

  it("known user + wrong password: one real verify, zero dummy verifies", async () => {
    const user = buildUser();
    const { auth, updateUserAttributes } = createHarness(user);
    cryptoMocks.verifyPassword.mockResolvedValueOnce(false);

    const result = await auth.authenticate(user.email, "WrongPass1!");

    expect(result).toBeNull();
    expect(cryptoMocks.verifyPassword).toHaveBeenCalledTimes(1);
    expect(cryptoMocks.verifyDummyPassword).not.toHaveBeenCalled();
    // Failed-attempt tracking still runs.
    expect(updateUserAttributes).toHaveBeenCalledTimes(1);
  });

  it("blocked user: zero real verifies, one dummy verify", async () => {
    const user = buildUser({ blocked: true });
    const { auth } = createHarness(user);

    const result = await auth.authenticate(user.email, "SomePass1!");

    expect(result).toBeNull();
    expect(cryptoMocks.verifyPassword).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyDummyPassword).toHaveBeenCalledTimes(1);
  });

  it("user without a password: zero real verifies, one dummy verify", async () => {
    const user = buildUser({ password: undefined });
    const { auth } = createHarness(user);

    const result = await auth.authenticate(user.email, "SomePass1!");

    expect(result).toBeNull();
    expect(cryptoMocks.verifyPassword).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyDummyPassword).toHaveBeenCalledTimes(1);
  });

  it("locked account (423 catch path): zero real verifies, one dummy verify", async () => {
    const user = buildUser({
      lockoutUntil: dateToISODateString(new Date(Date.now() + 60_000)),
    });
    const { auth } = createHarness(user);

    const result = await auth.authenticate(user.email, "SomePass1!");

    expect(result).toBeNull();
    expect(cryptoMocks.verifyPassword).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyDummyPassword).toHaveBeenCalledTimes(1);
  });
});
