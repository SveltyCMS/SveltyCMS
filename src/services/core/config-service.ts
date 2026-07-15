/**
 * @file src/services/config-service.ts
 * @description Service layer for handling all configuration synchronization logic.
 * Scans files, queries DB, compares states, validates dependencies, and handles import/export.
 *
 * Supports all config resource types: collections, roles, permissions, settings,
 * widgets, themes, webhooks, automations, and workflows.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { dbAdapter } from "@src/databases/db";
import type { Role } from "@src/databases/auth/types";
import type { Widget, Theme } from "@src/databases/db-interface";
import { createChecksum } from "@utils/security/crypto";
import { logger } from "@utils/logger";

// ---------------------------------------------------------------------------
// Resource Type Registry
// ---------------------------------------------------------------------------

const CONFIG_RESOURCE_TYPES = [
  "collection",
  "role",
  "permission",
  "setting",
  "widget",
  "theme",
  "webhook",
  "automation",
  "workflow",
] as const;
type ConfigResourceType = (typeof CONFIG_RESOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Keyword-based secret detection for settings (defense-in-depth)
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERNS = [
  "SECRET",
  "TOKEN",
  "KEY",
  "PASSWORD",
  "ENCRYPTION",
  "JWT",
  "PRIVATE",
  "API_KEY",
  "CREDENTIAL",
  "AUTH_TOKEN",
];

/** Checks whether a setting key looks like it contains secret material. */
function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SECRET_KEY_PATTERNS.some((pattern) => upper.includes(pattern));
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface ConfigEntity {
  entity: Record<string, unknown>;
  hash: string;
  name: string;
  type: string;
  uuid: string;
}

export interface ConfigSyncStatus {
  changes: {
    new: ConfigEntity[];
    updated: ConfigEntity[];
    deleted: ConfigEntity[];
  };
  status: "in_sync" | "changes_detected";
  unmetRequirements: Array<{ key: string; value?: unknown }>;
}

/** Describes support status for a single config resource type. */
export interface ResourceTypeInfo {
  type: ConfigResourceType;
  label: string;
  supported: boolean;
  count?: number;
  note?: string;
}

/** Manifest written into every config sync export directory. */
export interface ConfigManifest {
  schemaVersion: number;
  operationType: "config-promotion";
  cmsVersion: string;
  adapter: string;
  tenantId: string;
  createdAt: string;
  resources: Record<string, number>;
}

/**
 * Configuration Synchronization Service
 */
export class ConfigService {
  constructor() {}

