/**
 * @file src/routes/(app)/config/redirects/redirects.server.ts
 * @description Server-side helpers for redirect CRUD, extracted from redirects.remote.ts.
 *
 * ### Features:
 * - save (upsert) a redirect rule via LocalCMS
 * - delete a redirect rule via LocalCMS
 * - invalidates the per-tenant redirect cache on every mutation
 */

import { error } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { getAuthenticatedUser } from "@utils/page-guards.server";

export interface RedirectRule {
  id?: string;
  from: string;
  to: string;
  type: number; // 301 | 302 | 307 | 308
  active: boolean;
  isRegex: boolean;
}

export async function saveRedirect(
  locals: App.Locals,
  rule: RedirectRule,
): Promise<{ success: boolean }> {
  const user = getAuthenticatedUser(locals);
  const { tenantId } = locals as any;
  if (!dbAdapter) throw error(500, "Database not initialized");

  const cms = new LocalCMS(dbAdapter, { user, tenantId });

  if (rule.id) {
    await cms.collections.update("redirects", rule.id, {
      from: rule.from,
      to: rule.to,
      type: rule.type,
      active: rule.active,
      isRegex: rule.isRegex,
    });
  } else {
    await cms.collections.create("redirects", {
      from: rule.from,
      to: rule.to,
      type: rule.type,
      active: rule.active,
      isRegex: rule.isRegex,
      tenantId,
    });
  }

  invalidateRedirectCache(tenantId as string);
  return { success: true };
}

export async function deleteRedirect(
  locals: App.Locals,
  id: string,
): Promise<{ success: boolean }> {
  const user = getAuthenticatedUser(locals);
  const { tenantId } = locals as any;
  if (!dbAdapter) throw error(500, "Database not initialized");

  const cms = new LocalCMS(dbAdapter, { user, tenantId });
  await cms.collections.delete("redirects", id);
  invalidateRedirectCache(tenantId as string);

  return { success: true };
}
