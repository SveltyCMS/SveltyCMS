/**
 * @file tests/unit/auth/session-user.test.ts
 * @description Whitebox proofs for credential-free session snapshots and
 * session-context anomaly evaluation.
 *
 * Covers:
 * - toSafeSessionUser: strips credential material, zero-allocation fast path
 * - InMemorySessionManager: never retains credential material at the store layer
 * - evaluateSessionAnomaly: pure IP/user-agent drift detection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemorySessionManager } from "@src/databases/auth/session-manager";
import { evaluateSessionAnomaly, toSafeSessionUser } from "@src/databases/auth/session-user";
import type { User } from "@src/databases/auth/types";

function credentialCarryingUser(): User {
  return {
    _id: "user-1",
    email: "test@test.com",
    role: "admin",
    permissions: ["dashboard:read"],
    tenantId: "t1",
    password: "$argon2id$v=19$m=65536,fake-hash",
    totpSecret: "v1:encrypted-envelope",
    backupCodes: ["hashed-code-1", "hashed-code-2"],
    resetToken: "reset-secret-token",
    googleRefreshToken: "refresh-secret-token",
    twoFactorTrustedDevices: ["fp-1", "fp-2"],
  } as unknown as User;
}

describe("toSafeSessionUser", () => {
  it("returns the original reference when no sensitive fields are present (zero allocation)", () => {
    const user = {
      _id: "user-1",
      email: "a@b.com",
      role: "editor",
      permissions: ["content:read"],
    } as unknown as User;
    expect(toSafeSessionUser(user)).toBe(user);
  });

  it("strips every credential field but keeps identity, role, and permissions", () => {
    const user = credentialCarryingUser();
    const safe = toSafeSessionUser(user);
    expect(safe.password).toBeUndefined();
    expect(safe.totpSecret).toBeUndefined();
    expect(safe.backupCodes).toBeUndefined();
    expect(safe.resetToken).toBeUndefined();
    expect(safe.googleRefreshToken).toBeUndefined();
    expect(safe.twoFactorTrustedDevices).toBeUndefined();
    // Non-sensitive data survives
    expect(safe.email).toBe("test@test.com");
    expect(safe.role).toBe("admin");
    expect(safe.permissions).toEqual(["dashboard:read"]);
    expect(safe.tenantId).toBe("t1");
    // The original object is never mutated
    expect(user.password).toBe("$argon2id$v=19$m=65536,fake-hash");
  });

  it("passes null through untouched", () => {
    expect(toSafeSessionUser(null as unknown as User)).toBeNull();
  });
});

describe("InMemorySessionManager credential hygiene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never retains credential material after set()", async () => {
    const store = new InMemorySessionManager();
    const user = credentialCarryingUser();
    await store.set("sess-1", user, new Date(Date.now() + 3600_000).toISOString() as any);

    const stored = await store.get("sess-1");
    expect(stored).not.toBeNull();
    expect((stored as User).password).toBeUndefined();
    expect((stored as User).totpSecret).toBeUndefined();
    expect((stored as User).backupCodes).toBeUndefined();
    expect((stored as User).email).toBe("test@test.com");
    expect((stored as User).role).toBe("admin");
  });
});

describe("evaluateSessionAnomaly", () => {
  it("flags nothing when no stored context exists (legacy sessions)", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "1.2.3.4",
      currentUserAgent: "UA-X",
    });
    expect(drift).toEqual({ ipChanged: false, userAgentChanged: false });
  });

  it("flags nothing when contexts match", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "1.2.3.4",
      currentUserAgent: "UA-X",
      storedIp: "1.2.3.4",
      storedUserAgent: "UA-X",
    });
    expect(drift).toEqual({ ipChanged: false, userAgentChanged: false });
  });

  it("flags an IP change", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "9.9.9.9",
      currentUserAgent: "UA-X",
      storedIp: "1.2.3.4",
      storedUserAgent: "UA-X",
    });
    expect(drift.ipChanged).toBe(true);
    expect(drift.userAgentChanged).toBe(false);
  });

  it("flags a user-agent change", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "1.2.3.4",
      currentUserAgent: "UA-Y",
      storedIp: "1.2.3.4",
      storedUserAgent: "UA-X",
    });
    expect(drift.ipChanged).toBe(false);
    expect(drift.userAgentChanged).toBe(true);
  });

  it("normalizes case and whitespace", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "  1.2.3.4 ",
      currentUserAgent: "ua-x",
      storedIp: "1.2.3.4",
      storedUserAgent: "UA-X",
    });
    expect(drift).toEqual({ ipChanged: false, userAgentChanged: false });
  });

  it("ignores empty current values (device capture unavailable)", () => {
    const drift = evaluateSessionAnomaly({
      currentIp: "",
      currentUserAgent: null,
      storedIp: "1.2.3.4",
      storedUserAgent: "UA-X",
    });
    expect(drift).toEqual({ ipChanged: false, userAgentChanged: false });
  });
});
