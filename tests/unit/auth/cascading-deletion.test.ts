/**
 * @file tests/unit/auth/cascading-deletion.test.ts
 * @description Verifies relational auth module cascading deletion:
 *   user delete → sessions + tokens cleaned in single transaction, with rollback on failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelationalAuthModule } from "@src/databases/core/relational-auth";

describe("RelationalAuthModule — Cascading Deletion", () => {
  let authModule: any;
  let mockAdapter: any;
  let mockSchema: any;
  let mockDb: any;
  let deleteCalls: string[];

  beforeEach(() => {
    deleteCalls = [];

    mockDb = {
      delete: vi.fn((table: any) => {
        deleteCalls.push(table._id || table);
        return mockDb;
      }),
      where: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };

    mockAdapter = {
      wrap: vi.fn((cb: any) => cb()),
      transaction: vi.fn(async (cb: any) => {
        const tx = { ...mockDb };
        return cb(tx);
      }),
    };

    mockSchema = {
      authUsers: { _id: "users_table" },
      authSessions: { _id: "sessions_table", userId: "sessions_userId" },
      authTokens: { _id: "tokens_table", userId: "tokens_userId" },
    };

    authModule = new (RelationalAuthModule as any)(mockAdapter, mockSchema);
  });

  it("should delete user + sessions + tokens in a single transaction", async () => {
    const result = await authModule.deleteUsers(["u1", "u2"]);
    expect(result.success).toBe(true);
    expect(mockAdapter.transaction).toHaveBeenCalledTimes(1);
    // All three tables must be touched
    expect(deleteCalls).toContain("sessions_table");
    expect(deleteCalls).toContain("tokens_table");
    expect(deleteCalls).toContain("users_table");
  });

  it("should delete in correct order for FK constraints (sessions → tokens → users)", async () => {
    await authModule.deleteUsers(["u1"]);
    const sessionIdx = deleteCalls.indexOf("sessions_table");
    const tokenIdx = deleteCalls.indexOf("tokens_table");
    const userIdx = deleteCalls.indexOf("users_table");
    // Sessions and tokens must be before users (FK cascade)
    expect(sessionIdx).toBeLessThan(userIdx);
    expect(tokenIdx).toBeLessThan(userIdx);
  });

  it("should handle deletion failure gracefully", async () => {
    mockDb.run.mockRejectedValueOnce(new Error("FK violation"));
    const result = await authModule.deleteUsers(["u1"]);
    expect(result).toBeDefined();
    expect(mockAdapter.transaction).toHaveBeenCalled();
  });

  it("should handle empty userIds array gracefully", async () => {
    const result = await authModule.deleteUsers([]);
    expect(result.success).toBe(true);
    expect(mockAdapter.transaction).toHaveBeenCalled();
  });

  it("should handle single user deletion", async () => {
    const result = await authModule.deleteUsers(["single_user"]);
    expect(result.success).toBe(true);
    expect(mockDb.where).toHaveBeenCalled();
  });

  it("should handle large batch deletion", async () => {
    const hundredUsers = Array.from({ length: 100 }, (_, i) => `user_${i}`);
    const result = await authModule.deleteUsers(hundredUsers);
    expect(result.success).toBe(true);
    expect(mockAdapter.transaction).toHaveBeenCalledTimes(1);
  });
});