  /** Returns current sync status between filesystem and database. */
  public async getStatus(tenantId?: string): Promise<ConfigSyncStatus> {
    logger.debug(`Fetching configuration sync status for tenant: ${tenantId || "global"}...`);
    const [source, active] = await Promise.all([
      this.getSourceState(tenantId),
      this.getActiveState(tenantId),
    ]);

    const changes = this.compareStates(source, active);
    const unmetRequirements = await this.checkForUnmetRequirements(source, tenantId);

    return {
      status:
        changes.new.length > 0 || changes.updated.length > 0 || changes.deleted.length > 0
          ? "changes_detected"
          : "in_sync",
      changes,
      unmetRequirements,
    };
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /**
   * Exports all configuration entities from DB to a timestamped folder
   * organized by resource type with a manifest.
   */
  public async performExport({
    uuids,
    tenantId,
  }: {
    uuids?: string[];
    tenantId?: string;
  } = {}): Promise<{ dirPath: string }> {
    logger.info(`Exporting configuration for tenant: ${tenantId || "global"}...`);
    const exportDir = path.resolve(
      process.cwd(),
      "config/sync",
      `export_${tenantId || "global"}_${Date.now()}`,
    );
    await fs.mkdir(exportDir, { recursive: true });

    // Fetch active state for all resource types
    const activeState = await this.getActiveState(tenantId);

    const allEntities = Array.from(activeState.values());

    // Group entities by type
    const grouped: Record<string, ConfigEntity[]> = {};
    for (const entity of allEntities) {
      // Apply optional UUID filter
      if (uuids?.length && !uuids.includes(entity.uuid)) continue;
      const t = entity.type;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(entity);
    }

    // Create subdirectories and write JSON per type
    const exportPromises: Promise<void>[] = [];
    const resourceCounts: Record<string, number> = {};

    for (const [resType, entities] of Object.entries(grouped)) {
      const dirPath = path.join(exportDir, `${resType}s`);
      exportPromises.push(
        fs.mkdir(dirPath, { recursive: true }).then(async () => {
          const filePath = path.join(dirPath, `${resType}s.json`);
          const data = entities.map((e) => e.entity);
          await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        }),
      );
      resourceCounts[`${resType}s`] = entities.length;
    }

    // Write manifest.json
    const manifest: ConfigManifest = {
      schemaVersion: 1,
      operationType: "config-promotion",
      cmsVersion: "0.0.7",
      adapter: dbAdapter?.type ?? "unknown",
      tenantId: tenantId || "global",
      createdAt: new Date().toISOString(),
      resources: resourceCounts,
    };
    exportPromises.push(
      fs.writeFile(path.join(exportDir, "manifest.json"), JSON.stringify(manifest, null, 2)),
    );

    await Promise.all(exportPromises);

    logger.info(`Configuration exported to ${exportDir}`);

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      eventBus.emit("config.exported", {
        tenantId: tenantId || "global",
        data: { resourceCounts, dirPath: exportDir },
      });
    } catch {
      /* event emission is best-effort */
    }

    return { dirPath: exportDir };
  }

  // -----------------------------------------------------------------------
  // Resource Type Registry (public)
  // -----------------------------------------------------------------------

