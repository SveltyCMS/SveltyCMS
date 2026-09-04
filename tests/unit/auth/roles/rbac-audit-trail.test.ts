/**
 * @file tests/unit/auth/roles/rbac-audit-trail.test.ts
 * @description Unit tests for cryptographic RBAC audit trail (ROLE_MUTATED / ROLE_DELETED).
 */

import { describe, it, expect, vi } from "vitest";
import { AuditEventType, auditLogService } from "@src/services/security/audit-service";
import { AuthNamespace } from "@src/services/sdk/namespaces/auth-namespace";
import type { Role } from "@src/databases/auth/types";

describe("RBAC Audit Trail", () => {
  it("defines ROLE_MUTATED and ROLE_DELETED audit event types", () => {
    expect(AuditEventType.ROLE_MUTATED).toBe("role_mutated");
    expect(AuditEventType.ROLE_DELETED).toBe("role_deleted");
  });

  it("records audit logs when roles are created, updated, and deleted", async () => {
    const logSpy = vi.spyOn(auditLogService, "log").mockResolvedValue(undefined as any);

    const mockAuth = {
      getAllRoles: vi.fn().mockResolvedValue([
        { _id: "role_to_delete", name: "Obsolete Role", permissions: ["read"] },
        { _id: "role_to_update", name: "Existing Role", permissions: ["read"] },
      ]),
      createRole: vi.fn().mockResolvedValue({ _id: "role_new" }),
      updateRole: vi.fn().mockResolvedValue({ success: true }),
      deleteRole: vi.fn().mockResolvedValue({ success: true }),
    };

    const authNamespace = new AuthNamespace({} as any);
    (authNamespace as any).getAuth = vi.fn().mockResolvedValue(mockAuth);
    (authNamespace as any).validateRoles = vi.fn().mockResolvedValue({ isValid: true });

    const incomingRoles: Role[] = [
      { _id: "role_to_update" as any, name: "Updated Role", permissions: ["read", "write"] },
      { _id: "role_new" as any, name: "Brand New Role", permissions: ["admin"] },
    ];

    const result = await authNamespace.updateRoles(incomingRoles, {
      user: { _id: "admin_123", email: "admin@svelty.org", role: "admin" },
      tenantId: "tenant_abc" as any,
    });

    expect(result.success).toBe(true);

    // Assert role deletion was audited
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Role deleted: Obsolete Role"),
      expect.objectContaining({ id: "admin_123", email: "admin@svelty.org" }),
      expect.objectContaining({ type: "role", id: "role_to_delete" }),
      AuditEventType.ROLE_DELETED,
      "high",
      expect.objectContaining({ roleName: "Obsolete Role" }),
      "tenant_abc",
    );

    // Assert role update was audited
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Role updated: Updated Role"),
      expect.objectContaining({ id: "admin_123", email: "admin@svelty.org" }),
      expect.objectContaining({ type: "role", id: "role_to_update" }),
      AuditEventType.ROLE_MUTATED,
      "medium",
      expect.objectContaining({ roleName: "Updated Role", operation: "update" }),
      "tenant_abc",
    );

    // Assert role creation was audited
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Role created: Brand New Role"),
      expect.objectContaining({ id: "admin_123", email: "admin@svelty.org" }),
      expect.objectContaining({ type: "role", id: "role_new" }),
      AuditEventType.ROLE_MUTATED,
      "medium",
      expect.objectContaining({ roleName: "Brand New Role", operation: "create" }),
      "tenant_abc",
    );
  });
});
