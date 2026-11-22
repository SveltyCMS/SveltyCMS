/**
 * @file tests/unit/security/login-failure-audit.test.ts
 * @description Pins USER_LOGIN_FAILED emission on every failed authentication path.
 *
 * Each failed attempt — unknown user, locked account, blocked account and wrong
 * password — must append exactly one audit row, with no credential material.
 * Both login entry points are covered: `Auth.authenticate()` (form remote) and
 * `AuthNamespace.login()` (API).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Auth } from "@src/databases/auth";
import { AuthNamespace } from "@src/services/sdk/namespaces/auth-namespace";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { hashPassword } from "@utils/security/crypto";
import { dateToISODateString } from "@src/utils/date";
import type { SessionStore, User } from "@src/databases/auth/types";
import type { DatabaseAdapter, DatabaseId, IDBAdapter } from "@src/databases/db-interface";

const EMAIL = "audit@test.de";
const PASSWORD = "CorrectPass1!";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1" as User["_id"],
    email: EMAIL,
    role: "editor",
    password: "",
    failedAttempts: 0,
    lockoutUntil: null,
    blocked: false,
    ...overrides,
  } as User;
}

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

function harness(user: User | null) {
  const auth = {
    getUserByEmail: vi.fn(async () => ({ success: true, data: user })),
    updateUserAttributes: vi.fn(async () => ({ success: true, data: user })),
    createSession: vi.fn(async () => ({ success: true, data: { _id: "session-1" } })),
    getActiveSessions: vi.fn(async () => ({ success: true, data: [] })),
  };
  const adapter = { auth } as unknown as DatabaseAdapter;
  return {
    auth: new Auth(adapter, memorySessionStore()),
    namespace: new AuthNamespace(adapter as unknown as IDBAdapter),
    apiAuth: auth,
  };
}

function failureRows(logSpy: ReturnType<typeof vi.spyOn>) {
  return logSpy.mock.calls.filter(
    (call: unknown[]) => call[3] === AuditEventType.USER_LOGIN_FAILED,
  );
}

describe("USER_LOGIN_FAILED audit coverage", () => {
  let passwordHash: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    passwordHash = await hashPassword(PASSWORD);
    logSpy = vi.spyOn(auditLogService, "log").mockResolvedValue(undefined as never);
    logSpy.mockClear();
  });

  it("emits exactly one row for a wrong password and never stores the credential", async () => {
    const { auth } = harness(buildUser({ password: passwordHash }));

    const result = await auth.authenticate(EMAIL, "WrongPass1!", undefined, undefined, {
      ipAddress: "10.0.0.5",
    });

    expect(result).toBeNull();
    const rows = failureRows(logSpy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toMatchObject({ email: EMAIL, ip: "10.0.0.5" });
    expect(rows[0]?.[5]).toMatchObject({ reason: "invalid_password" });
    expect(JSON.stringify(rows[0])).not.toContain("WrongPass1!");
  });

  it("emits one row for an unknown user", async () => {
    const { auth } = harness(null);

    expect(await auth.authenticate("nobody@test.de", "WrongPass1!")).toBeNull();
    const rows = failureRows(logSpy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toMatchObject({ email: "nobody@test.de" });
    expect(rows[0]?.[5]).toMatchObject({ reason: "unknown_user" });
  });

  it("emits one row for a locked account", async () => {
    const { auth } = harness(
      buildUser({
        password: passwordHash,
        lockoutUntil: dateToISODateString(new Date(Date.now() + 60_000)),
      }),
    );

    expect(await auth.authenticate(EMAIL, PASSWORD)).toBeNull();
    const rows = failureRows(logSpy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[5]).toMatchObject({ reason: "account_locked" });
  });

  it("emits one row for a blocked account", async () => {
    const { auth } = harness(buildUser({ password: passwordHash, blocked: true }));

    expect(await auth.authenticate(EMAIL, PASSWORD)).toBeNull();
    const rows = failureRows(logSpy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[5]).toMatchObject({ reason: "account_blocked" });
  });

  it("emits one row through the API login path on a wrong password", async () => {
    const { namespace } = harness(buildUser({ password: passwordHash }));

    const result = await namespace.login(
      { email: EMAIL, password: "WrongPass1!" },
      { tenantId: "tenant-1" as DatabaseId },
    );

    expect(result.success).toBe(false);
    const rows = failureRows(logSpy);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toMatchObject({ email: EMAIL });
    expect(rows[0]?.[5]).toMatchObject({ reason: "invalid_password" });
  });
});