  /**
   * Returns the list of supported config resource types with their
   * availability status based on the current adapter capabilities.
   */
  public async getResourceTypes(): Promise<ResourceTypeInfo[]> {
    const adapter = dbAdapter;
    const results: ResourceTypeInfo[] = [];

    for (const type of CONFIG_RESOURCE_TYPES) {
      let supported = false;
      let count: number | undefined;
      let note: string | undefined;

      try {
        switch (type) {
          case "collection":
            supported = !!adapter;
            if (adapter) {
              const r = await adapter.crud.count("collections", {});
              count = r.success ? r.data : 0;
            }
            break;

          case "role":
            supported = !!adapter?.auth;
            if (adapter?.auth) {
              const roles = await adapter.auth.getAllRoles();
              count = roles.length;
            }
            break;

          case "permission":
            supported = !!adapter?.auth;
            if (adapter?.auth) {
              const roles = await adapter.auth.getAllRoles();
              const permSet = new Set<string>();
              for (const r of roles) {
                if (Array.isArray(r.permissions)) {
                  for (const p of r.permissions) permSet.add(p);
                }
              }
              count = permSet.size;
            }
            break;

          case "setting":
            supported = !!adapter?.system?.preferences;
            if (adapter) {
              try {
                const r = await adapter.crud.count("system_settings", {
                  category: "public",
                } as any);
                count = r.success ? r.data : 0;
              } catch {
                // Fallback: count via preferences adapter
                const r = await adapter.system.preferences.getByCategory("public", {
                  scope: "system",
                });
                count = r.success && r.data ? Object.keys(r.data).length : 0;
              }
            }
            break;

          case "widget":
            supported = !!adapter?.system?.widgets;
            if (adapter?.system?.widgets) {
              const r = await adapter.system.widgets.findAll();
              count = r.success && Array.isArray(r.data) ? r.data.length : 0;
            }
            break;

          case "theme":
            supported = !!adapter?.system?.themes;
            if (adapter?.system?.themes) {
              const themes = await adapter.system.themes.getAllThemes();
              count = themes.length;
            }
            break;

          case "webhook":
            try {
              const r = await adapter.crud.count("webhooks", {});
              supported = r.success;
              count = r.success ? r.data : 0;
            } catch {
              supported = false;
              note = "Webhook storage not yet provisioned";
            }
            break;

          case "automation":
          case "workflow":
            try {
              const r = await adapter.crud.count("automations", {});
              supported = r.success;
              count = r.success ? r.data : 0;
            } catch {
              supported = false;
              note = "Automation storage not yet provisioned";
            }
            break;
        }
      } catch (err) {
        note = `Error probing: ${(err as Error).message}`;
      }

      results.push({
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        supported,
        ...(count !== undefined && { count }),
        ...(note && { note }),
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  /** Imports configuration entities from filesystem into the database. */
  public async performImport(
    options: {
      tenantId?: string;
      changes?: {
        new: ConfigEntity[];
        updated: ConfigEntity[];
        deleted: ConfigEntity[];
      };
    } = {},
  ) {
    const { tenantId } = options;
    logger.info(`Performing configuration import for tenant: ${tenantId || "global"}...`);
    let changes = options.changes;

    if (!changes) {
      const status = await this.getStatus(tenantId);
      changes = status.changes;
    }

    if (!dbAdapter) {
      throw new Error("Database adapter not available.");
    }

    // 1. Handle New & Updated Entities
    const toUpsert = [...changes.new, ...changes.updated];
    for (const item of toUpsert) {
      await this.upsertEntity(item, tenantId);
    }

    // 2. Handle Deleted Entities
    for (const item of changes.deleted) {
      await this.deleteEntity(item, tenantId);
    }

    logger.info("Configuration import completed.");

    // Emit webhook event (best-effort, non-blocking)
    try {
      const { eventBus } = await import("@src/services/background/automation/event-bus");
      const resourceCounts = changes
        ? {
            new: changes.new.length,
            updated: changes.updated.length,
            deleted: changes.deleted.length,
          }
        : {};
      eventBus.emit("config.applied", {
        tenantId: tenantId || "global",
        data: { resourceCounts },
      });
    } catch {
      /* event emission is best-effort */
    }
  }

  /** Upserts a single entity into the database based on its resource type. */
  private async upsertEntity(item: ConfigEntity, tenantId?: string) {
    const adapter = dbAdapter!;
    try {
      switch (item.type) {
        case "collection": {
          // Collection schemas are stored as content_nodes with nodeType="collection"
          // and the schema definition in the collectionDef JSON column.
          const now = new Date().toISOString();
          const schema = item.entity as Record<string, unknown>;
          await adapter.crud.upsert(
            "content_nodes",
            {
              nodeType: "collection",
              name: item.name,
              ...(tenantId && { tenantId }),
            } as Record<string, unknown>,
            {
              _id: item.uuid,
              path: schema.path || `/collection/${(item.name || item.uuid).toLowerCase()}`,
              name: item.name,
              icon: (schema.icon as string) || "bi:file",
              nodeType: "collection",
              collectionDef: schema,
              tenantId: tenantId || "global",
              createdAt: now,
              updatedAt: now,
            } as any,
            tenantId as any,
          );
          logger.info(`Imported collection: ${item.name}`);
          break;
        }

        case "role": {
          if (adapter.auth) {
            const role = item.entity as unknown as Role;
            // Check if role already exists by name
            const existingRoles = await adapter.auth.getAllRoles();
            const existing = existingRoles.find(
              (r) => r.name === role.name || String(r._id) === item.uuid,
            );
            if (existing) {
              await adapter.auth.updateRole(existing._id, role as any, {
                tenantId: tenantId as any,
              });
              logger.info(`Updated role: ${item.name}`);
            } else {
              await adapter.auth.createRole(role, { tenantId: tenantId as any });
              logger.info(`Imported role: ${item.name}`);
            }
          }
          break;
        }

        case "permission": {
          // Permissions are managed via role upserts; handled in "role" case.
          break;
        }

        case "setting": {
          if (adapter.system?.preferences) {
            const e = item.entity as Record<string, unknown>;
            await adapter.system.preferences.set(e.key as string, e.value, {
              scope: "system",
              tenantId: (tenantId as string | null) ?? (null as any),
            });
            logger.info(`Imported setting: ${item.name}`);
          }
          break;
        }

        case "widget": {
          if (adapter.system?.widgets) {
            const w = item.entity as Record<string, unknown>;
            if (w.isActive) {
              await adapter.system.widgets.activate(item.uuid as any);
            } else {
              await adapter.system.widgets.deactivate(item.uuid as any);
            }
            logger.info(`Imported widget state: ${item.name}`);
          }
          break;
        }

        case "theme": {
          if (adapter.system?.themes) {
            const themeData = item.entity as unknown as Theme;
            const themes = await adapter.system.themes.getAllThemes();
            const existing = themes.find(
              (t) => t.name === themeData.name || String(t._id) === item.uuid,
            );
            if (existing) {
              await adapter.system.themes.update(existing._id, themeData as any);
            } else {
              await adapter.system.themes.ensure(themeData as any, { tenantId: tenantId as any });
            }
            if (themeData.isActive) {
              await adapter.system.themes.setDefault(themeData._id);
            }
            logger.info(`Imported theme: ${item.name}`);
          }
          break;
        }

        case "webhook": {
          try {
            await adapter.crud.upsert(
              "webhooks",
              { name: item.name, ...(tenantId && { tenantId }) } as Record<string, unknown>,
              { ...item.entity, ...(tenantId && { tenantId }) } as any,
              tenantId as any,
            );
            logger.info(`Imported webhook: ${item.name}`);
          } catch (err) {
            logger.error(`Failed to import webhook ${item.name}:`, err);
          }
          break;
        }

        case "automation":
        case "workflow": {
          try {
            await adapter.crud.upsert(
              "automations",
              { name: item.name, ...(tenantId && { tenantId }) } as Record<string, unknown>,
              { ...item.entity, ...(tenantId && { tenantId }) } as any,
              tenantId as any,
            );
            logger.info(`Imported automation: ${item.name}`);
          } catch (err) {
            logger.error(`Failed to import automation ${item.name}:`, err);
          }
          break;
        }

        default:
          logger.warn(`Unknown resource type in import: ${item.type} (${item.name})`);
      }
    } catch (err) {
      logger.error(`Failed to import ${item.type} "${item.name}":`, err);
    }
  }

  /** Deletes a single entity from the database based on its resource type. */
  private async deleteEntity(item: ConfigEntity, tenantId?: string) {
    const adapter = dbAdapter!;
    try {
      switch (item.type) {
        case "collection": {
          await adapter.crud.delete("collections", item.uuid as any, tenantId as any);
          logger.info(`Deleted collection: ${item.name}`);
          break;
        }

        case "role": {
          if (adapter.auth) {
            await adapter.auth.deleteRole(item.uuid as any, { tenantId: tenantId as any });
            logger.info(`Deleted role: ${item.name}`);
          }
          break;
        }

        case "permission": {
          // Permissions are embedded in roles; removal handled by role updates.
          break;
        }

        case "setting": {
          if (adapter.system?.preferences) {
            await adapter.system.preferences.delete(item.name, {
              scope: "system",
              tenantId: (tenantId as string | null) ?? (null as any),
            });
            logger.info(`Deleted setting: ${item.name}`);
          }
          break;
        }

        case "widget": {
          if (adapter.system?.widgets) {
            try {
              await adapter.system.widgets.delete(item.uuid as any);
              logger.info(`Deleted widget: ${item.name}`);
            } catch {
              // Deactivation fallback
              await adapter.system.widgets.deactivate(item.uuid as any);
              logger.info(`Deactivated widget: ${item.name}`);
            }
          }
          break;
        }

        case "theme": {
          if (adapter.system?.themes) {
            await adapter.system.themes.uninstall(item.uuid as any);
            logger.info(`Deleted theme: ${item.name}`);
          }
          break;
        }

        case "webhook": {
          await adapter.crud.delete("webhooks", item.uuid as any, tenantId as any);
          logger.info(`Deleted webhook: ${item.name}`);
          break;
        }

        case "automation":
        case "workflow": {
          await adapter.crud.delete("automations", item.uuid as any, tenantId as any);
          logger.info(`Deleted automation: ${item.name}`);
          break;
        }

        default:
          logger.warn(`Unknown resource type in delete: ${item.type} (${item.name})`);
      }
    } catch (err) {
      logger.error(`Failed to delete ${item.type} "${item.name}":`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Source State — filesystem / definition-side view
  // -----------------------------------------------------------------------

  private async getSourceState(tenantId?: string): Promise<Map<string, ConfigEntity>> {
    const state = new Map<string, ConfigEntity>();
    const { contentSystem } = await import("@src/content/index.server");
    await contentSystem.initialize(tenantId);

    // 1. Collections
    await this.scanCollections(state, tenantId);

    // 2. Roles
    await this.scanRoles(state, tenantId);

    // 3. Permissions
    await this.scanPermissions(state, tenantId);

    // 4. Settings (non-secret only)
    await this.scanSettings(state, tenantId);

    // 5. Widgets
    await this.scanWidgets(state, tenantId);

    // 6. Themes
    await this.scanThemes(state, tenantId);

    // 7. Webhooks
    await this.scanWebhooks(state, tenantId);

    // 8. Automations
    await this.scanAutomations(state, tenantId);

    return state;
  }

  // --- Per-type scanners (source) ----------------------------------------

  private async scanCollections(state: Map<string, ConfigEntity>, tenantId?: string) {
    const { contentSystem } = await import("@src/content/index.server");
    const collections = await contentSystem.getCollections(tenantId);

    const tasks = collections.map(async (collection) => {
      if (!(collection._id && collection.name)) return null;
      const hash = await createChecksum(collection);
      return {
        uuid: String(collection._id),
        type: "collection",
        name: collection.name,
        hash,
        entity: collection as unknown as Record<string, unknown>,
      };
    });

    const results = await Promise.all(tasks);
    for (const res of results) {
      if (res) state.set(res.uuid, res);
    }
  }

  private async scanRoles(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.auth) return;
    try {
      const roles: Role[] = await dbAdapter.auth.getAllRoles();
      for (const role of roles) {
        const id = String(role._id);
        if (!id || !role.name) continue;
        const entity = role as unknown as Record<string, unknown>;
        const hash = await createChecksum(entity);
        state.set(id, { uuid: id, type: "role", name: role.name, hash, entity });
      }
    } catch (err) {
      logger.error("Failed to scan roles for config sync:", err);
    }
  }

  private async scanPermissions(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.auth) return;
    try {
      // Permissions are embedded in roles; collect unique permission entries.
      // Some adapters may expose a separate permissions table.
      const roles: Role[] = await dbAdapter.auth.getAllRoles();
      const seen = new Set<string>();
      for (const role of roles) {
        if (!Array.isArray(role.permissions)) continue;
        for (const permId of role.permissions) {
          if (!permId || seen.has(permId)) continue;
          seen.add(permId);
          const entity: Record<string, unknown> = { _id: permId, name: permId };
          const hash = await createChecksum(entity);
          state.set(permId, {
            uuid: permId,
            type: "permission",
            name: permId,
            hash,
            entity,
          });
        }
      }
    } catch (err) {
      logger.error("Failed to scan permissions for config sync:", err);
    }
  }

  private async scanSettings(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.preferences) return;
    // Fall back gracefully if getByCategory is not implemented
    if (typeof (dbAdapter.system.preferences as any).getByCategory !== "function") return;
    try {
      // Fetch public-category settings via the preference adapter.
      const result = await dbAdapter.system.preferences.getByCategory<unknown>("public", {
        scope: "system",
        tenantId: (_tenantId as string | null) ?? (null as any),
      });
      if (result.success && result.data) {
        for (const [key, value] of Object.entries(result.data)) {
          // Defense-in-depth: skip anything that looks secret
          if (isSecretKey(key)) continue;
          const entity: Record<string, unknown> = { key, value };
          const hash = await createChecksum(entity);
          state.set(`setting:${key}`, {
            uuid: `setting:${key}`,
            type: "setting",
            name: key,
            hash,
            entity,
          });
        }
      }
    } catch (err) {
      logger.error("Failed to scan settings for config sync:", err);
    }
  }

  private async scanWidgets(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.widgets) return;
    try {
      const result = await dbAdapter.system.widgets.findAll();
      if (result.success && Array.isArray(result.data)) {
        for (const widget of result.data as Widget[]) {
          const id = String(widget._id);
          if (!id || !widget.name) continue;
          const entity = widget as unknown as Record<string, unknown>;
          const hash = await createChecksum(entity);
          state.set(id, { uuid: id, type: "widget", name: widget.name, hash, entity });
        }
      }
    } catch (err) {
      logger.error("Failed to scan widgets for config sync:", err);
    }
  }

  private async scanThemes(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.themes) return;
    try {
      const themes: Theme[] = await dbAdapter.system.themes.getAllThemes();
      for (const theme of themes) {
        const id = String(theme._id);
        if (!id || !theme.name) continue;
        const entity = theme as unknown as Record<string, unknown>;
        const hash = await createChecksum(entity);
        state.set(id, { uuid: id, type: "theme", name: theme.name, hash, entity });
      }
    } catch (err) {
      logger.error("Failed to scan themes for config sync:", err);
    }
  }

  private async scanWebhooks(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter) return;
    try {
      const result = await dbAdapter.crud.findMany(
        "webhooks",
        {},
        {
          tenantId: (_tenantId as string | null) ?? (undefined as any),
        },
      );
      if (result.success && Array.isArray(result.data)) {
        for (const item of result.data as unknown as Record<string, unknown>[]) {
          const id = String(item._id ?? "");
          const name = String(item.name ?? id);
          if (!id) continue;
          const hash = await createChecksum(item);
          state.set(id, { uuid: id, type: "webhook", name, hash, entity: item });
        }
      }
    } catch (err) {
      logger.error("Failed to scan webhooks for config sync:", err);
    }
  }

  private async scanAutomations(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter) return;
    try {
      const result = await dbAdapter.crud.findMany(
        "automations",
        {},
        {
          tenantId: (_tenantId as string | null) ?? (undefined as any),
        },
      );
      if (result.success && Array.isArray(result.data)) {
        for (const item of result.data as unknown as Record<string, unknown>[]) {
          const id = String(item._id ?? "");
          const name = String(item.name ?? id);
          if (!id) continue;
          const hash = await createChecksum(item);
          state.set(id, { uuid: id, type: "automation", name, hash, entity: item });
        }
      }
    } catch (err) {
      logger.error("Failed to scan automations for config sync:", err);
    }
  }

