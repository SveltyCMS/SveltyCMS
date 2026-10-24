/**
 * @file src/routes/(admin)/admin/tenants/tenants.remote.ts
 * @description Tenant management remote functions for client-side actions.
 *
 * ### Features:
 * - Super-admin guard before every tenant mutation
 * - Delegates to tenants-actions.server for validation and adapter access
 */

import { command, getRequestEvent } from "$app/server";
import { raise } from "@utils/error-handling";

const guardAdmin = () => {
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

export const createTenant = command("unchecked", async (data: { name: string }) => {
  const dbAdapter = guardAdmin();
  const { createTenant: fn } = await import("./tenants-actions.server");
  return fn(data, dbAdapter);
});
