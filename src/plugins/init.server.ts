/**
 * @file src/plugins/init.server.ts
 * @description Server-only plugin boot: settings service wiring + plugin registration.
 *
 * Features:
 * - owns the settings-service factory (`PluginSettingsService`), which pulls
 *   node:crypto — kept out of the browser-reachable `./index` barrel on purpose
 * - registers every plugin, resolves parts for enabled ones, runs migrations
 * - one findMany for the effective enablement map
 */

import { logger } from "@utils/logger";
import { availablePlugins, pluginRegistry, pluginServerRegistry } from "./index";
import { PluginSettingsService } from "./settings";
import type { IDBAdapter } from "@databases/db-interface";
import type { PluginServerModule } from "./types";

// 🚀 SERVER-MODULE GLOB: a LITERAL `import.meta.glob` so Vite/Rolldown bundles
// every plugin's `index.server.ts` as a lazy chunk. The template-literal form
// `import(`./${pluginId}/index.server`)` is not statically analyzable — the
// bundler globs `./**/*/index.server`, matches nothing (warning), and the
// module 404s in production builds (dev-only behavior). The loaders are also
// registered into `pluginServerRegistry` so `registry.ts` (browser-reachable)
// can resolve them without pulling server code into the client graph.
//
// `import.meta.glob` is a Vite-only transform: it is `undefined` under the Bun
// test runner and plain `bun run`, where the glob yields no loaders. That leaves
// `pluginServerRegistry` empty and breaks *lazy* plugin activation there —
// `registry.activatePlugin()` would find no server module and skip the plugin's
// migrations, so plugin-owned collections are never provisioned in-process. The
// `registerRuntimeServerModules()` fallback below restores that path.
const pluginServerModules: Record<string, () => Promise<unknown>> = (() => {
  try {
    const glob = (import.meta as { glob?: unknown }).glob;
    if (typeof glob === "function") {
      return (glob as (p: string) => Record<string, () => Promise<unknown>>)("./*/index.server.ts");
    }
  } catch {
    /* not a Vite runtime — handled by the runtime fallback */
  }
  return {};
})();

for (const [path, loader] of Object.entries(pluginServerModules)) {
  const id = path.replace(/^\.\/(.*)\/index\.server\.ts$/, "$1");
  pluginServerRegistry.register(id, loader as () => Promise<PluginServerModule>);
}

/**
 * Registers `index.server` loaders when the Vite glob is unavailable (Bun test /
 * Node CLI). Enumerates every `<dir>/index.server.ts` under `src/plugins` on disk
 * and registers a lazy `import()` per plugin. The computed specifier carries
 * `@vite-ignore` so the production bundler leaves it alone — there the glob above
 * is the path. Built by CONCATENATION, not a template literal: esbuild glob-
 * analyzes `import(\`./${id}/index.server\`)` during the worker-bundling hook,
 * matches nothing (`empty-glob` warning — the real files carry the `.ts`
 * extension) and the warning pollutes every build. A non-literal specifier is
 * skipped by that analysis; the runtime import resolves identically.
 * Best-effort and idempotent: already-registered ids are skipped.
 */
async function registerRuntimeServerModules(): Promise<void> {
  if (Object.keys(pluginServerModules).length > 0) return;
  // Server-only module: a Node/Bun runtime is the precondition, not the browser
  // `window` probe — test setups (jsdom) define `window` in-process.
  if (typeof process === "undefined" || !process.versions?.node) return;
  try {
    const { readdirSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const pluginsDir = join(process.cwd(), "src/plugins");
    if (!existsSync(pluginsDir)) return;

    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || pluginServerRegistry.has(entry.name)) continue;
      if (!existsSync(join(pluginsDir, entry.name, "index.server.ts"))) continue;
      const id = entry.name;
      const specifier = "./" + id + "/index.server";
      pluginServerRegistry.register(id, () =>
        import(/* @vite-ignore */ specifier).then((mod) => mod as PluginServerModule),
      );
    }
    logger.debug("[PluginServerRegistry] Registered runtime server-module loaders");
  } catch (err) {
    logger.debug(
      `[PluginServerRegistry] Runtime loader fallback unavailable: ${(err as Error).message}`,
    );
  }
}