  // -----------------------------------------------------------------------
  // Active State — database-side view
  // -----------------------------------------------------------------------

  private async getActiveState(tenantId?: string): Promise<Map<string, ConfigEntity>> {
    if (!dbAdapter) {
      throw new Error("Database adapter not available.");
    }
    const state = new Map<string, ConfigEntity>();

    // Collections
    await this.fetchCollectionsFromDb(state, tenantId);

    // Roles
    await this.fetchRolesFromDb(state, tenantId);

    // Permissions
    await this.fetchPermissionsFromDb(state, tenantId);

    // Settings (non-secret)
    await this.fetchSettingsFromDb(state, tenantId);

    // Widgets
    await this.fetchWidgetsFromDb(state, tenantId);

    // Themes
    await this.fetchThemesFromDb(state, tenantId);

    // Webhooks
    await this.fetchWebhooksFromDb(state, tenantId);

    // Automations
    await this.fetchAutomationsFromDb(state, tenantId);

    return state;
  }

  // --- Per-type fetchers (active) ----------------------------------------

  private async fetchCollectionsFromDb(state: Map<string, ConfigEntity>, tenantId?: string) {
    try {
      // Collection schemas are stored as content_nodes with nodeType="collection"
      // and the schema definition in the collectionDef JSON column.
      const collectionsResult = await dbAdapter!.crud.findMany(
        "content_nodes",
        { nodeType: "collection" } as any,
        { tenantId: (tenantId as any) || undefined },
      );

      if (collectionsResult.success && Array.isArray(collectionsResult.data)) {
        const tasks = (collectionsResult.data as unknown as Record<string, unknown>[]).map(
          async (node) => {
            let schema = (node as any).collectionDef;
            if (typeof schema === "string") {
              try {
                schema = JSON.parse(schema);
              } catch {
                /* ignore */
              }
            }
            if (!schema) return null;
            const id = String(schema._id || node._id || "");
            const name = String(schema.name || node.name || "");
            if (!(id && name)) return null;
            const hash = await createChecksum(schema);
            return { uuid: id, type: "collection", name, hash, entity: schema };
          },
        );
        const results = await Promise.all(tasks);
        for (const res of results) {
          if (res) state.set(res.uuid, res);
        }
      }
    } catch (err) {
      logger.error("Failed to fetch collections from DB for config sync:", err);
    }
  }

