/**
 * @file src/routes/(app)/config/redirects/+page.server.ts
 * @description Server-side logic for global redirect management.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { error } from "@sveltejs/kit";

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
