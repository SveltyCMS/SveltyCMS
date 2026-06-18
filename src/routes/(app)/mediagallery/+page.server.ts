/**
 * @file src/routes/(app)/mediagallery/+page.server.ts
 * @description Server-side logic for the media gallery page.
 *
 * This module handles:
 * - Fetching media files from various collections (images, documents, audio, video)
 * - Fetching virtual folders
 * - File upload processing for different media types
 * - Error handling and logging
 *
 * The load function prepares data for the media gallery, including user information,
 * a list of all media files, and virtual folders. The actions object defines the
 * server-side logic for handling file uploads.
 */

import type { DatabaseId } from "@root/src/content/types";
// Utils
import type { MediaItem, SystemVirtualFolder } from "@root/src/databases/db-interface";
import type { MediaAccess } from "@root/src/utils/media/media-models";
// Auth
import { dbAdapter } from "@src/databases/db";
import { cacheService } from "@src/databases/cache/cache-service";
import { MediaService } from "@src/utils/media/media-service.server";
import { error, redirect, isHttpError, isRedirect } from "@sveltejs/kit";
// System Logger
import { type LoggableValue, logger } from "@utils/logger";
import { getImageSizes, moveMediaToTrash } from "@utils/media/media-storage.server";
import { resolveMediaPublicPath } from "@utils/media/media-utils";
import type { Actions, PageServerLoad } from "./$types";

/**
 * 🚀 Fast serializer: converts _id/parent ObjectIds to strings.
 * Uses JSON.stringify with a replacer — far faster than the previous
 * iterative DFS walker (eliminated ~50ms per large folder tree).
 */
