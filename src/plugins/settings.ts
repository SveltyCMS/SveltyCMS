/**
 * @file src/plugins/settings.ts
 * @description Service for managing persistent plugin settings and states,
 * including encrypted secret fields via AES-256-GCM.
 */

import type { IDBAdapter } from "@databases/db-interface";
import { logger } from "@utils/logger";
import type { PluginState } from "./types";
import type { SettingsPart } from "./settings-declaration";
import { processSecretFields, decryptSecretFields, maskSecretFields } from "./settings-crypto";
import type { EncryptionContext } from "./settings-crypto";
import { getSecretFieldNames } from "./settings-declaration";

export class PluginSettingsService {
  private readonly SETTINGS_COLLECTION = "plugin_settings";

  constructor(private readonly dbAdapter: IDBAdapter) {}

  // Ensure the plugin_settings collection exists (SQL adapters need physical table).
  async initialize(): Promise<void> {
    try {
      // Prefer explicit schema provisioning when available (MariaDB/Postgres/SQLite).
      // Without this, SQL adapters map plugin_settings → collection_plugin_settings
      // and insert fails with "table doesn't exist".
      if (typeof (this.dbAdapter as any).createModel === "function") {
        try {
          await (this.dbAdapter as any).createModel({
            _id: this.SETTINGS_COLLECTION,
            name: this.SETTINGS_COLLECTION,
            fields: [],
          });
        } catch (provisionErr) {
          logger.debug(
            `createModel for ${this.SETTINGS_COLLECTION} skipped/failed (may already exist)`,
            { error: provisionErr },
          );
        }
      }

      const count = await this.dbAdapter.crud.count(this.SETTINGS_COLLECTION, undefined, {
        bypassTenantCheck: true,
      });
      if (!count.success) {
        logger.info(`Creating ${this.SETTINGS_COLLECTION} collection...`);
        await this.dbAdapter.crud.insert(
          this.SETTINGS_COLLECTION,
          {
            pluginId: "__INIT__",
            tenantId: "system",
            settings: {},
          } as any,
          { bypassTenantCheck: true },
        );
        await this.dbAdapter.crud.deleteMany(
          this.SETTINGS_COLLECTION,
          { pluginId: "__INIT__" } as any,
          { bypassTenantCheck: true },
        );
      }
    } catch (error) {
      logger.error(`Failed to initialize ${this.SETTINGS_COLLECTION}`, { error });
    }
  }

  // ============================================================================
  // Plugin Settings (per tenant, per plugin)
  // ============================================================================

