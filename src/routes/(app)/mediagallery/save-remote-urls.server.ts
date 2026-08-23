/**
 * @file src/routes/(app)/mediagallery/save-remote-urls.server.ts
 * @description Shared remote-URL ingest (SSRF-safe). Used by remotes and form actions.
 */

import type { DatabaseId } from "@src/content/types";
import { dbAdapter } from "@src/databases/db";
import type { MediaAccess } from "@src/utils/media/media-models";
import { logger } from "@utils/logger";

export async function saveRemoteMediaUrls(args: {
  urls: string[];
  folder?: string;
  userId: string;
  tenantId: DatabaseId | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!dbAdapter) {
    return { success: false, error: "Database adapter is not initialized" };
  }
  const urls = args.urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()));
  if (urls.length === 0) {
    return { success: false, error: "No URLs provided" };
  }

  const { MediaService } = await import("@src/utils/media/media-service.server");
  const mediaService = new MediaService(dbAdapter);
  const access: MediaAccess = "public";
  const folder = args.folder || "global";

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const result = await mediaService.saveRemoteMedia(
          url.trim(),
          args.userId,
          access,
          args.tenantId,
          folder,
        );
        if (!result.success) {
          logger.warn(`Failed to fetch remote URL: ${url} — ${result.message}`);
          return;
        }
        logger.debug(`Remote file uploaded successfully to ${folder}: ${url}`);
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
        if (errorMessage.includes("duplicate")) {
          logger.warn(`A file from URL "${url}" already exists`);
        } else {
          logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
        }
      }
    }),
  );

  return { success: true };
}
