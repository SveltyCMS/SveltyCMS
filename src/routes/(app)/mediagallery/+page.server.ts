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
 *
 * ### Security
 * - Mutations require media:write (action-level — not only page load)
 * - Remote URLs go through saveRemoteMediaUrls → MediaService.saveRemoteMedia
 *   (validateEgressUrl + safeFetch egress-guard SSRF defense, re-checked per
 *   redirect hop)
 */

import type { DatabaseId } from "@root/src/content/types";

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
function loadCacheServiceModule(): Promise<typeof import("@src/databases/cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

// Utils
import type { MediaItem, SystemVirtualFolder } from "@root/src/databases/db-interface";
import type { MediaAccess } from "@root/src/utils/media/media-models";
// Auth
import { dbAdapter } from "@src/databases/db";
import {
  allowMediaSortDirection,
  allowMediaSortField,
} from "@src/services/sdk/namespaces/media-namespace";
import { cacheService } from "@src/databases/cache/cache-service";
import { isAdmin } from "@src/databases/auth/constants";
import { error, isHttpError, isRedirect } from "@sveltejs/kit";
import { getAuthenticatedUser, requirePagePermission } from "@utils/page-guards.server";
// System Logger
import { type LoggableValue, logger } from "@utils/logger";
import { getImageSizes, moveMediaToTrash } from "@utils/media/media-storage.server";
import { resolveMediaPublicPath } from "@utils/media/media-utils";
import type { Actions, PageServerLoad } from "./$types";
import { matchesJsonPathFilter } from "@utils/json-path-filter";
import { toGalleryListItem } from "./gallery-list-item";

/**
 * One server page of gallery rows. The grid/table reveal more via `?page=`;
 * `total` is the adapter's COUNT, so the UI can say "100 of 2,431" instead of
 * pretending the first slice is the whole folder.
 */
const GALLERY_PAGE_SIZE = 100;
/** Absurd `?page=` values would otherwise become a huge OFFSET scan. */
const MAX_GALLERY_PAGE = 10_000;

interface GalleryPage {
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

function parseGalleryPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_GALLERY_PAGE);
}

/**
 * 🚀 Fast serializer: converts _id/parent ObjectIds to strings.
 * Uses JSON.stringify with a replacer — far faster than the previous
 * iterative DFS walker (eliminated ~50ms per large folder tree).
 */
