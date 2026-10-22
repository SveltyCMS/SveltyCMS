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

  const outcomes = await Promise.all(
    urls.map(async (url): Promise<{ ok: boolean; error?: string }> => {
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
          return { ok: false, error: result.message || "Remote fetch failed" };
        }
        logger.debug(`Remote file uploaded successfully to ${folder}: ${url}`);
        return { ok: true };
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
        if (errorMessage.includes("duplicate")) {
          logger.warn(`A file from URL "${url}" already exists`);
        } else {
          logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
        }
        return { ok: false, error: errorMessage };
      }
    }),
  );

  // `Promise.allSettled` used to swallow every failure and still answer
  // `success: true`, so the UI reported a successful import for URLs the SSRF
  // guard had rejected. A batch with no stored asset is a failure.
  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  if (succeeded === 0) {
    return {
      success: false,
      error: outcomes[0]?.error || "Could not fetch any of the provided URLs",
    };
  }

  return { success: true };
}
