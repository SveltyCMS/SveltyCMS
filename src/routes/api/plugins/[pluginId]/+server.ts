/**
 * @file src/routes/api/plugins/[pluginId]/+server.ts
 * @description Generic API dispatcher for plugin slot server actions (no plugin routes).
 */

import { json } from "@sveltejs/kit";
import { pluginRegistry } from "@src/plugins/registry";
import { pluginServerRegistry } from "@src/plugins/plugin-server-registry";
import { availablePlugins } from "@src/plugins/index";
import { logger } from "@utils/logger";
import type { RequestHandler } from "./$types";
import type { PluginServerModule } from "@src/plugins/types";

// Discover plugin server modules at build time (safe in +server.ts — server-only)
const _pluginServerGlob = import.meta.glob("@plugins/*/*.server.ts");

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { pluginId } = params;
  const user = locals.user;

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Primary lookup is the runtime registry (populated during the full db-boot).
  // Fallback to the statically-scanned `availablePlugins` list so plugin server
  // actions resolve even when the formal boot hasn't run yet — e.g. during
  // initial setup / test seeding, where only critical base+auth services boot.
  const plugin =
    pluginRegistry.get(pluginId) ?? availablePlugins.find((p) => p.metadata.id === pluginId);
  if (!plugin) {
    return json({ error: `Plugin not found: ${pluginId}` }, { status: 404 });
  }

  const tenantId = locals.tenantId ?? "default";
  let enabled = plugin.metadata.enabled;
  try {
    const state = await pluginRegistry.getPluginState(pluginId, tenantId);
    if (state) enabled = state.enabled;
  } catch {
    enabled = false;
  }

  if (!enabled) {
    return json({ error: `Plugin '${pluginId}' is not enabled` }, { status: 403 });
  }

  let loader = pluginServerRegistry.getLoader(pluginId);
  if (!loader) {
    // Fallback: discover via glob (for plugins that don't register server modules directly)
    const matchPath = Object.keys(_pluginServerGlob).find((p) =>
      p.includes(`/plugins/${pluginId}/`),
    );
    if (matchPath) {
      loader = _pluginServerGlob[matchPath] as () => Promise<PluginServerModule>;
      pluginServerRegistry.register(pluginId, loader);
    }
  }
  if (!loader) {
    return json({ error: `Plugin '${pluginId}' has no server actions` }, { status: 404 });
  }

  // Read `__action` from a CLONE so the original request body stays intact for
  // the action handler, which re-reads it via `request.formData()`. Consuming
  // the body here and then passing the same request to the handler causes the
  // handler's `request.formData()` to reject (body already used).
  const actionProbe = request.clone();
  const probeData = await actionProbe.formData().catch(() => null);
  const actionName =
    (probeData?.get("__action") as string) || new URL(request.url).searchParams.get("action");
  if (!actionName) {
    return json({ error: "Missing __action" }, { status: 400 });
  }

  try {
    const serverMod = await loader();
    const handler = serverMod.actions?.[actionName];
    if (!handler) {
      return json({ error: `Unknown action: ${actionName}` }, { status: 404 });
    }

    const result = await handler({
      request,
      locals: locals as Record<string, unknown>,
      params: { pluginId },
    });

    if (
      result &&
      typeof result === "object" &&
      "type" in result &&
      (result as { type: string }).type === "failure"
    ) {
      const failure = result as { status?: number; data?: Record<string, unknown> };
      return json(failure.data ?? { error: "Action failed" }, { status: failure.status ?? 400 });
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
