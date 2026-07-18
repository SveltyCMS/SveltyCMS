/**
 * @file src/routes/(app)/config/redirects/redirects.server.ts
 * @description Server-side helpers for redirect CRUD, extracted from redirects.remote.ts.
 *
 * ### Features:
 * - save (upsert) a redirect rule via LocalCMS
 * - delete a redirect rule via LocalCMS
 * - invalidates the per-tenant redirect cache on every mutation
 * - admin-only + draft validation
 */

import { error } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { toRedirectPayload, validateRedirectDraft, type RedirectDraft } from "./redirects-utils";

export interface RedirectRule extends RedirectDraft {}

function requireAdmin(locals: App.Locals) {
  const user = getAuthenticatedUser(locals);
  if (!locals.isAdmin) {
    throw error(403, "Admin privileges required");
  }
  return user;
}

export async function saveRedirect(
  locals: App.Locals,
  rule: RedirectRule,
): Promise<{ success: boolean; error?: string }> {
  const user = requireAdmin(locals);
  const { tenantId } = locals as { tenantId?: string };
  if (!dbAdapter) throw error(500, "Database not initialized");

  const payload = toRedirectPayload(rule);
  const fieldErrors = validateRedirectDraft(payload);
  if (Object.keys(fieldErrors).length > 0) {
    const message = Object.values(fieldErrors).join("; ");
    throw error(400, message);
  }

  const cms = new LocalCMS(dbAdapter, { user, tenantId });

  if (payload.id) {
    await cms.collections.update("redirects", payload.id, {
      from: payload.from,
      to: payload.to,
      type: payload.type,
      active: payload.active,
      isRegex: payload.isRegex,
    });
  } else {
    await cms.collections.create("redirects", {
      from: payload.from,
      to: payload.to,
      type: payload.type,
      active: payload.active,
      isRegex: payload.isRegex,
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
  const user = requireAdmin(locals);
  const { tenantId } = locals as { tenantId?: string };
  if (!dbAdapter) throw error(500, "Database not initialized");
  if (!id || typeof id !== "string") {
    throw error(400, "Redirect id is required");
  }

  const cms = new LocalCMS(dbAdapter, { user, tenantId });
  await cms.collections.delete("redirects", id);
  invalidateRedirectCache(tenantId as string);

  return { success: true };
}