  private async fetchRolesFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.auth) return;
    try {
      const roles: Role[] = await dbAdapter.auth.getAllRoles();
      for (const role of roles) {
        const id = String(role._id);
        if (!id || !role.name) continue;
        const entity = role as unknown as Record<string, unknown>;
        const hash = await createChecksum(entity);
        state.set(id, { uuid: id, type: "role", name: role.name, hash, entity });
      }
    } catch (err) {
      logger.error("Failed to fetch roles from DB for config sync:", err);
    }
  }

  private async fetchPermissionsFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.auth) return;
    try {
      const roles: Role[] = await dbAdapter.auth.getAllRoles();
      const seen = new Set<string>();
      for (const role of roles) {
        if (!Array.isArray(role.permissions)) continue;
        for (const permId of role.permissions) {
          if (!permId || seen.has(permId)) continue;
          seen.add(permId);
          const entity: Record<string, unknown> = { _id: permId, name: permId };
          const hash = await createChecksum(entity);
          state.set(permId, {
            uuid: permId,
            type: "permission",
            name: permId,
            hash,
            entity,
          });
        }
      }
    } catch (err) {
      logger.error("Failed to fetch permissions from DB for config sync:", err);
    }
  }

  private async fetchSettingsFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.preferences) return;
    try {
      // Use findMany on system_settings for full visibility across adapters
      const result = await dbAdapter.crud.findMany(
        "system_settings",
        {},
        {
          tenantId: (_tenantId as string | null) ?? (undefined as any),
        },
      );
      if (result.success && Array.isArray(result.data)) {
        for (const setting of result.data as unknown as Record<string, unknown>[]) {
          const key = String(setting.key ?? "");
          // Skip private / secret settings
          if (String(setting.category ?? "") === "private") continue;
          if (String(setting.visibility ?? "") === "private") continue;
          if (isSecretKey(key)) continue;
          if (!key) continue;
          const hash = await createChecksum(setting);
          state.set(`setting:${key}`, {
            uuid: `setting:${key}`,
            type: "setting",
            name: key,
            hash,
            entity: setting,
          });
        }
      }
    } catch (err) {
      logger.error("Failed to fetch settings from DB for config sync:", err);
    }
  }

  private async fetchWidgetsFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.widgets) return;
    try {
      const result = await dbAdapter.system.widgets.findAll();
      if (result.success && Array.isArray(result.data)) {
        for (const widget of result.data as Widget[]) {
          const id = String(widget._id);
          if (!id || !widget.name) continue;
          const entity = widget as unknown as Record<string, unknown>;
          const hash = await createChecksum(entity);
          state.set(id, { uuid: id, type: "widget", name: widget.name, hash, entity });
        }
      }
    } catch (err) {
      logger.error("Failed to fetch widgets from DB for config sync:", err);
    }
  }

  private async fetchThemesFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter?.system?.themes) return;
    try {
      const themes: Theme[] = await dbAdapter.system.themes.getAllThemes();
      for (const theme of themes) {
        const id = String(theme._id);
        if (!id || !theme.name) continue;
        const entity = theme as unknown as Record<string, unknown>;
        const hash = await createChecksum(entity);
        state.set(id, { uuid: id, type: "theme", name: theme.name, hash, entity });
      }
    } catch (err) {
      logger.error("Failed to fetch themes from DB for config sync:", err);
    }
  }

  private async fetchWebhooksFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter) return;
    try {
      const result = await dbAdapter.crud.findMany(
        "webhooks",
        {},
        {
          tenantId: (_tenantId as string | null) ?? (undefined as any),
        },
      );
      if (result.success && Array.isArray(result.data)) {
        for (const item of result.data as unknown as Record<string, unknown>[]) {
          const id = String(item._id ?? "");
          const name = String(item.name ?? id);
          if (!id) continue;
          const hash = await createChecksum(item);
          state.set(id, { uuid: id, type: "webhook", name, hash, entity: item });
        }
      }
    } catch (err) {
      logger.error("Failed to fetch webhooks from DB for config sync:", err);
    }
  }

  private async fetchAutomationsFromDb(state: Map<string, ConfigEntity>, _tenantId?: string) {
    if (!dbAdapter) return;
    try {
      const result = await dbAdapter.crud.findMany(
        "automations",
        {},
        {
          tenantId: (_tenantId as string | null) ?? (undefined as any),
        },
      );
      if (result.success && Array.isArray(result.data)) {
        for (const item of result.data as unknown as Record<string, unknown>[]) {
          const id = String(item._id ?? "");
          const name = String(item.name ?? id);
          if (!id) continue;
          const hash = await createChecksum(item);
          state.set(id, { uuid: id, type: "automation", name, hash, entity: item });
        }
      }
    } catch (err) {
      logger.error("Failed to fetch automations from DB for config sync:", err);
    }
  }

  /** Compares filesystem and DB states → returns new, updated, deleted. */
  private compareStates(source: Map<string, ConfigEntity>, active: Map<string, ConfigEntity>) {
    const result = { new: [], updated: [], deleted: [] } as {
      new: ConfigEntity[];
      updated: ConfigEntity[];
      deleted: ConfigEntity[];
    };

    for (const [uuid, s] of source.entries()) {
      const a = active.get(uuid);
      if (!a) {
        result.new.push(s);
      } else if (s.hash !== a.hash) {
        result.updated.push(s);
      }
    }
    for (const [uuid, a] of active.entries()) {
      if (!source.has(uuid)) {
        result.deleted.push(a);
      }
    }
    return result;
  }

  /** Checks for missing system settings required by config entities. */
  private async checkForUnmetRequirements(
    source: Map<string, ConfigEntity>,
    tenantId?: string,
  ): Promise<Array<{ key: string; value?: unknown }>> {
    if (!dbAdapter?.system.preferences) {
      throw new Error("System preferences adapter unavailable.");
    }

    const unmet: Array<{ key: string; value?: unknown }> = [];
    for (const { entity } of source.values()) {
      if (!Array.isArray(entity._requiredSettings)) {
        continue;
      }

      for (const req of entity._requiredSettings) {
        // ✨ ISOLATION: Pass tenantId explicitly in options
        const result = await dbAdapter.system.preferences.get(req.key, {
          scope: "system",
          tenantId: tenantId as any,
        });
        if (!(result.success && result.data)) {
          unmet.push(req);
        }
      }
    }

    // Deduplicate by key
    return [...new Map(unmet.map((i) => [i.key, i])).values()];
  }
}

export const configService = new ConfigService();
