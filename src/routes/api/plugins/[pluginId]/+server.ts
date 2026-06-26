/**
 * @file src/routes/api/plugins/[pluginId]/+server.ts
 * @description Smart API dispatcher for plugin slot server actions.
 *
 * Supports both FormData and JSON request bodies. Resolves plugins from the UI
 * registry (pluginRegistry) and falls back to server-only plugins (pluginServerRegistry)
 * that have no UI metadata but expose server actions.
 *
 * ### Features:
 * - Dual body parsing (FormData + JSON)
 * - Server-only plugin action dispatch (no UI metadata required)
 * - Role-based permission gating via hasPermissionWithRoles
 * - Request body cloning to avoid "body already used" errors
 */

import { json } from "@sveltejs/kit";
import { pluginRegistry } from "@src/plugins/registry";
import { pluginServerRegistry } from "@src/plugins/plugin-server-registry";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { logger } from "@utils/logger";
import type { RequestHandler } from "./$types";

/**
 * Extracts the action name from the request body.
 * Supports both FormData (multipart) and JSON (application/json) payloads.
 */
async function extractActionName(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      return (body.__action || body.action) as string | null;
    } catch {
      return null;
    }
  }

  // Default: parse as FormData (multipart or urlencoded)
  try {
    const formData = await request.formData();
    return (formData.get("__action") as string) || null;
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ params, request: originalRequest, locals }) => {
  const { pluginId } = params;
  const user = locals.user;

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Plugin Resolution ──────────────────────────────────────────────
  // Resolve from UI registry first, then check server-only registry
  const uiPlugin = pluginRegistry.get(pluginId);
  const hasServerActions = !!pluginServerRegistry.getLoader(pluginId);

  if (!uiPlugin && !hasServerActions) {
    return json({ error: `Plugin not found: ${pluginId}` }, { status: 404 });
  }

  // ── Permission Check ───────────────────────────────────────────────
  const roles = (locals.roles as any[]) || [];
  if (!user.isAdmin && !hasPermissionWithRoles(user as any, "plugins:execute", roles)) {
    return json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  // ── Enabled State Check (UI plugins only) ──────────────────────────
  const tenantId = (locals.tenantId as string) ?? "default";

  if (uiPlugin) {
    let enabled = uiPlugin.metadata.enabled;
    try {
      const state = await pluginRegistry.getPluginState(pluginId, tenantId);
      if (state) enabled = state.enabled;
    } catch {
      enabled = false;
    }

    if (!enabled) {
      return json({ error: `Plugin '${pluginId}' is not enabled` }, { status: 403 });
    }
  }

  // ── Load Server Module ─────────────────────────────────────────────
  const loader = pluginServerRegistry.getLoader(pluginId);
  if (!loader) {
    return json({ error: `Plugin '${pluginId}' has no server actions` }, { status: 404 });
  }

  // ── Extract Action Name ────────────────────────────────────────────
  // Clone before parsing to preserve the original for the handler
  const clonedRequest = originalRequest.clone();
  const actionName =
    (await extractActionName(clonedRequest)) ||
    new URL(originalRequest.url).searchParams.get("action");

  if (!actionName) {
    return json({ error: "Missing __action or action parameter" }, { status: 400 });
  }

  // ── Dispatch ────────────────────────────────────────────────────────
  try {
    const serverMod = await loader();
    const handler = serverMod.actions?.[actionName];

    if (!handler) {
      return json({ error: `Unknown action: ${actionName}` }, { status: 404 });
    }

    const result = await handler({
      request: originalRequest,
      locals: locals as unknown as Record<string, unknown>,
      params: { pluginId },
    });

    // Standardized failure envelope support
    if (
      result &&
      typeof result === "object" &&
      "type" in result &&
      (result as { type: string }).type === "failure"
    ) {
      const failure = result as {
        status?: number;
        data?: Record<string, unknown>;
      };
      return json(failure.data ?? { error: "Action failed" }, {
        status: failure.status ?? 400,
      });
    }

    return json(result ?? { success: true });
  } catch (err) {
    logger.error(`[PluginAPI] ${pluginId}/${actionName} failed:`, err);
    const message = err instanceof Error ? err.message : "Plugin action failed";
    const status =
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof (err as { status: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return json({ error: message }, { status });
  }
};
