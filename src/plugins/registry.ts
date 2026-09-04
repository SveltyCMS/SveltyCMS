/**
 * @file src/plugins/registry.ts
 * @description
 * Central registry for managing CMS plugins.
 *
 * Responsibilities include:
 * - Registering available plugins.
 * - Initializing settings and running migrations.
 * - Managing lifecycle and SSR hooks.
 *
 * ### Features:
 * - plugin registration
 * - migrations management
 * - hook resolution
 */

import type { DatabaseResult, IDBAdapter } from "@databases/db-interface";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import { PluginSettingsService } from "./settings";
import { capabilityRegistry } from "@src/services/security/capability-registry";
import { registerSugarType } from "@src/widgets/desugar-field";
import { pluginRouteRegistry } from "./plugin-route-registry";
import type { PluginCapability } from "./types";
import type {
  IPluginService,
  Plugin,
  PluginLifecycleHooks,
  PluginMigrationRecord,
  PluginPart,
  PluginRegistryEntry,
  PluginSSRHook,
} from "./types";

export class PluginRegistry implements IPluginService {
  private readonly plugins: Map<string, PluginRegistryEntry> = new Map();
  private settingsService: PluginSettingsService | null = null;
  private initialized = false;

  // 🚀 WRITE-PATH CACHE: getAll() allocates a mapped array per call and the
  // SDK write path (triggerLifecycleHook) calls it twice per mutation. Plugins
  // register at boot (overwrites in place), so cache until the next register.
  private _allPlugins: Plugin[] | null = null;
  private _hookPresence = new Map<string, boolean>();

