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
import type { PluginCapability } from "./types";
import type {
  IPluginService,
  Plugin,
  PluginMigrationRecord,
  PluginPart,
  PluginRegistryEntry,
  PluginSSRHook,
} from "./types";

class PluginRegistry implements IPluginService {
  private readonly plugins: Map<string, PluginRegistryEntry> = new Map();
  private settingsService: PluginSettingsService | null = null;
  private initialized = false;

  // Register a new plugin
  async register(plugin: Plugin): Promise<DatabaseResult<void>> {
    try {
      if (this.plugins.has(plugin.metadata.id)) {
        logger.info(`Plugin ${plugin.metadata.id} is already registered. Overwriting.`);
      }

      this.plugins.set(plugin.metadata.id, {
        plugin,
        registeredAt: nowISODateString(),
      });

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
    return Array.from(this.plugins.values()).map((entry) => entry.plugin);
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
        logger.info(
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
  async runAllMigrations(dbAdapter: IDBAdapter, tenantId: string): Promise<DatabaseResult<void>> {
    try {
      logger.debug("🚀 Running all pending plugin migrations...");

      for (const pluginId of this.plugins.keys()) {
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

  // Toggle a plugin's enabled state
  async togglePlugin(
    pluginId: string,
    enabled: boolean,
    tenantId: string,
    userId?: string,
  ): Promise<boolean> {
    if (!this.settingsService) {
      logger.warn("PluginSettingsService not initialized");
      return false;
    }

    return await this.settingsService.setPluginState(pluginId, tenantId, enabled, userId);
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
   * - `capability` → registers capabilities in the merged catalog.
   * - `settings` → merges declaration into the plugin's `settings` field.
   * - `adminTool` → logs tool registration for UI slot injection.
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
            logger.info(`[PluginRegistry] Plugin "${pluginId}" contributes schema: ${schema.name}`);
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
            // Security: requiredCapabilities MUST be defined
            if (route.requiredCapabilities === undefined) {
              throw new Error(
                `[Security Violation] Plugin "${pluginId}" attempted to register route "${route.path}" without requiredCapabilities. Every route must declare requiredCapabilities: use [] for auth-only, "public" for unauthenticated, or a string[] of specific capabilities.`,
              );
            } else if (route.requiredCapabilities === "public") {
              logger.warn(
                `[PluginRegistry] Plugin "${pluginId}" route "${route.path}" is explicitly public`,
              );
            } else {
              // Validate route capabilities are declared in plugin metadata
              const declaredCaps = plugin.metadata.capabilities || [];
              for (const cap of route.requiredCapabilities) {
                if (!declaredCaps.includes(cap as any) && !cap.startsWith("plugin:")) {
                  logger.warn(
                    `[PluginRegistry] Route "${route.path}" requires capability "${cap}" which is not declared in plugin "${pluginId}" metadata.capabilities. Consider adding it.`,
                  );
                }
              }
              logger.debug(
                `[PluginRegistry] Plugin "${pluginId}" route "${route.path}" requires caps: [${route.requiredCapabilities.join(", ")}]`,
              );
            }
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

        case "adminTool": {
          for (const tool of part.tools) {
            // UI parts are lazily loaded — registered in a deferred map,
            // not resolved during the critical boot path.
            logger.debug(
              `[PluginRegistry] Plugin "${pluginId}" admin tool "${tool.id}" registered for lazy loading (zone: "${tool.zone}")`,
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
          // Exhaustiveness check — `part` should be `never` here
          const _exhaustive: never = part;
          void _exhaustive;
          logger.warn(
            `[PluginRegistry] Plugin "${pluginId}" has unknown part type: ${(part as PluginPart).type}`,
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
      await dbAdapter.collection.createModel({
        _id: table,
        name: table,
        slug: table,
        fields: [],
        status: "publish",
      } as any);
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