function serializeIds<T>(obj: T): T {
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
    const user = getAuthenticatedUser(locals);
    const isAdminUser = locals.isAdmin === true || isAdmin(user);
    // Admin early-return in handleAuthorization can leave locals.roles undefined — never
    // call Object.values on undefined (that 500s the whole media gallery).
    const tenantRoles = (locals.roles ?? []) as Array<{ permissions?: string[] }>;

    // Check if user has permission to access media gallery
    const hasMediaPermission =
      isAdminUser ||
      tenantRoles.some(
        (role) =>
          (role.permissions || []).includes("media:read") ||
          (role.permissions || []).includes("media:write"),
      );

    if (!hasMediaPermission) {
      logger.warn(`User ${user._id} does not have permission to access media gallery`);
      throw error(403, "Insufficient permissions to access media gallery");
    }

    const folderId = url.searchParams.get("folderId"); // Get folderId from URL
    const recursive = url.searchParams.get("recursive") === "true";
    // 1-based server page — the gallery used to hardcode page 1 and silently
    // drop every asset past the first 100.
    const mediaPage = parseGalleryPage(url.searchParams.get("page"));
    // Server-side JSON path filter (shareable via URL; same syntax as client filter)
    const jsonPath = (url.searchParams.get("jsonPath") || url.searchParams.get("jsonpath") || "")
      .trim()
      .slice(0, 500);
    logger.debug(
      `Loading media gallery for folderId: ${folderId || "root"} (recursive: ${recursive}${jsonPath ? `, jsonPath` : ""})`,
    );

    // 🚀 Fetch virtual folders with SWR (5 min fresh, 30 min stale)
    // Soft-fail: empty tree is preferable to a 500 on the whole gallery.
    // 🔐 Explicit tenant scope: this load uses the raw module adapter (no request
    // binding), so an omitted tenantId fails closed under MULTI_TENANT. `null` is
    // the documented global scope for the global administrator.
    const tenantId = (locals.tenantId ?? null) as DatabaseId | null;
    const vfCacheKey = `mediagallery:virtualFolders:${locals.tenantId || "global"}`;

    // 🚀 The folder tree and the media listing are independent reads — run them
    // together instead of paying both round-trips back to back. Each branch keeps
    // its own soft-fail (an empty tree/list beats a 500 on the whole gallery).
    const [virtualFolders, mediaResultPage] = await Promise.all([
      (async (): Promise<SystemVirtualFolder[]> => {
        try {
          const cached = await cacheService.getOrSetSWR<SystemVirtualFolder[]>(
            vfCacheKey,
            async () => {
              const result = await dbAdapter.system.virtualFolder.getAll({ tenantId });
              if (!result.success) {
                logger.warn("Virtual folder fetch failed — returning empty list");
                return [];
              }
              return Array.isArray(result.data) ? result.data : [];
            },
            300_000, // Fresh: 5 min
            1_800_000, // Stale: 30 min (serve stale while refreshing)
          );
          return cached ?? [];
        } catch (vfErr) {
          logger.warn(
            `Virtual folder load failed (non-fatal): ${vfErr instanceof Error ? vfErr.message : String(vfErr)}`,
          );
          return [];
        }
      })(),
      (async (): Promise<GalleryPage> => {
        const emptyPage: GalleryPage = {
          items: [],
          page: mediaPage,
          pageSize: GALLERY_PAGE_SIZE,
          total: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
        // Use db-agnostic adapter method to fetch media (soft-fail: empty list > 500)
        try {
          const getByFolder = dbAdapter.media?.files?.getByFolder;
          if (typeof getByFolder !== "function") {
            logger.warn("media.files.getByFolder is unavailable — returning empty media list");
            return emptyPage;
          }
          const mediaResult = await getByFolder(folderId as DatabaseId | undefined, {
            pageSize: GALLERY_PAGE_SIZE,
            page: mediaPage,
            sortField: allowMediaSortField(url.searchParams.get("sort")),
            sortDirection: allowMediaSortDirection(url.searchParams.get("dir")),
            recursive,
            user, // Pass user for ownership filtering
            tenantId, // Explicit scope (raw adapter — see note above)
            // Push metadata.* clauses into SQLite JSON1 / PG jsonb / Mongo when possible
            ...(jsonPath ? { jsonPath } : {}),
          });
          if (!mediaResult?.success || !mediaResult.data) return emptyPage;
          const { items, total, hasNextPage, hasPreviousPage } = mediaResult.data;
          const pageItems = (items as unknown as Record<string, unknown>[]) || [];
          return {
            items: pageItems,
            page: mediaPage,
            pageSize: GALLERY_PAGE_SIZE,
            total: typeof total === "number" ? total : pageItems.length,
            hasNextPage: hasNextPage === true,
            hasPreviousPage: hasPreviousPage === true,
          };
        } catch (mediaErr) {
          logger.warn(
            `Media getByFolder failed (non-fatal): ${mediaErr instanceof Error ? mediaErr.message : String(mediaErr)}`,
          );
          return emptyPage;
        }
      })(),
    ]);

    const allMediaResults = mediaResultPage.items;

    // Determine current folder (id compare without a JSON round-trip per folder)
    const currentFolder = folderId
      ? virtualFolders.find((f) => String(f?._id ?? "") === folderId) || null
      : null;
    logger.trace("Current folder determined:", currentFolder);

    logger.debug(
      `Fetched ${allMediaResults.length} items (page ${mediaResultPage.page}, total ${mediaResultPage.total}) folder ${folderId || "root"}`,
    );

    if (allMediaResults.length === 0) {
      logger.debug("No media items found");
    }

    // Optional server-side JSON path filter — must run on the RAW adapter rows,
    // NOT the mapped gallery items: toGalleryListItem → slimMetadata strips
    // arbitrary metadata fields (camera, iso, … are not in META_KEEP), so a
    // second pass over the slimmed shape would drop every row even when the DB
    // query already matched it via json_extract (media-jsonpath regression).
    let filteredSource = allMediaResults;
    if (jsonPath) {
      filteredSource = allMediaResults.filter((item) => matchesJsonPathFilter(item, jsonPath));
      logger.debug(
        `JSON path filter "${jsonPath}" reduced media ${allMediaResults.length} → ${filteredSource.length}`,
      );
    }

    const processedMedia = filteredSource
      .map((item) => {
        if (!item) return null;
        const mediaItem = item as unknown as MediaItem;
        const publicUrl = resolveMediaPublicPath(mediaItem);
        const row = toGalleryListItem({
          ...mediaItem,
          url: publicUrl,
          _id: mediaItem._id,
        } as unknown as Record<string, unknown>);
        if (!row) {
          logger.warn("Skipping invalid media item", {
            reason: "Missing required fields or invalid types",
          });
        }
        return row;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    logger.debug(`Fetched ${processedMedia.length} media items for folder ${folderId || "root"}`);
    logger.debug(`Fetched ${virtualFolders.length} total virtual folders`);

    // 🚀 Check which media items are referenced by published content
    // One index rebuild + O(1) lookups — never N parallel full collection scans.
    let publishedMediaIds: string[] = [];
    try {
      const { MediaService } = await import("@src/utils/media/media-service.server");
      const mediaService = new MediaService(dbAdapter);
      publishedMediaIds = await mediaService.getPublishedReferencedIds(
        processedMedia.map((item) => String(item._id)),
        (locals.tenantId as DatabaseId | null) ?? null,
      );
      logger.debug(`Found ${publishedMediaIds.length} media items referenced by published content`);
    } catch (refErr) {
      logger.warn(
        `Published-content reference scan failed (non-fatal): ${refErr instanceof Error ? refErr.message : String(refErr)}`,
      );
    }

    // Force JSON-safe payload — Buffers/ObjectIds in avatar or media metadata
    // previously crashed SvelteKit serialization after a successful load (500 UI).
    // One stringify for the whole tree (not once per folder).
    //
    // NOTE: do not return `user` here. Page data merges over layout data, and this
    // load used to return a slim `{ role, _id, avatar }` object that shadowed the
    // layout's full `safeUser` — which is why the sidebar footer lost the username
    // on /mediagallery only. Nothing in this route reads `data.user`.
    return serializeIds({
      media: processedMedia,
      systemVirtualFolders: virtualFolders as SystemVirtualFolder[],
      currentFolder: currentFolder as SystemVirtualFolder | null,
      publishedMediaIds,
      /** Echo server-applied JSON path filter for client sync / shareable URLs */
      jsonPathFilter: jsonPath || "",
      /** Server pagination — `total` is the folder count, not the rendered slice */
      mediaPagination: {
        page: mediaResultPage.page,
        pageSize: mediaResultPage.pageSize,
        total: mediaResultPage.total,
        hasNextPage: mediaResultPage.hasNextPage,
        hasPreviousPage: mediaResultPage.hasPreviousPage,
      },
    });
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
      // 🛡️ Action-level RBAC (load gates UI only — never rely on load for mutations)
      const user = getAuthenticatedUser(locals);
      requirePagePermission(locals, "media:write", "Insufficient permissions to upload media");

      const formData = await request.formData();
      const files = formData.getAll("files");
      const folder = (formData.get("folder") as string) || "global";
      const { MediaService } = await import("@src/utils/media/media-service.server");
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
              folder, // _basePath — target virtual folder; "global" keeps root
            );
            if (!result.success) {
              throw new Error(result.message || "Failed to save media file");
            }
            logger.debug(`File uploaded successfully to ${folder}: ${file.name}`);
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

      // Invalidate the media list caches so API consumers see the new rows
      // immediately (the delete action already does this; uploads were missing it).
      try {
        const { cacheService } = await loadCacheServiceModule();
        await cacheService.invalidateByCategory("media" as any, locals.tenantId);
      } catch {
        // Non-critical: cache invalidation best-effort
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
      requirePagePermission(locals, "media:delete", "Insufficient permissions to delete media");

      const formData = await request.formData();
      const imageDataStr = formData.get("imageData");

      logger.debug("Delete request received, imageDataStr:", imageDataStr);

      if (!imageDataStr || typeof imageDataStr !== "string") {
        logger.error("Invalid image data received - not a string");
        throw error(400, "Invalid image data received");
      }

      const image = JSON.parse(imageDataStr);
      logger.debug("Delete request parsed for image:", image?._id);

      if (!image?._id) {
        logger.error("Invalid image data received - no _id");
        throw error(400, "Invalid image data received");
      }

      if (!dbAdapter) {
        logger.error("Database adapter is not initialized.");
        throw error(500, "Internal Server Error");
      }

      // Move files to trash before deleting from database
      // Explicitly delete from ALL size folders to ensure complete cleanup
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

            logger.debug(
              `Deleting all variants for file: ${fileName} in ${basePath} - Sizes: ${allSizes.join(", ")}`,
            );

            for (const size of allSizes) {
              const sizePath = `${basePath}/${size}/${fileName}`;
              try {
                await moveMediaToTrash(sizePath);
                logger.debug(`Deleted ${size} variant:`, sizePath);
              } catch {
                // File might not exist in this size folder - that's OK
                logger.debug(`No ${size} variant found (or already deleted):`, sizePath);
              }
            }
          } else {
            // Fallback: just try to delete the exact path
            await moveMediaToTrash(cleanPath);
            logger.debug("File moved to trash (fallback):", cleanPath);
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

      // Use db-agnostic media adapter for deletion with tenant scoping
      logger.debug(`Deleting media item: ${image._id}`);

      const tenantId = (locals.tenantId as DatabaseId | null) ?? null;
      const result = await dbAdapter.media.files.delete(
        image._id.toString(),
        tenantId ? { tenantId } : undefined,
      );

      if (result.success) {
        logger.debug("Media item deleted successfully");
        // Invalidate media gallery cache after deletion
        try {
          const { cacheService } = await loadCacheServiceModule();
          await cacheService.invalidateByCategory("media" as any, locals.tenantId);
        } catch {
          // Non-critical: cache invalidation best-effort
        }
        return { success: true };
      }
      logger.error("Failed to delete image from database:", result);
      throw error(500, result.message || "Failed to delete image");
    } catch (err) {
      if (isHttpError(err) || isRedirect(err)) throw err;
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
      // 🛡️ Action-level RBAC — load media:read alone must not allow remote fetch/upload
      const user = getAuthenticatedUser(locals);
      requirePagePermission(locals, "media:write", "Insufficient permissions to upload media");

      const formData = await request.formData();
      const remoteUrls = JSON.parse(formData.get("remoteUrls") as string) as string[];
      const folder = (formData.get("folder") as string) || "global";
      const { saveRemoteMediaUrls } = await import("./save-remote-urls.server");
      const result = await saveRemoteMediaUrls({
        urls: remoteUrls,
        folder,
        userId: String(user._id),
        tenantId: (locals.tenantId as DatabaseId | null) ?? null,
      });
      if (!result.success) throw new Error(result.error || "No URLs provided");
      return { success: true };
    } catch (err) {
      // Preserve 403 from requirePagePermission / redirects from getAuthenticatedUser
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
