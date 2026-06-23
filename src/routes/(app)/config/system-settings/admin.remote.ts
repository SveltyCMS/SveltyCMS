/**
 * @file src/routes/(app)/config/system-settings/admin.remote.ts
 * @description Admin utility remote functions — cache repair, system operations.
 */

import { command, getRequestEvent } from "$app/server";

export const repairContentCache = command(
  "unchecked",
  async (_payload?: {}): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    const event = getRequestEvent();
    const { contentService } = await import("@src/content/engine.server");
    const { logger } = await import("@utils/logger");

    if (!event.locals.isAdmin) {
      return {
        success: false,
        error: "Only administrators can repair the content cache.",
      };
    }

    logger.info(`Repair Cache triggered by user: ${event.locals.user?._id}`);

    try {
      await contentService.fullReload();
      return {
        success: true,
        message: "Content structure cache rebuilt and synchronized successfully.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Content Cache Repair failed: ${msg}`);
      return { success: false, error: `Repair failed: ${msg}` };
    }
  },
);
