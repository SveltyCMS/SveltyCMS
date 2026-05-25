/**
 * @file src/routes/(app)/config/redirects/redirects.remote.ts
 * @description Redirect Manager Remote Functions — typed CRUD without FormData boolean casting.
 *
 * Replaces: isRegex = formData.get("isRegex") === "on" → direct boolean parameter.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";

export interface RedirectRule {
  id?: string;
  from: string;
  to: string;
  type: number; // 301 | 302 | 307 | 308
  active: boolean;
  isRegex: boolean;
}

export async function saveRedirect(event: RequestEvent, rule: RedirectRule) {
  const { user, tenantId } = event.locals as any;
  if (!user) throw error(401, "Unauthorized");
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

export async function deleteRedirect(event: RequestEvent, id: string) {
  const { user, tenantId } = event.locals as any;
  if (!user) throw error(401, "Unauthorized");
  if (!dbAdapter) throw error(500, "Database not initialized");

  const cms = new LocalCMS(dbAdapter, { user, tenantId });
  await cms.collections.delete("redirects", id);
  invalidateRedirectCache(tenantId as string);

  return { success: true };
}