  /**
   * Get stored settings for a plugin in a tenant.
   * Secret fields are masked in the returned value (safe for API responses).
   *
   * @param pluginId - Plugin identifier
   * @param tenantId - Tenant identifier
   * @param declaration - Optional settings declaration for masking secrets
   */
  async getPluginSettings(
    pluginId: string,
    tenantId: string,
    declaration?: SettingsPart,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.dbAdapter.crud.findOne<{ settings: Record<string, unknown> }>(
        this.SETTINGS_COLLECTION,
        { pluginId, tenantId } as any,
        { bypassTenantCheck: true },
      );

      if (!result.success || !result.data?.settings) return null;

      const stored = result.data.settings;

      // Mask secrets if declaration is provided
      if (declaration) {
        const secretFields = getSecretFieldNames(declaration);
        if (secretFields.length > 0) {
          return maskSecretFields(stored, secretFields);
        }
      }

      return stored;
    } catch (error) {
      logger.error(`Failed to get plugin settings for ${pluginId}`, { error });
      return null;
    }
  }

  /**
   * Get decrypted settings for server-side plugin consumption.
   * Secret fields are decrypted — NEVER send this to the browser.
   *
   * @param pluginId - Plugin identifier
   * @param tenantId - Tenant identifier
   * @param declaration - Settings declaration for identifying secret fields
   */
  async getDecryptedSettings(
    pluginId: string,
    tenantId: string,
    declaration?: SettingsPart,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.dbAdapter.crud.findOne<{ settings: Record<string, unknown> }>(
        this.SETTINGS_COLLECTION,
        { pluginId, tenantId } as any,
        { bypassTenantCheck: true },
      );

      if (!result.success || !result.data?.settings) return null;

      const stored = result.data.settings;

      // Decrypt secrets if declaration is provided
      if (declaration) {
        const secretFields = getSecretFieldNames(declaration);
        if (secretFields.length > 0) {
          const context: EncryptionContext = { tenantId, pluginId };
          return decryptSecretFields(stored, secretFields, context);
        }
      }

      return stored;
    } catch (error) {
      logger.error(`Failed to get decrypted settings for ${pluginId}`, { error });
      return null;
    }
  }

  /**
   * Save plugin settings for a tenant.
   * Secret fields are encrypted before storage.
   * Existing secret values are preserved if the submitted value is blank/masked.
   *
   * @param pluginId - Plugin identifier
   * @param tenantId - Tenant identifier
   * @param settings - The settings values to store
   * @param declaration - Settings declaration for identifying and processing secret fields
   */
  async savePluginSettings(
    pluginId: string,
    tenantId: string,
    settings: Record<string, unknown>,
    declaration?: SettingsPart,
  ): Promise<boolean> {
    try {
      let toStore = { ...settings };

      // Process secret fields: encrypt new values, preserve existing
      if (declaration) {
        const secretFields = getSecretFieldNames(declaration);
        if (secretFields.length > 0) {
          const existing = await this.getPluginSettings(pluginId, tenantId);
          const context: EncryptionContext = { tenantId, pluginId };
          toStore = await processSecretFields(toStore, existing, secretFields, context);
        }
      }

      const existing = await this.dbAdapter.crud.findOne<{
        _id: unknown;
        settings: Record<string, unknown>;
      }>(this.SETTINGS_COLLECTION, { pluginId, tenantId } as any, { bypassTenantCheck: true });

      if (existing.success && existing.data?._id) {
        const updateResult = await this.dbAdapter.crud.update(
          this.SETTINGS_COLLECTION,
          existing.data._id,
          {
            settings: toStore,
            updatedAt: new Date(),
          } as any,
          { bypassTenantCheck: true },
        );
        return updateResult.success;
      }

      // Insert new
      const insertResult = await this.dbAdapter.crud.insert(
        this.SETTINGS_COLLECTION,
        {
          pluginId,
          tenantId,
          settings: toStore,
        } as any,
        { bypassTenantCheck: true },
      );
      return insertResult.success;
    } catch (error) {
      logger.error(`Failed to save plugin settings for ${pluginId}`, { error });
      return false;
    }
  }

  /**
   * Delete all settings for a plugin in a tenant.
   */
  async deletePluginSettings(pluginId: string, tenantId: string): Promise<boolean> {
    try {
      const result = await this.dbAdapter.crud.deleteMany(
        this.SETTINGS_COLLECTION,
        { pluginId, tenantId } as any,
        { bypassTenantCheck: true },
      );
      return result.success;
    } catch (error) {
      logger.error(`Failed to delete plugin settings for ${pluginId}`, { error });
      return false;
    }
  }

  // ============================================================================
  // Plugin State (backward compatible)
  // ============================================================================

  // Get state for a specific plugin and tenant
  async getPluginState(pluginId: string, tenantId: string): Promise<PluginState | null> {
    try {
      const result = await this.dbAdapter.crud.findOne<PluginState>(
        "pluginStates",
        {
          pluginId,
          tenantId,
        } as any,
        { bypassTenantCheck: true },
      );

      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get plugin state for ${pluginId}`, { error });
      return null;
    }
  }

  // Get all plugin states for a tenant
  async getAllPluginStates(tenantId: string): Promise<PluginState[]> {
    try {
      const result = await this.dbAdapter.crud.findMany<PluginState>(
        "pluginStates",
        {
          tenantId,
        } as any,
        { bypassTenantCheck: true },
      );
      return result.success && result.data ? result.data : [];
    } catch (error) {
      logger.error(`Failed to get all plugin states for tenant ${tenantId}`, {
        error,
      });
      return [];
    }
  }

  // Set plugin enabled/disabled state
  async setPluginState(
    pluginId: string,
    tenantId: string,
    enabled: boolean,
    userId?: string,
  ): Promise<boolean> {
    try {
      const existing = await this.getPluginState(pluginId, tenantId);

      if (existing?._id) {
        const updateResult = await this.dbAdapter.crud.update<PluginState>(
          "pluginStates",
          existing._id,
          {
            enabled,
            updatedAt: new Date(),
            updatedBy: userId,
          } as any,
          { bypassTenantCheck: true },
        );
        return updateResult.success;
      }
      const insertResult = await this.dbAdapter.crud.insert<PluginState>(
        "pluginStates",
        {
          pluginId,
          tenantId,
          enabled,
          updatedBy: userId,
        } as any,
        { bypassTenantCheck: true },
      );
      return insertResult.success;
    } catch (error) {
      logger.error(`Failed to set plugin state for ${pluginId}`, { error });
      return false;
    }
  }
}
