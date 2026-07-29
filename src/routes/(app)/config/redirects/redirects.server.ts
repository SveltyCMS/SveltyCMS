/**
 * @file src/routes/(app)/config/redirects/redirects.server.ts
 * @description Server-side helpers for redirect CRUD.
 *
 * Storage strategy (A++):
 * - Primary store = `redirectsMV` (system table used by handle-redirects middleware)
 * - Optional mirror into content collection `redirects` for CMS-native tooling
 * - UI always uses from/to; DB uses source/target
 *
 * ### Features:
 * - admin-only + draft validation
 * - invalidate per-tenant redirect cache on mutation
 * - resilient MV upsert (insert-first, update on conflict)
 */

import { error } from "@sveltejs/kit";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { generateUUID } from "@utils/native-utils";
import { logger } from "@utils/logger";
import {
  normalizeRedirectRow,
  toRedirectPayload,
  validateRedirectDraft,
  type RedirectDraft,
} from "./redirects-utils";

export { normalizeRedirectRow };

export interface RedirectRule extends RedirectDraft {}

function requireAdmin(locals: App.Locals) {
  const user = getAuthenticatedUser(locals);
  if (!locals.isAdmin) {
    throw error(403, "Admin privileges required");
  }
  return user;
}

function tenantKey(tenantId: string | undefined | null): DatabaseId {
  return (tenantId || "default") as DatabaseId;
}

/** Map UI draft → redirects_mv row. */
function toMvRow(payload: RedirectDraft, id: string, tenantId: string | undefined) {
  return {
    _id: id as DatabaseId,
    tenantId: tenantKey(tenantId),
    source: payload.from,
    target: payload.to,
    type: payload.type ?? 301,
    isRegex: Boolean(payload.isRegex),
    active: payload.active !== false,
  };
}

/** Best-effort content-collection mirror (non-fatal if schema/collection lag). */
async function mirrorContentCollection(
  user: App.Locals["user"],
  tenantId: any,
  payload: RedirectDraft & { id?: string },
  mode: "upsert" | "delete",
): Promise<void> {
  if (!dbAdapter || !user) return;
  try {
    const cms = new LocalCMS(dbAdapter);
    const apiOpts = { user, tenantId, system: false as const };
    const storage = {
      source: payload.from,
      target: payload.to,
      from: payload.from,
      to: payload.to,
      type: payload.type,
      active: payload.active,
      isRegex: payload.isRegex,
    };
    if (mode === "delete") {
      if (payload.id) {
        await cms.collections.delete("redirects", payload.id, apiOpts as any);
      }
      return;
    }
    if (payload.id) {
      const updated = await cms.collections.update(
        "redirects",
        payload.id,
        storage,
        apiOpts as any,
      );
      if (updated && updated.success === false) {
        await cms.collections.create(
          "redirects",
          { ...storage, _id: payload.id, tenantId },
          apiOpts as any,
        );
      }
    } else {
      await cms.collections.create("redirects", { ...storage, tenantId }, apiOpts as any);
    }
  } catch (err) {
    logger.warn("[redirects] content collection mirror failed (non-fatal)", err);
  }
}

/**
 * List redirects for admin UI — prefer redirectsMV (always provisioned by migrations).
 */
export async function listRedirects(
  locals: App.Locals,
): Promise<Array<RedirectDraft & { _id?: string; id?: string }>> {
  requireAdmin(locals);
  const { tenantId } = locals as { tenantId?: string };
  if (!dbAdapter?.crud) throw error(500, "Database not initialized");

  const tid = tenantKey(tenantId);
  // Match both explicit tenant and legacy null-tenant rows when multi-tenant is off
  const filter =
    tenantId && tenantId !== "default"
      ? { tenantId: tid }
      : ({ $or: [{ tenantId: tid }, { tenantId: null }, { tenantId: "default" }] } as any);

  const result = await dbAdapter.crud.findMany<any>("redirectsMV", filter, {
    tenantId: tenantId ? tid : undefined,
    limit: 500,
  } as any);

  let rows: any[] = result.success && Array.isArray(result.data) ? result.data : [];

  // Fallback: content collection if MV empty (older installs)
  if (rows.length === 0) {
    try {
      const cms = new LocalCMS(dbAdapter);
      const user = getAuthenticatedUser(locals);
      const col = await cms.collections.find("redirects", {
        tenantId,
        user,
        limit: 500,
      });
      if (col.success && Array.isArray(col.data)) {
        rows = col.data;
      }
    } catch {
      /* collection may not exist yet */
    }
  }

  return rows.map((r) => normalizeRedirectRow(r));
}

export async function saveRedirect(
  locals: App.Locals,
  rule: RedirectRule,
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = requireAdmin(locals);
  const { tenantId } = locals as { tenantId?: string };
  if (!dbAdapter?.crud) throw error(500, "Database not initialized");

  const payload = toRedirectPayload(rule);
  const fieldErrors = validateRedirectDraft(payload);
  if (Object.keys(fieldErrors).length > 0) {
    throw error(400, Object.values(fieldErrors).join("; "));
  }

  const id = String(payload.id || generateUUID());
  const row = toMvRow(payload, id, tenantId);

  if (payload.id) {
    const updated = await dbAdapter.crud.update("redirectsMV", id as DatabaseId, row as any, {
      tenantId: tenantKey(tenantId),
    });
    if (!updated.success) {
      const inserted = await dbAdapter.crud.insert("redirectsMV", row as any, {
        tenantId: tenantKey(tenantId),
      });
      if (!inserted.success) {
        throw error(400, inserted.message || "Failed to save redirect");
      }
    }
  } else {
    const inserted = await dbAdapter.crud.insert("redirectsMV", row as any, {
      tenantId: tenantKey(tenantId),
    });
    if (!inserted.success) {
      // Unique race — try update
      const updated = await dbAdapter.crud.update("redirectsMV", id as DatabaseId, row as any, {
        tenantId: tenantKey(tenantId),
      });
      if (!updated.success) {
        throw error(400, inserted.message || "Failed to create redirect");
      }
    }
  }

  await mirrorContentCollection(user, tenantId, { ...payload, id }, "upsert");
  invalidateRedirectCache(tenantId as string);
  return { success: true, id };
}

export async function deleteRedirect(
  locals: App.Locals,
  id: string,
): Promise<{ success: boolean }> {
  const user = requireAdmin(locals);
  const { tenantId } = locals as { tenantId?: string };
  if (!dbAdapter?.crud) throw error(500, "Database not initialized");
  if (!id || typeof id !== "string") {
    throw error(400, "Redirect id is required");
  }

  await dbAdapter.crud.delete("redirectsMV", id as DatabaseId, {
    tenantId: tenantKey(tenantId),
  });
  await mirrorContentCollection(
    user,
    tenantId,
    { id, from: "", to: "", type: 301, active: false, isRegex: false },
    "delete",
  );
  invalidateRedirectCache(tenantId as string);
  return { success: true };
}
