/**
 * @file src/routes/(app)/mediagallery/upload-media/+page.server.ts
 * @description Server actions for media upload (local + remote URL).
 *
 * ### Security
 * - Mutations require media:write (action-level — not only page load)
 * - Remote URLs go through MediaService.saveRemoteMedia (egress-guard SSRF defense)
 */

import type { MediaAccess } from "@root/src/utils/media/media-models";
// Large uploads use formData; body size validated at server level (Vite/SvelteKit config).
// Files over configurable limit are rejected before parsing with a clear error.
import { dbAdapter } from "@src/databases/db";
import { MediaService } from "@src/utils/media/media-service.server";
import { error, isHttpError, isRedirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser, requirePagePermission } from "@utils/page-guards.server";
import type { Actions } from "./$types";

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
      const files = formData.getAll("files");

      const mediaService = new MediaService(dbAdapter);
      const access: MediaAccess = "public";

      for (const file of files) {
        if (file instanceof File) {
          try {
            await mediaService.saveMedia(file, user._id as any, access, locals.tenantId as any);
            logger.info(`File uploaded successfully: ${file.name}`);
          } catch (fileError) {
            const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
            if (errorMessage.includes("duplicate")) {
              logger.warn(`A file with name "${file.name}" already exists`);
              throw new Error(`A file with name "${file.name}" already exists`);
            }
            throw new Error(errorMessage);
          }
        }
      }

      return { success: true };
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

      if (!(remoteUrls && Array.isArray(remoteUrls)) || remoteUrls.length === 0) {
        throw new Error("No URLs provided");
      }

      const mediaService = new MediaService(dbAdapter);
      // After egress-safe fetch only; internal targets never reach saveMedia
      const access: MediaAccess = "public";

      // 🛡️ SSRF: MUST use saveRemoteMedia — never raw fetch(url)
      for (const url of remoteUrls) {
        try {
          const result = await mediaService.saveRemoteMedia(
            url,
            user._id as any,
            access,
            locals.tenantId as any,
          );
          if (!result.success) {
            logger.warn(`Failed to fetch remote URL: ${url} — ${result.message}`);
            continue;
          }
          logger.info(`Remote file uploaded successfully: ${url}`);
        } catch (fileError) {
          const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
          if (errorMessage.includes("duplicate")) {
            logger.warn(`A file from URL "${url}" already exists`);
          } else {
            logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
          }
        }
      }

      return { success: true };
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