  // Register a new plugin
  async register(plugin: Plugin): Promise<DatabaseResult<void>> {
    try {
      if (this.plugins.has(plugin.metadata.id)) {
        logger.debug(`Plugin ${plugin.metadata.id} is already registered. Overwriting.`);
      }

      this.plugins.set(plugin.metadata.id, {
        plugin,
        registeredAt: nowISODateString(),
      });

      // Invalidate cached views (plugin set changed at boot / hot reload)
      this._allPlugins = null;
      this._hookPresence.clear();

      // Register plugin capabilities into the merged catalog
      if (plugin.metadata.capabilities && plugin.metadata.capabilities.length > 0) {
        capabilityRegistry.registerPlugin(plugin.metadata.id, plugin.metadata.capabilities);
      }

      logger.debug(
        `🔌 Plugin registered: ${plugin.metadata.name} (${plugin.metadata.id}) v${plugin.metadata.version}`,
      );

      return { success: true, data: undefined };
    } catch (error) {
      logger.error(`Failed to register plugin ${plugin.metadata.id}`, {
        error,
      });
      return {
        success: false,
        message: `Failed to register plugin ${plugin.metadata.id}`,
        error: {
          code: "REGISTRATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Get all registered plugins
  getAll(): Plugin[] {
    if (!this._allPlugins) {
      this._allPlugins = Array.from(this.plugins.values()).map((entry) => entry.plugin);
    }
    return this._allPlugins;
  }

  /**
   * Cached check for lifecycle-hook presence — the SDK write path calls this
   * on every create/update; without caching it builds the plugin array and
   * walks every plugin's hooks per mutation.
   */
  hasAnyHook(hookName: keyof PluginLifecycleHooks): boolean {
    const cached = this._hookPresence.get(hookName);
    if (cached !== undefined) return cached;
    const found = this.getAll().some((p) => typeof (p.hooks as any)?.[hookName] === "function");
    this._hookPresence.set(hookName, found);
    return found;
  }

  // Get a specific plugin by ID
  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  // Initialize the plugin settings service
  async initializeSettings(dbAdapter: IDBAdapter): Promise<void> {
    this.settingsService = new PluginSettingsService(dbAdapter);
    await this.settingsService.initialize();
  }

  // Run pending migrations for a specific plugin
  async runMigrations(
    pluginId: string,
    dbAdapter: IDBAdapter,
    tenantId: string,
  ): Promise<DatabaseResult<void>> {
    try {
      const entry = this.plugins.get(pluginId);
      if (!entry) {
        return {
          success: false,
          message: `Plugin ${pluginId} not found`,
          error: { code: "NOT_FOUND", message: `Plugin ${pluginId} not found` },
        };
      }

      const plugin = entry.plugin;

      // 🚀 DYNAMIC RESOLUTION: If migrations aren't static, try to resolve via .server module
      let migrations = plugin.migrations;
      if (!migrations || migrations.length === 0) {
        try {
          const serverMod = await import(`./${pluginId}/index.server`);
          migrations = serverMod.migrations || [];
        } catch {
          // No server module for this plugin, normal if plugin is UI-only
        }
      }

      if (!migrations || migrations.length === 0) {
        return { success: true, data: undefined };
      }

      // Ensure metadata/migrations table exists
      await this.ensureMigrationTable(dbAdapter);

      // Get applied migrations
      const appliedResult = await this.getAppliedMigrations(dbAdapter, pluginId, tenantId);
      const appliedIds = new Set(
        appliedResult.success ? appliedResult.data.map((m) => m.migrationId) : [],
      );

      // Sort and run pending migrations
      const pending = migrations
        .filter((m) => !appliedIds.has(m.id))
        .sort((a, b) => a.version - b.version);

      for (const migration of pending) {
        logger.debug(
          `📝 Running plugin migration: ${pluginId} -> ${migration.id} (v${migration.version})`,
        );
        await migration.up(dbAdapter);
        await this.recordMigration(dbAdapter, pluginId, migration.id, migration.version, tenantId);
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error(`Failed to run migrations for plugin ${pluginId}`, {
        error,
      });
      return {
        success: false,
        message: `Failed to run migrations for plugin ${pluginId}`,
        error: {
          code: "MIGRATION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Run migrations for all registered plugins
  async runAllMigrations(
    dbAdapter: IDBAdapter,
    tenantId: string,
    pluginIds?: Iterable<string>,
  ): Promise<DatabaseResult<void>> {
    try {
      const ids = pluginIds ? new Set(pluginIds) : null;
      logger.debug(
        `🚀 Running pending plugin migrations (${ids ? `${ids.size} enabled` : "all registered"})...`,
      );

      for (const pluginId of this.plugins.keys()) {
        if (ids && !ids.has(pluginId)) continue;
        const result = await this.runMigrations(pluginId, dbAdapter, tenantId);
        if (!result.success) {
          logger.error(`Migration failed for plugin ${pluginId}`, {
            error: result.error,
          });
        }
      }

      logger.info("✅ All plugin migrations checked/completed");
      return { success: true, data: undefined };
    } catch (error) {
      logger.error("Failed to run all plugin migrations", { error });
      return {
        success: false,
        message: "Failed to run all migrations",
        error: {
          code: "MIGRATION_RUNNER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Get SSR hooks for plugins enabled on a collection
  async getSSRHooks(
    collectionId: string,
    tenantId?: string | null,
    schema?: any,
  ): Promise<PluginSSRHook[]> {
    const hooks: PluginSSRHook[] = [];
    const activeTenantId = tenantId || "default";

    for (const entry of this.plugins.values()) {
      const plugin = entry.plugin;

      // Check if plugin is enabled for this collection
      if (
        !(await this.isEnabledForCollection(
          plugin.metadata.id,
          collectionId,
          activeTenantId,
          schema,
        ))
      ) {
        continue;
      }

      let ssrHook = plugin.ssrHook;
      if (!ssrHook) {
        try {
          const serverMod = await import(`./${plugin.metadata.id}/index.server`);
          ssrHook = serverMod.ssrHook;
        } catch {
          // No server hook
        }
      }

      if (!ssrHook) {
        continue;
      }

      hooks.push(ssrHook);
    }

    return hooks;
  }

  // Get Lifecycle hooks for enabled plugins on a collection
  async getLifecycleHooks<K extends keyof import("./types").PluginLifecycleHooks>(
    collectionId: string,
    hookName: K,
    tenantId?: string | null,
    schema?: any,
  ): Promise<Exclude<import("./types").PluginLifecycleHooks[K], undefined>[]> {
    const hooks: Exclude<import("./types").PluginLifecycleHooks[K], undefined>[] = [];
    const activeTenantId = tenantId || "default";

    for (const entry of this.plugins.values()) {
      const plugin = entry.plugin;

      // Check if plugin is enabled for this collection
      if (
        !(await this.isEnabledForCollection(
          plugin.metadata.id,
          collectionId,
          activeTenantId,
          schema,
        ))
      ) {
        continue;
      }

      if (plugin.hooks?.[hookName]) {
        hooks.push(
          plugin.hooks[hookName] as Exclude<import("./types").PluginLifecycleHooks[K], undefined>,
        );
      }
    }

    return hooks;
  }

  /**
   * Run afterAuthenticate hooks across all enabled plugins.
   *
   * Auth hooks fire on every successful login regardless of collection state.
   * Plugins must be globally enabled.
   *
   * @returns The first deny result (blocking), or the first requires2FA result,
   *          or null if no plugin intervenes.
   */
  async runAuthHooks(
    event: import("./types").AuthHookEvent,
  ): Promise<import("./types").AuthHookResult | null> {
    let requires2FA = false;

    for (const entry of this.plugins.values()) {
      const plugin = entry.plugin;
      if (!plugin.metadata.enabled) continue;

      const hooks = plugin.hooks;
      if (!hooks?.afterAuthenticate) continue;

      try {
        const result = await hooks.afterAuthenticate(event);
        if (!result) continue;

        // Deny takes immediate priority — block the login
        if (result.deny) {
          logger.warn(`[PluginRegistry] Auth denied by plugin "${plugin.metadata.id}"`, {
            userId: String(event.user._id),
            message: result.message,
          });
          return { deny: true, message: result.message || "Access denied by security policy." };
        }

        // Requires2FA can be raised by any plugin
        if (result.requires2FA) {
          requires2FA = true;
          logger.info(`[PluginRegistry] 2FA required by plugin "${plugin.metadata.id}"`, {
            userId: String(event.user._id),
          });
        }
      } catch (err: any) {
        // Fail-open for auth hooks — a broken plugin should not block login
        logger.error(`[PluginRegistry] afterAuthenticate hook failed for "${plugin.metadata.id}"`, {
          error: err.message,
          userId: String(event.user._id),
        });
      }
    }

    return requires2FA ? { requires2FA: true } : null;
  }

  // Check if a plugin is enabled for a specific collection and tenant
  async isEnabledForCollection(
    pluginId: string,
    collectionId: string,
    tenantId?: string | null,
    schema?: any,
  ): Promise<boolean> {
    const plugin = this.get(pluginId);
    if (!plugin) {
      return false;
    }

    // 1. Check persistent state
    let enabled = plugin.metadata.enabled; // Default from metadata

    if (this.settingsService && tenantId) {
      const state = await this.settingsService.getPluginState(pluginId, tenantId);
      if (state) {
        enabled = state.enabled;
      }
    }

    if (!enabled) {
      return false;
    }

    // 2. Check enabledCollections whitelist in plugin metadata (global lock)
    if (
      plugin.enabledCollections &&
      plugin.enabledCollections.length > 0 &&
      !plugin.enabledCollections.includes(collectionId)
    ) {
      return false;
    }

    // 3. Check schema-level overrides if provided (granular override)
    if (schema?.plugins) {
      return schema.plugins.includes(pluginId);
    }

    return true;
  }

  // Get state for a specific plugin and tenant
  async getPluginState(pluginId: string, tenantId: string) {
    if (!this.settingsService) {
      logger.warn("PluginSettingsService not initialized");
      return null;
    }
    return await this.settingsService.getPluginState(pluginId, tenantId);
  }

  /** One findMany for every plugin state in a tenant (layout / feature gates). */
  async getAllPluginStates(tenantId: string) {
    if (!this.settingsService) {
      return [];
    }
    return this.settingsService.getAllPluginStates(tenantId);
  }

  // Toggle a plugin's enabled state
  async togglePlugin(
    pluginId: string,
    enabled: boolean,
    tenantId: string,
    userId?: string,
    dbAdapter?: IDBAdapter,
  ): Promise<boolean> {
    // Lazy-init: callers outside the boot path (e.g. the testing-API website-
    // starter seed) may hold a registry instance whose settingsService was
    // never wired — initializeSettings is idempotent (probe + sentinel insert).
    // The adapter must be passed in: this module is client-shared (plugin page),
    // so it cannot statically import the server-only db.ts.
    if (!this.settingsService && dbAdapter) {
      try {
        await this.initializeSettings(dbAdapter);
      } catch (err) {
        logger.warn(`togglePlugin lazy-init failed: ${(err as Error).message}`);
      }
    }
    if (!this.settingsService) {
      logger.warn("PluginSettingsService not initialized");
      return false;
    }

    // Lazy activation: boot only loads default-enabled plugins, so enabling a
    // disabled plugin here must also wire its server module, parts, and
    // migrations — otherwise the plugin stays enabled-but-inert until reboot.
    if (enabled) {
      await this.activatePlugin(pluginId, tenantId, dbAdapter);
    }

    return await this.settingsService.setPluginState(pluginId, tenantId, enabled, userId);
  }

  /**
   * Wire a plugin that was previously inactive: merge its `index.server`
   * hooks/migrations, resolve structured parts (routes, capabilities, sugar
   * types, settings), and run pending migrations. Idempotent — safe to re-run
   * when a plugin is toggled on more than once.
   */
  private async activatePlugin(
    pluginId: string,
    tenantId: string,
    dbAdapter?: IDBAdapter,
  ): Promise<void> {
    const plugin = this.plugins.get(pluginId)?.plugin;
    if (!plugin) {
      logger.warn(`[PluginRegistry] Cannot activate unknown plugin "${pluginId}"`);
      return;
    }

    // Merge server module (hooks/migrations) if not already merged at boot.
    if (!plugin.hooks || !plugin.migrations || plugin.migrations.length === 0) {
      try {
        const serverMod = await import(`./${pluginId}/index.server`);
        if (serverMod.hooks) {
          plugin.hooks = { ...plugin.hooks, ...serverMod.hooks };
        }
        if ((!plugin.migrations || plugin.migrations.length === 0) && serverMod.migrations) {
          plugin.migrations = serverMod.migrations;
        }
      } catch {
        /* UI-only plugin — no index.server.ts */
      }
    }

    this.resolveParts(plugin);

    if (dbAdapter) {
      const result = await this.runMigrations(pluginId, dbAdapter, tenantId);
      if (!result.success) {
        logger.error(`[PluginRegistry] Lazy migration failed for "${pluginId}"`, {
          error: result.error,
        });
      }
    }
  }

  // Mark registry as initialized
  markInitialized() {
    this.initialized = true;
  }

  // Check if registry is initialized
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // Plugin Settings (encrypted, per-tenant)
  // ============================================================================

  /**
   * Get settings for a plugin (secrets masked, safe for API).
   */
  async getPluginSettings(
    pluginId: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.settingsService) return null;
    const plugin = this.get(pluginId);
    return this.settingsService.getPluginSettings(pluginId, tenantId, plugin?.settings);
  }

  /**
   * Get decrypted settings for server-side plugin consumption.
   * NEVER send this to the browser.
   */
  async getDecryptedSettings(
    pluginId: string,
    tenantId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.settingsService) return null;
    const plugin = this.get(pluginId);
    return this.settingsService.getDecryptedSettings(pluginId, tenantId, plugin?.settings);
  }

  /**
   * Save plugin settings (encrypts secrets, preserves existing).
   */
  async savePluginSettings(
    pluginId: string,
    tenantId: string,
    settings: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.settingsService) return false;
    const plugin = this.get(pluginId);
    return this.settingsService.savePluginSettings(pluginId, tenantId, settings, plugin?.settings);
  }

  /**
   * Delete all settings for a plugin in a tenant.
   */
  async deletePluginSettings(pluginId: string, tenantId: string): Promise<boolean> {
    if (!this.settingsService) return false;
    return this.settingsService.deletePluginSettings(pluginId, tenantId);
  }

  // ============================================================================
  // Capability Reconciliation
  // ============================================================================

  /**
   * Reconcile plugin capabilities with the merged catalog.
   * Called during CMS boot to ensure owners of existing orgs pick up
   * newly added capabilities from plugins.
   */
  async reconcileCapabilities(): Promise<void> {
    const caps = capabilityRegistry.getAllCapabilities();
    logger.info(`[PluginRegistry] Capability catalog: ${caps.length} total (core + plugin)`);
    // The actual role reconciliation happens downstream when roles are loaded.
    // The capabilityRegistry already has the merged catalog ready.
  }

  // ============================================================================
  // Plugin Part Resolution (Discriminated Union Dispatch)
  // ============================================================================

  /**
   * Resolve a plugin's structured parts into the appropriate subsystems.
   *
   * Dispatches on the `type` discriminant of each PluginPart:
   * - `schema` → logs collection registration for content system.
   * - `schemaTransform` → registers sugar type builders via `registerSugarType`.
   * - `route` → validates `requiredCapabilities` is defined on every route.
   * - `page` → validates `requiredCapabilities`/path uniqueness; registered
   *   isomorphically in `src/plugins/index.ts` (page registry + sidebar nav).
   * - `capability` → registers capabilities in the merged catalog.
   * - `settings` → merges declaration into the plugin's `settings` field.
   * - `adminTool` → validates zone; registered isomorphically in `index.ts`.
   * - `fieldComponent` → logs field component registration.
   * - `documentAction` → logs document action registration.
   *
   * Called during `initializePlugins` in `src/plugins/index.ts`.
   */
  resolveParts(plugin: Plugin): void {
    const parts: PluginPart[] | undefined = plugin.parts;
    if (!parts || parts.length === 0) return;

    const pluginId = plugin.metadata.id;

    for (const part of parts) {
      switch (part.type) {
        case "schema": {
          const expectedPrefix = `plugin_${pluginId}_`;
          for (const schema of part.collections) {
            if (!schema.name.startsWith(expectedPrefix)) {
              logger.warn(
                `[PluginRegistry] Schema "${schema.name}" from plugin "${pluginId}" should use "${expectedPrefix}" prefix to avoid collisions with core collections`,
              );
            }
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" contributes schema: ${schema.name}`,
            );
          }
          break;
        }

        case "schemaTransform": {
          for (const transform of part.transforms) {
            registerSugarType(transform);
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" registered sugar type: ${transform.type}`,
            );
          }
          break;
        }

        case "route": {
          for (const route of part.routes) {
            if (route.requiredCapabilities === undefined) {
              throw new Error(
                `[Security Violation] Plugin "${pluginId}" attempted to register route "${route.path}" without requiredCapabilities. Every route must declare requiredCapabilities: use [] for auth-only, "public" for unauthenticated, or a string[] of specific capabilities.`,
              );
            }
            if (route.requiredCapabilities === "public") {
              logger.warn(
                `[PluginRegistry] Plugin "${pluginId}" route "${route.path}" is explicitly public`,
              );
            } else {
              const declaredCaps = plugin.metadata.capabilities || [];
              for (const cap of route.requiredCapabilities) {
                if (!declaredCaps.includes(cap as any) && !cap.startsWith("plugin:")) {
                  logger.warn(
                    `[PluginRegistry] Route "${route.path}" requires capability "${cap}" which is not declared in plugin "${pluginId}" metadata.capabilities. Consider adding it.`,
                  );
                }
              }
            }
            pluginRouteRegistry.register(pluginId, route);
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" registered HTTP route ${route.method || "GET"} ${route.path}`,
            );
          }
          break;
        }

        case "capability": {
          if (part.capabilities.length > 0) {
            capabilityRegistry.registerPlugin(pluginId, part.capabilities as PluginCapability[]);
          }
          break;
        }

        case "settings": {
          if (part.declaration) {
            plugin.settings = part.declaration;
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" settings declaration merged (${part.declaration.fields.length} fields)`,
            );
          }
          break;
        }

        case "page": {
          for (const page of part.pages) {
            // Security: requiredCapabilities MUST be defined (compile-time error when omitted)
            if (page.requiredCapabilities === undefined) {
              throw new Error(
                `[Security Violation] Plugin "${pluginId}" attempted to register page "${page.path}" without requiredCapabilities. Use [] for auth-only or a string[] of specific capabilities.`,
              );
            }
            if (!page.id || !page.path) {
              throw new Error(
                `[Security Violation] Plugin "${pluginId}" page requires both an id and a path.`,
              );
            }
            if (page.load && !page.component) {
              throw new Error(
                `[PluginRegistry] Plugin "${pluginId}" page "${page.path}" declares a load hook but no component.`,
              );
            }
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" page "${page.id}" mounted at /plugin/${page.path} (nav: ${page.nav ? "yes" : "no"})`,
            );
          }
          break;
        }

        case "adminTool": {
          for (const tool of part.tools) {
            if (!["sidebar", "toolbar", "dashboard", "config"].includes(tool.zone)) {
              logger.warn(
                `[PluginRegistry] Plugin "${pluginId}" admin tool "${tool.id}" has invalid zone "${tool.zone}"`,
              );
            }
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" admin tool "${tool.id}" validated for zone "${tool.zone}"`,
            );
          }
          break;
        }

        case "fieldComponent": {
          for (const comp of part.components) {
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" field component "${comp.type}" registered for lazy loading`,
            );
          }
          break;
        }

        case "documentAction": {
          for (const action of part.actions) {
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" document action "${action.id}" registered for lazy loading`,
            );
          }
          break;
        }

        default: {
          // All known PluginPart types handled in cases above.
          // This branch handles unknown types for forward compatibility.
          logger.warn(
            `[PluginRegistry] Plugin "${pluginId}" has unknown part type: ${(part as any).type}`,
          );
          break;
        }
      }
    }
  }

  // Reset registry (used for shutdown/reinitialization)
  reset(): void {
    this.plugins.clear();
    this.settingsService = null;
    this.initialized = false;
  }

  // Ensure migration table exists
  private async ensureMigrationTable(dbAdapter: IDBAdapter): Promise<void> {
    const table = "pluginMigrations";
    try {
      // Use createModel to ensure physical table exists in SQL adapters
      const { withSystemScope } = await import("@src/databases/system-tenant-scope");
      await dbAdapter.collection.createModel(
        {
          _id: table,
          name: table,
          slug: table,
          fields: [],
          status: "publish",
        } as any,
        false,
        withSystemScope("bootstrap"),
      );
    } catch (error) {
      logger.error(`[PluginRegistry] Failed to ensure migration table:`, error);
    }
  }

  // Get applied migrations from database
  private async getAppliedMigrations(
    dbAdapter: IDBAdapter,
    pluginId: string,
    tenantId: string,
  ): Promise<DatabaseResult<PluginMigrationRecord[]>> {
    try {
      const result = await dbAdapter.crud.findMany<PluginMigrationRecord>(
        "pluginMigrations",
        {
          pluginId,
          tenantId,
        } as any,
        { bypassTenantCheck: true },
      );
      return result as DatabaseResult<PluginMigrationRecord[]>;
    } catch (error) {
      return {
        success: false,
        message: "Failed to get applied migrations",
        error: {
          code: "QUERY_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // Record a successful migration
  private async recordMigration(
    dbAdapter: IDBAdapter,
    pluginId: string,
    migrationId: string,
    version: number,
    tenantId: string,
  ): Promise<void> {
    await dbAdapter.crud.insert(
      "pluginMigrations",
      {
        pluginId,
        migrationId,
        version,
        tenantId,
        appliedAt: new Date(),
      } as any,
      { bypassTenantCheck: true },
    );
  }
}

export const pluginRegistry = new PluginRegistry();
