/**
 * @file src/databases/mongodb/methods/model-registration.ts
 * @description Centralized registration of all system models on a specific Mongoose connection.
 * Ensures consistent schema application and avoids "Cast to ObjectId" errors for custom _id fields.
 */

import type { Connection } from "mongoose";
import { logger } from "@utils/logger";

import {
  contentStructureSchema,
  registerContentStructureDiscriminators,
  draftSchema,
  revisionSchema,
  themeSchema,
  systemSettingSchema,
  systemPreferencesSchema,
  outboxSchema,
  pluginStorageSchema,
} from "./schema";

/**
 * Registers all core CMS models on the provided connection.
 * This should be called immediately after connection establishment.
 */
export async function registerSystemModels(connection: Connection): Promise<void> {
  try {
    logger.debug("[MongoDB] Registering system models on connection...");

    // Content Structure
    if (!connection.models.system_content_structure) {
      connection.model("system_content_structure", contentStructureSchema);
      registerContentStructureDiscriminators(connection);
    }

    // Drafts
    if (!connection.models.content_drafts) {
      connection.model("content_drafts", draftSchema);
    }

    // Revisions
    if (!connection.models.content_revisions) {
      connection.model("content_revisions", revisionSchema);
    }

    // Themes
    if (!connection.models.system_theme) {
      connection.model("system_theme", themeSchema);
    }

    // Settings & Preferences
    if (!connection.models.SystemSetting) {
      connection.model("SystemSetting", systemSettingSchema);
    }

    if (!connection.models.SystemPreferences) {
      connection.model("SystemPreferences", systemPreferencesSchema);
    }

    // Outbox Events
    if (!connection.models.OutboxEvent) {
      connection.model("OutboxEvent", outboxSchema);
    }

    // Plugin storage (shared JSON store for plugins)
    if (!connection.models.PluginStorage) {
      connection.model("PluginStorage", pluginStorageSchema);
    }

    logger.info("[MongoDB] System models registered successfully.");
  } catch (error) {
    logger.error("[MongoDB] Failed to register system models:", error);
    throw error;
  }
}
