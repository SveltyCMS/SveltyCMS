/**
 * @file tests/unit/auth/cascading-deletion.test.ts
 * @description Verifies that deleting a user correctly cleans up sessions and tokens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelationalAuthModule } from "@src/databases/core/relational-auth";

describe("RelationalAuthModule - Cascading Deletion", () => {
  let authModule: any;
  let mockAdapter: any;
  let mockSchema: any;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };

    mockAdapter = {
      wrap: vi.fn((cb) => cb()),
      transaction: vi.fn((cb) => cb(mockDb)),
    };

    mockSchema = {
      authUsers: { _id: "users_table" },
      authSessions: { userId: "sessions_userId" },
      authTokens: { userId: "tokens_userId" },
    };

    authModule = new (RelationalAuthModule as any)(mockAdapter, mockSchema);
  });

  it("should perform cascading cleanup when deleting users", async () => {
    const userIds = ["user1", "user2"];

    const result = await authModule.deleteUsers(userIds);

    expect(result.success).toBe(true);

    // Verify transaction was used
    expect(mockAdapter.transaction).toHaveBeenCalled();

    // Verify deletions were called for sessions and tokens
    expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.authSessions);
    expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.authTokens);
    expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.authUsers);
  });
});
