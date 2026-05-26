/**
 * @file src/routes/(app)/config/redirects/+page.server.ts
 * @description Server-side logic for global redirect management.
 */

import type { RequestEvent, Actions } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { error } from "@sveltejs/kit";
import { saveRedirect, deleteRedirect } from "./redirects.server";

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
    const fd = await request.formData();
    return saveRedirect(locals as any, {
      id: fd.get("id")?.toString(),
      from: fd.get("from")?.toString() || "",
      to: fd.get("to")?.toString() || "",
      type: parseInt(fd.get("type")?.toString() || "301"),
      active: fd.get("active") === "true",
      isRegex: fd.get("isRegex") === "on",
    });
  },

  delete: async ({ request, locals }) => {
    const fd = await request.formData();
    return deleteRedirect(locals as any, fd.get("id")?.toString() || "");
  },
};
