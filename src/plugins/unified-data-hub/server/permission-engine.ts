/**
 * @file src/plugins/unified-data-hub/server/permission-engine.ts
 * @description RBAC extension for virtual collection access.
 *
 * Features:
 * - Admin fast-path
 * - collection:read permission gate
 * - Per-virtual-collection permission overrides
 */

import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import type { VirtualCollectionRecord } from "../types";
import { FederationError } from "../types";

export async function assertVirtualWritePermission(
  user: { _id?: string; role?: string; isAdmin?: boolean } | undefined,
  roles: unknown[],
  collection: VirtualCollectionRecord,
): Promise<void> {
  if (!user) {
    throw new FederationError("PERMISSION_DENIED", "Authentication required", 401);
  }

  if (user.isAdmin || user.role === "admin" || user.role === "super-admin") {
    return;
  }

  const required = collection.permissions?.write ?? ["collection:write"];
  for (const perm of required) {
    if (hasPermissionWithRoles(user as any, perm, roles as any[])) {
      return;
    }
  }

  throw new FederationError(
    "PERMISSION_DENIED",
    "Insufficient permissions to write virtual collection",
    403,
  );
}

export async function assertVirtualReadPermission(
  user: { _id?: string; role?: string; isAdmin?: boolean } | undefined,
  roles: unknown[],
  collection: VirtualCollectionRecord,
): Promise<void> {
  if (!user) {
    throw new FederationError("PERMISSION_DENIED", "Authentication required", 401);
  }

  if (user.isAdmin || user.role === "admin" || user.role === "super-admin") {
    return;
  }

  const required = collection.permissions?.read ?? ["collection:read"];
  for (const perm of required) {
    if (hasPermissionWithRoles(user as any, perm, roles as any[])) {
      return;
    }
  }

  throw new FederationError(
    "PERMISSION_DENIED",
    "Insufficient permissions for virtual collection",
    403,
  );
}

export function assertConnectorAdmin(
  user: { isAdmin?: boolean; role?: string } | undefined,
  roles: unknown[],
): void {
  if (!user) {
    throw new FederationError("PERMISSION_DENIED", "Authentication required", 401);
  }
  if (user.isAdmin || user.role === "admin" || user.role === "super-admin") {
    return;
  }
  if (hasPermissionWithRoles(user as any, "system:settings", roles as any[])) {
    return;
  }
  throw new FederationError(
    "PERMISSION_DENIED",
    "Admin access required for connector management",
    403,
  );
}
