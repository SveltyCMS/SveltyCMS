/**
 * @file tests/unit/auth/revocation-epoch.test.ts
 * @description Unit tests for in-memory Revocation Epoch engine and SessionManager integration.
 *
 * Features:
 * - Monotonic global revocation epoch
 * - Per-tenant and per-user targeted revocation
 * - Sub-microsecond validation with 0 DB queries
 * - SessionManager integration (immediate eviction on access)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  revokeAllSessions,
  revokeTenantSessions,
  revokeUserSessions,
  isSessionRevoked,
  getRevocationStats,
  resetRevocationEpochs,
} from "@src/databases/auth/revocation-epoch";
import { InMemorySessionManager } from "@src/databases/auth/session-manager";
import type { DatabaseId } from "@src/databases/db-interface";
import type { User } from "@src/databases/auth/types";
import { nowISODateString } from "@utils/date";

describe("Revocation Epoch Engine", () => {
  beforeEach(() => {
    resetRevocationEpochs();
  });

  it("should report unrevoked for fresh sessions when no epochs exist", () => {
    const now = Date.now();
    expect(isSessionRevoked(now, "user-1", "tenant-1")).toBe(false);
  });

  it("should globally invalidate all sessions issued before revokeAllSessions()", () => {
    const issuedBefore = Date.now() - 1000;
    revokeAllSessions();
    const issuedAfter = Date.now() + 1000;

    expect(isSessionRevoked(issuedBefore, "user-1", "tenant-1")).toBe(true);
    expect(isSessionRevoked(issuedBefore, "user-2", "tenant-2")).toBe(true);
    expect(isSessionRevoked(issuedAfter, "user-1", "tenant-1")).toBe(false);
  });

  it("should invalidate only the target tenant's sessions", () => {
    const issuedBefore = Date.now() - 500;
    revokeTenantSessions("tenant-alpha");
    const issuedAfter = Date.now() + 500;

    // Tenant alpha sessions before epoch are revoked
    expect(isSessionRevoked(issuedBefore, "user-1", "tenant-alpha")).toBe(true);
    // Tenant alpha sessions after epoch are valid
    expect(isSessionRevoked(issuedAfter, "user-1", "tenant-alpha")).toBe(false);
    // Unrelated tenant sessions remain valid
    expect(isSessionRevoked(issuedBefore, "user-2", "tenant-beta")).toBe(false);
  });

  it("should invalidate only the target user's sessions across devices", () => {
    const issuedBefore = Date.now() - 500;
    revokeUserSessions("user-victim");
    const issuedAfter = Date.now() + 500;

    // User victim sessions before epoch are revoked
    expect(isSessionRevoked(issuedBefore, "user-victim", "tenant-alpha")).toBe(true);
    // User victim sessions after epoch are valid
    expect(isSessionRevoked(issuedAfter, "user-victim", "tenant-alpha")).toBe(false);
    // Other users remain untouched
    expect(isSessionRevoked(issuedBefore, "user-innocent", "tenant-alpha")).toBe(false);
  });

  it("should track revocation statistics accurately", () => {
    revokeTenantSessions("tenant-1");
    revokeTenantSessions("tenant-2");
    revokeUserSessions("user-1");

    const stats = getRevocationStats();
    expect(stats.revokedTenantsCount).toBe(2);
    expect(stats.revokedUsersCount).toBe(1);
    expect(stats.globalEpoch).toBe(0);

    revokeAllSessions();
    expect(getRevocationStats().globalEpoch).toBeGreaterThan(0);
  });
});

describe("SessionManager Revocation Epoch Integration", () => {
  beforeEach(() => {
    resetRevocationEpochs();
  });

  const mockUser: User = {
    _id: "user-test-123" as DatabaseId,
    email: "test@example.com",
    role: "editor",
    permissions: [],
    tenantId: "tenant-corp" as DatabaseId,
    createdAt: nowISODateString(),
    updatedAt: nowISODateString(),
  };

  const oneHourFuture = new Date(Date.now() + 3600_000).toISOString();

  it("should immediately evict revoked session on get()", async () => {
    const sessionManager = new InMemorySessionManager();
    const sessionId = "session-test-abc";
    const issuedAt = Date.now() - 1000;

    await sessionManager.set(sessionId, mockUser, oneHourFuture as any, {
      issuedAtMs: issuedAt,
    });

    // Session is initially accessible
    const userBefore = await sessionManager.get(sessionId);
    expect(userBefore).not.toBeNull();
    expect(userBefore?._id).toBe(mockUser._id);

    // Revoke user sessions
    revokeUserSessions(mockUser._id);

    // Immediate lookup triggers revocation check and cleans memory
    const userAfter = await sessionManager.get(sessionId);
    expect(userAfter).toBeNull();

    // Verify it was purged from the internal store
    const userSubsequent = await sessionManager.get(sessionId);
    expect(userSubsequent).toBeNull();
  });

  it("should immediately evict revoked session on getSessionData()", async () => {
    const sessionManager = new InMemorySessionManager();
    const sessionId = "session-test-xyz";
    const issuedAt = Date.now() - 1000;

    await sessionManager.set(sessionId, mockUser, oneHourFuture as any, {
      issuedAtMs: issuedAt,
    });

    // Revoke tenant
    revokeTenantSessions(mockUser.tenantId as string);

    const sessionData = await sessionManager.getSessionData(sessionId);
    expect(sessionData).toBeNull();
  });

  it("should preserve current session if refreshSessionIssuedAt() is called", async () => {
    const sessionManager = new InMemorySessionManager();
    const sessionId = "session-changer";
    const issuedAt = Date.now() - 1000;

    await sessionManager.set(sessionId, mockUser, oneHourFuture as any, {
      issuedAtMs: issuedAt,
    });

    // Invalidate user sessions
    revokeUserSessions(mockUser._id);

    // Refresh this specific session to remain logged in (e.g. password changer)
    await sessionManager.refreshSessionIssuedAt(sessionId, Date.now() + 10);

    const activeUser = await sessionManager.get(sessionId);
    expect(activeUser).not.toBeNull();
    expect(activeUser?._id).toBe(mockUser._id);
  });
});