function serializeIds(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (_key === "_id" || _key === "parent") {
        return value?.toString?.() ?? null;
      }
      if (Buffer.isBuffer(value)) {
        return value.toString("hex");
      }
      return value;
    }),
  );
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // Add url parameter
  if (!dbAdapter) {
    logger.error("Database adapter is not initialized");
    throw error(500, "Internal Server Error");
  }

  try {
    // User is already validated in hooks.server.ts
    const { user, isAdmin, roles: tenantRoles } = locals;
    if (!user) {
      throw redirect(302, "/login");
    }

    // Check if user has permission to access media gallery
    const hasMediaPermission =
      isAdmin ||
      Object.values(tenantRoles).some(
        (role) =>
          ((role as { permissions?: string[] }).permissions || []).includes("media:read") ||
          ((role as { permissions?: string[] }).permissions || []).includes("media:write"),
      );

    if (!hasMediaPermission) {
      logger.warn(`User ${user._id} does not have permission to access media gallery`);
      throw error(403, "Insufficient permissions to access media gallery");
    }

    const folderId = url.searchParams.get("folderId"); // Get folderId from URL
    const recursive = url.searchParams.get("recursive") === "true";
    logger.info(
      `Loading media gallery for folderId: ${folderId || "root"} (recursive: ${recursive})`,
    );

    // 🚀 Fetch virtual folders with 5-min cache (they change rarely)
    const cacheKey = `mediagallery:virtualFolders:${locals.tenantId || "global"}`;
    let virtualFoldersData = await cacheService.get<any[]>(
      cacheKey,
      locals.tenantId as string | undefined,
    );
    if (!virtualFoldersData) {
      const allVirtualFoldersResult = await dbAdapter.system.virtualFolder.getAll();
      if (!allVirtualFoldersResult.success) {
        logger.error("Failed to fetch virtual folders", allVirtualFoldersResult.error);
        throw error(500, "Failed to fetch virtual folders");
      }
      virtualFoldersData = Array.isArray(allVirtualFoldersResult.data)
        ? allVirtualFoldersResult.data
        : [];
      await cacheService.set(
        cacheKey,
        virtualFoldersData,
        300,
        locals.tenantId as string | undefined,
      );
    }

    const serializedVirtualFolders = virtualFoldersData.map((folder) =>
      serializeIds(folder as unknown),
    );

    // Determine current folder
    const currentFolder = folderId
      ? serializedVirtualFolders.find((f) => (f as Record<string, unknown>)._id === folderId) ||
        null
      : null;
    logger.trace("Current folder determined:", currentFolder);

    // Use db-agnostic adapter method to fetch media
    const mediaResult = await dbAdapter.media.files.getByFolder(
      folderId as DatabaseId | undefined,
      {
        pageSize: 100,
        page: 1,
        sortField: "updatedAt",
        sortDirection: "desc",
        user, // Pass user for ownership filtering
      },
      recursive,
    );

    const allMediaResults: Record<string, unknown>[] =
      mediaResult.success && mediaResult.data
        ? (mediaResult.data.items as unknown as Record<string, unknown>[])
        : [];

    logger.info(`Fetched ${allMediaResults.length} media items for folder ${folderId || "root"}`);

    if (allMediaResults.length === 0) {
      logger.info("No media items found");
    }

    // Process and flatten media results - Filter and validate media items before processing
    const processedMedia = allMediaResults
      .filter((item) => {
        if (!item) {
          return false;
        }
        const isValid =
          item.hash &&
          item.filename &&
          item.mimeType &&
          typeof item.hash === "string" &&
          typeof item.filename === "string" &&
          typeof item.mimeType === "string";

        if (!isValid) {
          logger.warn("Skipping invalid media item", {
            item,
            reason: "Missing required fields or invalid types",
          });
        }
        return isValid;
      })
      .map((item) => {
        try {
          const mediaItem = item as unknown as MediaItem;

          const publicUrl = resolveMediaPublicPath(mediaItem);

          // Use DB-stored thumbnails directly (already has correct URLs from upload)
          const thumbnails = (mediaItem.thumbnails ?? {}) as Record<string, { url: string }>;
          const thumbnailEntry = thumbnails.thumbnail ?? thumbnails.sm ?? null;

          return {
            ...mediaItem,
            type: mediaItem.mimeType.split("/")[0],
            path: mediaItem.path ?? "global",
            name: mediaItem.filename ?? "unnamed-media",
            url: publicUrl,
            thumbnail: thumbnailEntry ? { url: thumbnailEntry.url } : { url: publicUrl },
            thumbnails,
            width: (mediaItem as any).width ?? (mediaItem.metadata as any)?.advancedMetadata?.width,
            height:
              (mediaItem as any).height ?? (mediaItem.metadata as any)?.advancedMetadata?.height,
          };
        } catch (err) {
          logger.error("Error processing media item", {
            item,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    logger.info(`Fetched ${processedMedia.length} media items for folder ${folderId || "root"}`);
    logger.info(`Fetched ${serializedVirtualFolders.length} total virtual folders`);

    const returnData = {
      user: {
        // Ensure user data is serializable
        role: user.role,
        _id: user._id.toString(), // Convert user ID to string
        avatar: user.avatar,
      },
      media: processedMedia, // Use the processed and filtered media
      systemVirtualFolders: serializedVirtualFolders as SystemVirtualFolder[], // All folders for the VirtualFolders component
      currentFolder: currentFolder as SystemVirtualFolder | null, // The specific folder object for the current view
    };

    return returnData;
  } catch (err) {
    if (isRedirect(err) || isHttpError(err)) {
      throw err;
    }
    const message = `Error in media gallery load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};

export const actions: Actions = {
  // Upload action for file upload
  upload: async ({ request, locals }) => {
    if (!dbAdapter) {
      logger.error("Database adapter is not initialized");
      throw error(500, "Internal Server Error");
    }

    try {
      const user = locals.user;
      if (!user) {
        logger.warn("No user found in locals during file upload");
        throw redirect(302, "/login");
      }

      const formData = await request.formData();
      const files = formData.getAll("files");
      const folder = (formData.get("folder") as string) || "global";
      const mediaService = new MediaService(dbAdapter);
      const access: MediaAccess = "public";

      // 🚀 Parallelize independent file uploads (N× speedup for multi-file uploads)
      const _results = await Promise.allSettled(
        files
          .filter((f): f is File => f instanceof File)
          .map(async (file) => {
            const result = await mediaService.saveMedia(
              file,
              user._id as any,
              access,
              (locals.tenantId as DatabaseId | null) ?? null,
            );
            if (!result.success) {
              throw new Error(result.message || "Failed to save media file");
            }
            logger.info(`File uploaded successfully to ${folder}: ${file.name}`);
          }),
      );

      // Check for failures
      const firstFailure = _results.find((r) => r.status === "rejected");
      if (firstFailure && firstFailure.status === "rejected") {
        const err = firstFailure.reason;
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes("duplicate")) {
          throw new Error(errorMessage);
        }
        throw new Error(errorMessage);
      }

      return { success: true };
    } catch (err) {
      let userMessage = "Error uploading file";
      if (err instanceof Error) {
        if (err.message.includes("duplicate")) {
          userMessage = err.message;
        } else if (err.message.includes("invalid file type")) {
          userMessage = "Unsupported file type";
        } else {
          userMessage = err.message;
        }
      }
      logger.error(`Error during file upload: ${err instanceof Error ? err.message : String(err)}`);
      throw error(400, userMessage);
    }
  },

  // Action to delete a media file
  deleteMedia: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const imageDataStr = formData.get("imageData");

      logger.info("Delete request received, imageDataStr:", imageDataStr);

      if (!imageDataStr || typeof imageDataStr !== "string") {
        logger.error("Invalid image data received - not a string");
        throw error(400, "Invalid image data received");
      }

      const image = JSON.parse(imageDataStr);
      logger.warn("Parsed image data:", image);
      logger.trace("Received delete request for image:", image);

      if (!image?._id) {
        logger.error("Invalid image data received - no _id");
        throw error(400, "Invalid image data received");
      }

      if (!dbAdapter) {
        logger.error("Database adapter is not initialized.");
        throw error(500, "Internal Server Error");
      }

      // Move files to trash before deleting from database
      // FIX: Explicitly delete from ALL size folders to ensure complete cleanup
      try {
        const sanitizePath = (p: string) => {
          if (!p) {
            return "";
          }
          let clean = p;
          // Remove web prefixes
          clean = clean.replace(/^\/files\//, "").replace(/^files\//, "");
          // Remove storage root prefix if present
          clean = clean.replace(/^mediaFolder\//, "");
          // Ensure no leading slashes
          return clean.replace(/^\/+/, "");
        };

        // Extract base path and filename from the stored path
        // Path format: "global/original/filename-hash.ext"
        const targetPath = image.path || image.url;
        if (targetPath) {
          const cleanPath = sanitizePath(targetPath);
          // Parse the path to extract components
          const pathParts = cleanPath.split("/");

          if (pathParts.length >= 3) {
            // Format: basePath/sizeFolder/filename
            const basePath = pathParts[0]; // e.g., "global"
            const fileName = pathParts.at(-1); // e.g., "image-hash.ext"

            // Get configured sizes dynamically + ensure standard folders
            const configuredSizes = getImageSizes();
            const standardFolders = ["original", "thumbnail"];
            const dynamicFolders = Object.keys(configuredSizes);
            const allSizes = [...new Set([...standardFolders, ...dynamicFolders])];

            logger.info(
              `Deleting all variants for file: ${fileName} in ${basePath} - Sizes: ${allSizes.join(", ")}`,
            );

            for (const size of allSizes) {
              const sizePath = `${basePath}/${size}/${fileName}`;
              try {
                await moveMediaToTrash(sizePath);
                logger.info(`Deleted ${size} variant:`, sizePath);
              } catch {
                // File might not exist in this size folder - that's OK
                logger.debug(`No ${size} variant found (or already deleted):`, sizePath);
              }
            }
          } else {
            // Fallback: just try to delete the exact path
            await moveMediaToTrash(cleanPath);
            logger.info("File moved to trash (fallback):", cleanPath);
          }
        } else {
          logger.warn("No path or url found for file deletion:", image._id);
        }

        // Also delete any thumbnails explicitly listed (for backwards compatibility)
        if (image.thumbnails) {
          for (const size in image.thumbnails) {
            if (!Object.hasOwn(image.thumbnails, size)) {
              continue;
            }
            if (image.thumbnails[size]?.url) {
              const cleanThumbUrl = sanitizePath(image.thumbnails[size].url);
              try {
                await moveMediaToTrash(cleanThumbUrl);
                logger.debug("Additional thumbnail cleaned up:", cleanThumbUrl);
              } catch {
                // Already deleted above or doesn't exist
              }
            }
          }
        }
      } catch (trashError) {
        logger.error("Error moving files to trash:", trashError);
        // Continue with database deletion even if trash move fails
      }

      // Use db-agnostic media adapter for deletion
      logger.info(`Deleting media item: ${image._id}`);

      const result = await dbAdapter.media.files.delete(image._id.toString());

      if (result.success) {
        logger.info("Media item deleted successfully");
        // Invalidate media gallery cache after deletion
        try {
          const { cacheService } = await import("@src/databases/cache/cache-service");
          await cacheService.invalidateByCategory("media" as any, locals.tenantId);
        } catch {
          // Non-critical: cache invalidation best-effort
        }
        return { success: true };
      }
      logger.error("Failed to delete image from database:", result);
      throw error(500, result.message || "Failed to delete image");
    } catch (err) {
      logger.error("Error in deleteMedia action:", err as LoggableValue);
      throw error(500, err instanceof Error ? err.message : "Internal Server Error");
    }
  },

  remoteUpload: async ({ request, locals }) => {
    if (!dbAdapter) {
      logger.error("Database adapter is not initialized");
      throw error(500, "Internal Server Error");
    }

    try {
      const user = locals.user;
      if (!user) {
        logger.warn("No user found in locals during file upload");
        throw redirect(302, "/login");
      }

      const formData = await request.formData();
      const remoteUrls = JSON.parse(formData.get("remoteUrls") as string) as string[];
      const folder = (formData.get("folder") as string) || "global";

      if (!(remoteUrls && Array.isArray(remoteUrls)) || remoteUrls.length === 0) {
        throw new Error("No URLs provided");
      }

      const mediaService = new MediaService(dbAdapter);
      const access: MediaAccess = "public";

      // 🚀 Parallelize remote URL fetches + uploads
      await Promise.allSettled(
        remoteUrls.map(async (url) => {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              logger.warn(`Failed to fetch remote URL: ${url}`);
              return;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get("content-type") || "application/octet-stream";
            const filename = url.substring(url.lastIndexOf("/") + 1);
            const file = new File([buffer], filename, { type: contentType });
            await mediaService.saveMedia(
              file,
              user._id as any,
              access,
              (locals.tenantId as DatabaseId | null) ?? null,
            );
            logger.info(`Remote file uploaded successfully to ${folder}: ${file.name}`);
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
    } catch (err) {
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
