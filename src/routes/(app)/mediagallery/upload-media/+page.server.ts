/**
 * @file src/routes/(app)/mediagallery/upload-media/+page.server.ts
 * @description Server loader + actions for media upload (local + remote URL).
 *
 * ### Security
 * - Mutations require media:write (action-level — not only page load)
 * - Remote URLs go through MediaService.saveRemoteMedia (egress-guard SSRF defense)
 *
 * ### Folder targeting
 * Both entry points accept a `folder` field; the gallery's inline uploader and
 * this page's queue share the same `saveMedia(..., folder)` argument, so a
 * staged upload lands in the folder the user was browsing.
 */

import type { MediaAccess } from "@root/src/utils/media/media-values";
// Large uploads use formData; body size validated at server level (Vite/SvelteKit config).
// Files over configurable limit are rejected before parsing with a clear error.
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { MediaService } from "@src/utils/media/media-service.server";
import { error, isHttpError, isRedirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser, requirePagePermission } from "@utils/page-guards.server";
import type { Actions, PageServerLoad } from "./$types";

/** Map a storage rejection to the message the queue shows next to the file. */
function describeUploadFailure(filename: string, reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message.includes("duplicate")) {
    return { filename, message: `A file with name "${filename}" already exists` };
  }
  if (message.includes("invalid file type") || message.includes("MIME not allowed")) {
    return { filename, message: "Unsupported file type" };
  }
  return { filename, message };
}

/** Folder name/path for the queue header; `null` means Media Root. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const folderId = url.searchParams.get("folderId")?.trim() || null;
  try {
    getAuthenticatedUser(locals);
    if (!dbAdapter || !folderId) {
      return { folderId, folderName: null, folderPath: null };
    }

    // Explicit tenant scope — the raw module adapter is not request-bound and
    // fails closed under MULTI_TENANT when `tenantId` is omitted.
    const tenantId = (locals.tenantId ?? null) as DatabaseId | null;
    const result = await dbAdapter.system.virtualFolder.getAll({ tenantId });
    const folders = (result.success && Array.isArray(result.data) ? result.data : []) as Array<{
      _id?: unknown;
      name?: string;
      path?: string;
    }>;
    const folder = folders.find((entry) => String(entry?._id ?? "") === folderId);

    return {
      folderId,
      folderName: folder?.name ?? null,
      folderPath: folder?.path ?? null,
    };
  } catch (err) {
    if (isHttpError(err) || isRedirect(err)) throw err;
    logger.warn(
      `upload-media folder lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { folderId, folderName: null, folderPath: null };
  }
};

export const actions: Actions = {
  upload: async ({ request, locals }) => {
    if (!dbAdapter) {
      logger.error("Database adapter is not initialized");
      throw error(500, "Internal Server Error");
    }

    try {
      const user = getAuthenticatedUser(locals);
      requirePagePermission(locals, "media:write", "Insufficient permissions to upload media");

      const formData = await request.formData();
      const files = formData
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File);
      const folder = (formData.get("folder") as string) || "global";
      if (files.length === 0) throw error(400, "No files provided");

      const mediaService = new MediaService(dbAdapter);
      const access: MediaAccess = "public";

      // Per-file outcomes: one duplicate must not abort the rest of the queue.
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const result = await mediaService.saveMedia(
            file,
            user._id as any,
            access,
            locals.tenantId as any,
            folder,
          );
          if (result && typeof result === "object" && "success" in result && !result.success) {
            throw new Error(result.message || "Failed to save media file");
          }
          logger.info(`File uploaded successfully to ${folder}: ${file.name}`);
        }),
      );

      const errors = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [describeUploadFailure(files[index]?.name ?? "unknown", result.reason)]
          : [],
      );
      const processed = files.length - errors.length;

      if (processed === 0) {
        throw new Error(
          errors[0]?.message
            ? `${errors[0].filename}: ${errors[0].message}`
            : "Could not upload any files",
        );
      }

      return { success: true, processed, failed: errors.length, errors };
    } catch (err) {
      if (isHttpError(err) || isRedirect(err)) throw err;
      let userMessage = "Error uploading file";
      if (err instanceof Error) {
        userMessage = err.message;
      }
      logger.error(`Error during file upload: ${err instanceof Error ? err.message : String(err)}`);
      throw error(400, userMessage);
    }
  },

  remoteUpload: async ({ request, locals }) => {
    if (!dbAdapter) {
      logger.error("Database adapter is not initialized");
      throw error(500, "Internal Server Error");
    }

    try {
      const user = getAuthenticatedUser(locals);
      requirePagePermission(locals, "media:write", "Insufficient permissions to upload media");

      const formData = await request.formData();
      const remoteUrls = JSON.parse(formData.get("remoteUrls") as string) as string[];
      const folder = (formData.get("folder") as string) || "global";
      const { saveRemoteMediaUrls } = await import("../save-remote-urls.server");
      const result = await saveRemoteMediaUrls({
        urls: remoteUrls,
        folder,
        userId: String(user._id),
        tenantId: (locals.tenantId as DatabaseId | null) ?? null,
      });
      if (!result.success) throw new Error(result.error || "No URLs provided");
      return result;
    } catch (err) {
      if (isHttpError(err) || isRedirect(err)) throw err;
      let userMessage = "Error uploading file";
      if (err instanceof Error) {
        userMessage = err.message;
      }
      logger.error(
        `Error during remote file upload: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw error(400, userMessage);
    }
  },
};
