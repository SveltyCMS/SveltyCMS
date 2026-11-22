/**
 * @file tests/unit/auth/last-admin-guard.test.ts
 * @description Regression tests for the last-administrator guard.
 *
 * A tenant (or the global/system scope when `tenantId` is null/undefined) must
 * never lose its final active administrator through a single or batch delete /
 * block action. Refusals carry a stable `LAST_ADMIN` error code.
 */

import { describe, it, expect, vi } from "vitest";
import { AuthNamespace } from "@src/services/sdk/namespaces/auth-namespace";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { User } from "@src/databases/auth/types";

function adminUser(id: string, tenantId: string | null, blocked = false): User {
  return {
    _id: id as DatabaseId,
    email: `${id}@test.de`,
    role: "admin",
    blocked,
    tenantId: tenantId as DatabaseId | null,
  } as User;
}

function createFakeAuth(users: User[]) {
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return {
    getUserById: vi.fn(async (id: string) => ({
      success: true,
      data: byId.get(String(id)) ?? null,
    })),
    getAllUsers: vi.fn(async () => ({ success: true, data: users })),
    deleteUser: vi.fn(async () => ({ success: true })),
    deleteUsers: vi.fn(async () => ({ success: true, data: { deletedCount: 1 } })),
    blockUsers: vi.fn(async () => ({ success: true, data: { modifiedCount: 1 } })),
  };
}

function namespaceFor(users: User[]) {
  const auth = createFakeAuth(users);
  const namespace = new AuthNamespace({ auth } as unknown as IDBAdapter);
  return { auth, namespace };
}

describe("AuthNamespace — last-admin guard", () => {
  it("refuses to delete the only admin in a tenant", async () => {
    const { auth, namespace } = namespaceFor([adminUser("admin-1", "tenant-1")]);

    const result = await namespace.deleteUser("admin-1", { tenantId: "tenant-1" as DatabaseId });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the delete");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it("allows deleting an admin while another active admin remains", async () => {
    const { auth, namespace } = namespaceFor([
      adminUser("admin-1", "tenant-1"),
      adminUser("admin-2", "tenant-1"),
    ]);

    const result = await namespace.deleteUser("admin-1", { tenantId: "tenant-1" as DatabaseId });

    expect(result.success).toBe(true);
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("ignores a blocked admin when counting remaining administrators", async () => {
    const { auth, namespace } = namespaceFor([
      adminUser("admin-1", "tenant-1"),
      adminUser("admin-2", "tenant-1", true),
    ]);

    const result = await namespace.deleteUser("admin-1", { tenantId: "tenant-1" as DatabaseId });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the delete");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a batch delete that removes the final admin", async () => {
    const { auth, namespace } = namespaceFor([adminUser("admin-1", "tenant-1")]);

    const result = await namespace.batchAction(["admin-1"], "delete", {
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the batch");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.deleteUsers).not.toHaveBeenCalled();
  });

  it("refuses a batch block that disables the final admin", async () => {
    const { auth, namespace } = namespaceFor([adminUser("admin-1", "tenant-1")]);

    const result = await namespace.batchAction(["admin-1"], "block", {
      tenantId: "tenant-1" as DatabaseId,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the block");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.blockUsers).not.toHaveBeenCalled();
  });

  it("refuses to remove the last global admin (null tenant scope)", async () => {
    const { auth, namespace } = namespaceFor([
      adminUser("global-admin", null),
      adminUser("tenant-admin", "tenant-2"),
    ]);

    const result = await namespace.deleteUser("global-admin");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the delete");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it("guards the target tenant when a global caller deletes its last admin", async () => {
    const { auth, namespace } = namespaceFor([
      adminUser("tenant-admin", "tenant-1"),
      adminUser("other-admin", "tenant-2"),
    ]);

    const result = await namespace.deleteUser("tenant-admin");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected the guard to reject the delete");
    expect(result.error.code).toBe("LAST_ADMIN");
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it("does not block mutations of non-admin users", async () => {
    const editor = {
      _id: "editor-1" as DatabaseId,
      email: "editor@test.de",
      role: "editor",
      blocked: false,
      tenantId: "tenant-1" as DatabaseId,
    } as User;
    const { auth, namespace } = namespaceFor([editor]);

    const result = await namespace.deleteUser("editor-1", { tenantId: "tenant-1" as DatabaseId });

    expect(result.success).toBe(true);
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
  });
});
