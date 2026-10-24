/**
 * @file src/routes/(admin)/admin/+page.server.ts
 * @description
 * Server-side guard for the system administration landing page.
 * Only super-admins (system admins without a tenant binding) may see the page.
 *
 * ### Features:
 * - Fail-closed authorization before rendering admin navigation
 * - No database access — the landing page only links to admin sections
 */

import { redirect } from "@sveltejs/kit";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

// Only System Admins can access this
export const load: PageServerLoad = async ({ locals }) => {
  const user = getAuthenticatedUser(locals);
  // Tenant-bound admins are not system admins — send them back to their own surface.
  if (!locals.isAdmin || user.tenantId) throw redirect(303, "/");
};
