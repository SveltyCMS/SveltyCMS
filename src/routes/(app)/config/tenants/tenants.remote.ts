/**
 * @file src/routes/(app)/config/tenants/tenants.remote.ts
 * @description Tenant management remote functions for client-side actions.
 *
 * ### Features:
 * - Multi-tenant enabled guard + super-admin guard before every tenant mutation
 * - Delegates to tenants-actions.server for validation and adapter access
 */

import { command, getRequestEvent } from "$app/server";
import { raise } from "@utils/error-handling";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";

const guardAdmin = () => {
  if (!isMultiTenantEnabled()) {
    raise(403, "Multi-tenancy is not enabled in private configuration", "FORBIDDEN");
  }

  const event = getRequestEvent();

  if (!event.locals.user) {
    raise(401, "Unauthorized", "UNAUTHORIZED");
  }

  if (!event.locals.isAdmin || event.locals.user.tenantId) {
    raise(403, "Forbidden", "FORBIDDEN");
  }

  if (!event.locals.dbAdapter) {
    raise(500, "Database adapter not available", "INTERNAL_SERVER_ERROR");
  }

  return event.locals.dbAdapter;
};

export const toggleTenantStatus = command(
  "unchecked",
  async (data: { tenantId: string; status: "active" | "suspended" }) => {
    const dbAdapter = guardAdmin();
    const { toggleTenantStatus: fn } = await import("./tenants-actions.server");
    return fn(data, dbAdapter);
  },
);

export const createTenant = command(
  "unchecked",
  async (data: {
    name: string;
    plan?: "free" | "pro" | "enterprise";
    quota?: {
      maxUsers?: number;
      maxStorageBytes?: number;
      maxCollections?: number;
      maxApiRequestsPerMonth?: number;
    };
  }) => {
    const dbAdapter = guardAdmin();
    const { createTenant: fn } = await import("./tenants-actions.server");
    return fn(data, dbAdapter);
  },
);

export const updateTenant = command(
  "unchecked",
  async (data: {
    tenantId: string;
    name?: string;
    plan?: "free" | "pro" | "enterprise";
    quota?: {
      maxUsers?: number;
      maxStorageBytes?: number;
      maxCollections?: number;
      maxApiRequestsPerMonth?: number;
    };
  }) => {
    const dbAdapter = guardAdmin();
    const { updateTenant: fn } = await import("./tenants-actions.server");
    return fn(data, dbAdapter);
  },
);
