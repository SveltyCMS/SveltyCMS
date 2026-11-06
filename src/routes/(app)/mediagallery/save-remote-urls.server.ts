/**
 * @file src/routes/(app)/mediagallery/save-remote-urls.server.ts
 * @description Shared remote-URL ingest (SSRF-safe). Used by remotes and form actions.
 */

import type { DatabaseId } from "@src/content/types";
import { dbAdapter } from "@src/databases/db";
import type { MediaAccess } from "@src/utils/media/media-models";
import { logger } from "@utils/logger";

/** Per-URL failure, surfaced to the caller instead of a generic toast. */
export interface RemoteUploadFailure {
  url: string;
  message: string;
}

/**
 * Batch outcome. `success` means at least one URL was stored; `processed` /
 * `failed` keep a partially successful import from being announced as a
 * complete success.
 */
export interface RemoteUploadResult {
  success: boolean;
  error?: string;
  processed: number;
  failed: number;
  errors?: RemoteUploadFailure[];
}

export async function saveRemoteMediaUrls(args: {
  urls: string[];
  folder?: string;
  userId: string;
  tenantId: DatabaseId | null;
}): Promise<RemoteUploadResult> {
  if (!dbAdapter) {
    return {
      success: false,
      error: "Database adapter is not initialized",
      processed: 0,
      failed: 0,
    };
  }
  const urls = args.urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()));
  if (urls.length === 0) {
    return { success: false, error: "No URLs provided", processed: 0, failed: 0 };
  }

  const { MediaService } = await import("@src/utils/media/media-service.server");
  const mediaService = new MediaService(dbAdapter);
  const access: MediaAccess = "public";
  const folder = args.folder || "global";

  const outcomes = await Promise.all(
    urls.map(async (url): Promise<{ url: string; ok: boolean; error?: string }> => {
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
          return { url, ok: false, error: result.message || "Remote fetch failed" };
        }
        logger.debug(`Remote file uploaded successfully to ${folder}: ${url}`);
        return { url, ok: true };
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
        if (errorMessage.includes("duplicate")) {
          logger.warn(`A file from URL "${url}" already exists`);
        } else {
          logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
        }
        return { url, ok: false, error: errorMessage };
      }
    }),
  );

  // `Promise.allSettled` used to swallow every failure and still answer
  // `success: true`, so the UI reported a successful import for URLs the SSRF
  // guard had rejected. A batch with no stored asset is a failure.
  const failures: RemoteUploadFailure[] = outcomes
    .filter((outcome) => !outcome.ok)
    .map((outcome) => ({ url: outcome.url, message: outcome.error || "Remote fetch failed" }));
  const processed = outcomes.length - failures.length;

  if (processed === 0) {
    return {
      success: false,
      error: failures[0]?.message || "Could not fetch any of the provided URLs",
      processed,
      failed: failures.length,
      errors: failures,
    };
  }

  return {
    success: true,
    processed,
    failed: failures.length,
    ...(failures.length > 0 ? { errors: failures } : {}),
  };
}
