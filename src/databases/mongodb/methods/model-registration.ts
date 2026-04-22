/**
 * @file src/databases/mongodb/methods/model-registration.ts
 * @description Centralized registration of all system models on a specific Mongoose connection.
 * Ensures consistent schema application and avoids "Cast to ObjectId" errors for custom _id fields.
 */

import type { Connection } from "mongoose";
import { logger } from "@utils/logger";

/**
 * Registers all core CMS models on the provided connection.
 * This should be called immediately after connection establishment.
 */
export async function registerSystemModels(connection: Connection): Promise<void> {
  try {
    logger.debug("[MongoDB] Registering system models on connection...");

    // Content Structure
    const { contentStructureSchema, registerContentStructureDiscriminators } =
      await import("../models/content-structure");
    if (!connection.models.system_content_structure) {
      connection.model("system_content_structure", contentStructureSchema);
      registerContentStructureDiscriminators(connection);
    }

    // Drafts
    const { draftSchema } = await import("../models/draft");
    if (!connection.models.content_drafts) {
      connection.model("content_drafts", draftSchema);
    }

    // Revisions
    const { revisionSchema } = await import("../models/revision");
    if (!connection.models.content_revisions) {
      connection.model("content_revisions", revisionSchema);
    }

    // Themes
    const { themeSchema } = await import("../models/theme");
    if (!connection.models.system_theme) {
      connection.model("system_theme", themeSchema);
    }

    // Settings & Preferences
    // We'll add more as needed, but these are the most critical for benchmarks

    logger.info("[MongoDB] System models registered successfully.");
  } catch (error) {
    logger.error("[MongoDB] Failed to register system models:", error);
    throw error;
  }
}
