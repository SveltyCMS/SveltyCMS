/**
 * @file src/routes/(admin)/admin/tenants/tenants.remote.ts
 * @description Tenant management remote functions for client-side actions.
 */

import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

export const toggleTenantStatus = command(
  "unchecked",
  async (data: { tenantId: string; status: "active" | "suspended" }) => {
    const event = getRequestEvent();

    if (!event.locals.user) {
      throw error(401, "Unauthorized");
    }

    if (!event.locals.isAdmin || event.locals.user.tenantId) {
      throw error(403, "Forbidden");
    }

    const { toggleTenantStatus: fn } = await import("./tenants-actions.server");
    return fn(data);
  },
);
