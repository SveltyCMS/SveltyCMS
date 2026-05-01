/**
 * @file src/routes/(app)/config/redirects/+page.server.ts
 * @description Server-side logic for global redirect management.
 */

import type { RequestEvent, Actions } from "@sveltejs/kit";
import { LocalCMS } from "@src/routes/api/cms";
import { dbAdapter } from "@src/databases/db";
import { error } from "@sveltejs/kit";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";

export const load = async ({ locals }: RequestEvent) => {
  const { user, tenantId } = locals;
  if (!user) throw error(401, "Unauthorized");

  if (!dbAdapter) throw error(500, "Database not initialized");

  const cms = new LocalCMS(dbAdapter, { user, tenantId });

  // Fetch redirects for this tenant
  const result = await cms.collections.find("redirects", { tenantId });

  return {
    redirects: result.success ? result.data : [],
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const { user, tenantId } = locals;
    if (!user) throw error(401, "Unauthorized");

    if (!dbAdapter) throw error(500, "Database not initialized");

    const formData = await request.formData();
    const id = formData.get("id")?.toString();
    const from = formData.get("from")?.toString();
    const to = formData.get("to")?.toString();
    const type = parseInt(formData.get("type")?.toString() || "301");
    const active = formData.get("active") === "true";
    const isRegex = formData.get("isRegex") === "on";

    const cms = new LocalCMS(dbAdapter, { user, tenantId });

    if (id) {
      await cms.collections.update("redirects", id, { from, to, type, active, isRegex });
    } else {
      await cms.collections.create("redirects", { from, to, type, active, isRegex, tenantId });
    }

    invalidateRedirectCache(tenantId as string);

    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const { user, tenantId } = locals;
    if (!user) throw error(401, "Unauthorized");

    if (!dbAdapter) throw error(500, "Database not initialized");

    const formData = await request.formData();
    const id = formData.get("id")?.toString();

    if (!id) return { success: false };

    const cms = new LocalCMS(dbAdapter, { user, tenantId });
    await cms.collections.delete("redirects", id);

    invalidateRedirectCache(tenantId as string);

    return { success: true };
  },
};
