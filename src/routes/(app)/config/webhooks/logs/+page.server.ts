/**
 * @file src/routes/(app)/config/webhooks/logs/+page.server.ts
 * @description Admin-only gate for webhook delivery logs / DLQ page.
 */

import { error, isHttpError } from "@sveltejs/kit";
import { requireAdminPage } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    requireAdminPage(locals, "webhook logs");
    return { isAdmin: true };
  } catch (err) {
    if (isHttpError(err)) throw err;
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
