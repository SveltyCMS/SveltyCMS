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
 * - Single-pass body parsing (URL/header short-circuit to avoid request.clone())
 * - Memoized server module action resolution
 * - Short-lived plugin state cache (30s TTL)
 */

import { json } from "@sveltejs/kit";
import { pluginRegistry } from "@src/plugins/registry";
import { pluginServerRegistry } from "@src/plugins/plugin-server-registry";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { AppError, handleApiError, getErrorMessage } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { RequestHandler } from "./$types";

// Module-level action cache — import() fires once per plugin, cached forever
const RESOLVED_ACTIONS = new Map<string, Record<string, Function>>();

// Short-lived state cache — plugin enabled/disabled changes infrequently (30s TTL)
const _stateCache = new Map<string, { enabled: boolean; ts: number }>();
const STATE_CACHE_TTL = 30_000; // 30 seconds

async function getCachedPluginState(pluginId: string, tenantId: string) {
  const key = `${pluginId}:${tenantId}`;
  const cached = _stateCache.get(key);
  if (cached && Date.now() - cached.ts < STATE_CACHE_TTL) {
    return cached.enabled;
  }
  try {
    const state = await pluginRegistry.getPluginState(pluginId, tenantId);
    const plugin = pluginRegistry.get(pluginId);
    const enabled = state ? state.enabled : plugin ? plugin.metadata.enabled : false;
    _stateCache.set(key, { enabled, ts: Date.now() });
    return enabled;
  } catch {
    return false;
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
      const enabled = await getCachedPluginState(pluginId, tenantId);
      if (!enabled) {
        throw new AppError(`Plugin '${pluginId}' is not enabled`, 403, "FORBIDDEN");
      }
    }

    // ── Load & cache server module actions ─────────────────────────
    let pluginActions = RESOLVED_ACTIONS.get(pluginId);
    if (!pluginActions) {
      const loader = pluginServerRegistry.getLoader(pluginId);
      if (!loader) {
        throw new AppError(`Plugin '${pluginId}' has no server actions`, 404, "NOT_FOUND");
      }
      const serverMod = await loader();
      pluginActions = serverMod.actions || {};
      RESOLVED_ACTIONS.set(pluginId, pluginActions);
    }

    // ── Fast action resolution: URL/header first (0 alloc), body fallback (1 parse) ────
    let actionName =
      new URL(originalRequest.url).searchParams.get("action") ||
      originalRequest.headers.get("x-plugin-action");
    let parsedBody: any = null;

    if (!actionName) {
      const ct = originalRequest.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        parsedBody = await originalRequest.json().catch(() => null);
        actionName = parsedBody?.__action || parsedBody?.action;
      } else {
        // FormData — parse once, extract action, keep for handler
        try {
          const fd = await originalRequest.formData();
          actionName = (fd.get("__action") as string) || null;
          parsedBody = fd;
        } catch {
          /* ignore */
        }
      }
    }

    if (!actionName) {
      throw new AppError("Missing __action or action parameter", 400, "VALIDATION_ERROR");
    }

    // ── Dispatch with pre-parsed body ──────────────────────────────
    const handler = pluginActions[actionName];
    if (!handler) {
      throw new AppError(`Unknown action: ${actionName}`, 404, "NOT_FOUND");
    }

    const result = await handler({
      request: originalRequest,
      parsedBody, // Handlers use this instead of re-parsing request
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
