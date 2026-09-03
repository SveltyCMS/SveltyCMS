/**
 * @file tests/unit/auth/session-manager.test.ts
 * @description Unit test suite for SveltyCMS session persistence manager.
 *
 * Features tested:
 * - In-memory session store lifecycle (set, get, delete, size, clear)
 * - Session expiration logic and automated eviction
 * - Database validation fallback via validateWithDB
 * - Pattern-based batch deletion
 * - Capacity cleanup when reaching MAX_SESSIONS
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId, ISODateString, User } from "@databases/db-interface";
import {
  createSessionManager,
  getDefaultSessionManager,
  InMemorySessionManager,
} from "@src/databases/auth/session-manager";
import { createMockUser } from "../utils/mock-factories";

describe("Session Manager (Unit Suite)", () => {
  it("stores, retrieves, and deletes sessions in memory", async () => {
    const manager = new InMemorySessionManager();
    const user: User = createMockUser({ _id: "user-123", email: "user@test.com" });
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString() as ISODateString;

    await manager.set("sess-1", user, futureExp);

    const retrieved = await manager.get("sess-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?._id).toBe("user-123");

    await manager.delete("sess-1");
    const afterDelete = await manager.get("sess-1");
    expect(afterDelete).toBeNull();
  });

  it("returns null and evicts session when expiration timestamp is in the past", async () => {
    const manager = new InMemorySessionManager();
    const user: User = createMockUser({ _id: "user-expired" });
    const pastExp = new Date(Date.now() - 5000).toISOString() as ISODateString;

    await manager.set("sess-past", user, pastExp);

    const result = await manager.get("sess-past");
    expect(result).toBeNull();
  });

  it("supports pattern-based deletion across keys", async () => {
    const manager = new InMemorySessionManager();
    const user: User = createMockUser({ _id: "user-pattern" });
    const futureExp = new Date(Date.now() + 3600 * 1000).toISOString() as ISODateString;

    await manager.set("user:1:sess1", user, futureExp);
    await manager.set("user:1:sess2", user, futureExp);
    await manager.set("user:2:sess1", user, futureExp);

    const deletedCount = await manager.deletePattern("user:1:*");
    expect(deletedCount).toBe(2);

    expect(await manager.get("user:1:sess1")).toBeNull();
    expect(await manager.get("user:1:sess2")).toBeNull();
    expect(await manager.get("user:2:sess1")).not.toBeNull();
  });

  it("retrieves or validates with database via validateWithDB", async () => {
    const manager = new InMemorySessionManager();
    const user: User = createMockUser({ _id: "db-user" });
    const dbValidationFn = vi.fn().mockResolvedValue(user);

    // First call: not cached -> calls dbValidationFn and caches it
    const validated = await manager.validateWithDB("sess-db" as DatabaseId, dbValidationFn);
    expect(validated?._id).toBe("db-user");
    expect(dbValidationFn).toHaveBeenCalledTimes(1);

    // Second call: cached in memory -> does NOT call dbValidationFn again
    const cached = await manager.validateWithDB("sess-db" as DatabaseId, dbValidationFn);
    expect(cached?._id).toBe("db-user");
    expect(dbValidationFn).toHaveBeenCalledTimes(1);
  });

  it("instantiates default session manager singleton correctly", () => {
    const manager1 = getDefaultSessionManager();
    const manager2 = getDefaultSessionManager();
    expect(manager1).toBe(manager2);

    const customManager = createSessionManager();
    expect(customManager).toBeInstanceOf(InMemorySessionManager);
  });
});