// The registry is browser-reachable and must not import the service module itself
// (node:crypto in the client bundle); it receives a factory instead. Registered at
// module load so the lazy path in `registry.togglePlugin()` works too.
pluginRegistry.setSettingsServiceFactory(
  (dbAdapter: IDBAdapter) => new PluginSettingsService(dbAdapter),
);

/**
 * Initialize plugin system
 * Registers all plugins and runs migrations
 *
 * Called during server startup from src/databases/db.ts
 */
export async function initializePlugins(dbAdapter: any, tenantId = "default"): Promise<void> {
  try {
    logger.info("🔌 Initializing plugin system...");

    // 0. Ensure server-module loaders exist when the Vite glob was unavailable
    //    (bun test / Node CLI) — otherwise enabled plugins get no migrations.
    await registerRuntimeServerModules();

    // 1. Initialize settings service
    await pluginRegistry.initializeSettings(dbAdapter);

    // 1.5 Resolve effective enablement in ONE findMany (warms the L1 cache) —
    // DB state wins, else the plugin's static `metadata.enabled` default.
    const pluginStates = await pluginRegistry.getAllPluginStates(tenantId);
    const enabledById = new Map(pluginStates.map((s) => [String(s.pluginId), s.enabled === true]));
    const defaultEnabledById = new Map(
      availablePlugins.map((p) => [p.metadata.id, p.metadata.enabled !== false]),
    );
    const isEnabled = (id: string): boolean =>
      enabledById.has(id) ? enabledById.get(id) === true : (defaultEnabledById.get(id) ?? false);

    // 2. Register all available plugins. Only ENABLED plugins get their server
    //    module merged, parts resolved, and migrations run — default-disabled
    //    plugins (commerce, stripe, …) stay inert until `togglePlugin` activates
    //    them lazily. `register` still runs for every plugin so the admin list,
    //    `pluginRegistry.get()`, and metadata capabilities stay consistent.
    const maxConcurrency = parseInt(process.env.EXTENSIONS_STORAGE_MAX_CONCURRENCY || "5", 10);
    const activeIds = new Set<string>();

    for (let i = 0; i < availablePlugins.length; i += maxConcurrency) {
      const chunk = availablePlugins.slice(i, i + maxConcurrency);
      await Promise.all(
        chunk.map(async (plugin) => {
          const pluginId = plugin.metadata.id;
          const active = isEnabled(pluginId);
          if (active) activeIds.add(pluginId);

          try {
            if (active) {
              const loader = pluginServerRegistry.getLoader(pluginId);
              if (loader) {
                const serverMod = await loader();
                if (serverMod.hooks) {
                  plugin.hooks = { ...plugin.hooks, ...serverMod.hooks };
                }
                if (
                  (!plugin.migrations || plugin.migrations.length === 0) &&
                  serverMod.migrations
                ) {
                  plugin.migrations = serverMod.migrations;
                }
              }
            }
          } catch {
            /* UI-only plugin — no index.server.ts */
          }
          await pluginRegistry.register(plugin);

          // Resolve discriminated-union parts (schema, routes, capabilities, settings, etc.)
          // for active plugins only. Disabled plugins resolve lazily on enable.
          if (active) {
            pluginRegistry.resolveParts(plugin);
          }
        }),
      );
    }

    // 3. Run migrations for enabled plugins only
    await pluginRegistry.runAllMigrations(dbAdapter, tenantId, activeIds);

    // 3.5 Reconcile plugin capabilities into merged catalog
    await pluginRegistry.reconcileCapabilities();

    // 4. Mark as initialized
    pluginRegistry.markInitialized();

    logger.info("✅ Plugin system initialized");
  } catch (error) {
    logger.error("💥 Failed to initialize plugin system", { error });
    // 🚀 HARDENING: Throw the error to stop the boot process if plugins fail.
    // Incomplete migrations lead to inconsistent state and 500 errors.
    throw error;
  }
}
