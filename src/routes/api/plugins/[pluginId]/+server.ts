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
 * - Unified error handling via AppError + handleApiError
 * - Request body cloning to avoid "body already used" errors
 */

import { json } from "@sveltejs/kit";
import { pluginRegistry } from "@src/plugins/registry";
import { pluginServerRegistry } from "@src/plugins/plugin-server-registry";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { AppError, handleApiError, getErrorMessage } from "@utils/error-handling";
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
  try {
    const { pluginId } = params;
    const user = locals.user;

    if (!user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    // ── Plugin Resolution ──────────────────────────────────────────
    const uiPlugin = pluginRegistry.get(pluginId);
    const hasServerActions = !!pluginServerRegistry.getLoader(pluginId);

    if (!uiPlugin && !hasServerActions) {
      throw new AppError(`Plugin not found: ${pluginId}`, 404, "NOT_FOUND");
    }

    // ── Permission Check ───────────────────────────────────────────
    const roles = (locals.roles as any[]) || [];
    if (!user.isAdmin && !hasPermissionWithRoles(user as any, "plugins:execute", roles)) {
      throw new AppError("Insufficient permissions to execute plugin actions", 403, "FORBIDDEN");
    }

    // ── Enabled State Check (UI plugins only) ──────────────────────
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
        throw new AppError(`Plugin '${pluginId}' is not enabled`, 403, "FORBIDDEN");
      }
    }

    // ── Load Server Module ─────────────────────────────────────────
    const loader = pluginServerRegistry.getLoader(pluginId);
    if (!loader) {
      throw new AppError(`Plugin '${pluginId}' has no server actions`, 404, "NOT_FOUND");
    }

    // ── Extract Action Name ────────────────────────────────────────
    const clonedRequest = originalRequest.clone();
    const actionName =
      (await extractActionName(clonedRequest)) ||
      new URL(originalRequest.url).searchParams.get("action");

    if (!actionName) {
      throw new AppError("Missing __action or action parameter", 400, "VALIDATION_ERROR");
    }

    // ── Dispatch ────────────────────────────────────────────────────
    const serverMod = await loader();
    const handler = serverMod.actions?.[actionName];

    if (!handler) {
      throw new AppError(`Unknown action: ${actionName}`, 404, "NOT_FOUND");
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
    logger.error(`[PluginAPI] ${params.pluginId} action failed: ${getErrorMessage(err)}`);
    return handleApiError(err, {
      params,
      request: originalRequest,
      locals,
    } as any);
  }
};
