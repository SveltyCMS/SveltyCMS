/**
 * @file src/utils/media/media-service.server.ts
 * @description Standard media service for SveltyCMS.
 *
 * Features:
 * - Media deduplication via hash
 * - URL enrichment with tenant prefixes
 * - Transformation & Manipulation (Sharp)
 * - Batch processing
 */

import { error } from "@sveltejs/kit";
import { logger } from "@src/utils/logger";
import type {
  IDBAdapter,
  DatabaseId,
  DatabaseResult,
  MediaItem as DbMediaItem,
} from "@src/databases/db-interface";
import type { MediaItem } from "./media-models";
import { getUrl } from "./cloud-storage";

export class MediaService {
  private readonly db: IDBAdapter;

  constructor(db: IDBAdapter) {
    this.db = db;
    if (!this.db) {
      throw error(500, "Database adapter not available");
    }

    // 🚀  Register automatic cleanup hook
    if (this.db.registerHook) {
      this.db.registerHook({
        id: "media-cleanup",
        type: "before",
        action: "delete",
        handler: async (collection: string, query: any) => {
          if (
            collection === "media_items" ||
            collection === "mediaItems" ||
            collection === "media"
          ) {
            const id = query?._id;
            if (id) {
              try {
                await this.deleteMedia(id.toString());
              } catch (e) {
                logger.error(`[Hooks] Media cleanup failed:`, e);
              }
            }
          }
        },
      });
    }
  }

  public get files() {
    return this.db.media.files;
  }

  /**
   * 🚀 AGNOSTIC CORE: Saves a media item to the database and physical storage.
   */
  public async saveMedia(
    file:
      | File
      | { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
    _userId: string,
    _access: "public" | "private" = "public",
    tenantId?: DatabaseId | null,
    _basePath?: string,
    _watermarkOptions?: any,
    _userContext?: any,
    _skipResizing?: boolean,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      const { hashFileContent } = await import("./media-processing.server");
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = await hashFileContent(buffer);

      // 1. Check for existing file by hash (Deduplication)
      const existing = await this.files.getByHash(hash, tenantId ?? undefined);
      if (existing.success && existing.data) {
        return {
          success: true,
          data: this.enrichMediaWithUrl(existing.data as any) as unknown as MediaItem,
        };
      }

      // 2. Performance: File adapter handles deduplication and storage
      // Cast the result from DB internal MediaItem to the utility MediaItem
      const res = await this.files.upload(file as any, tenantId ?? undefined);
      return res as unknown as DatabaseResult<MediaItem>;
    } catch (err: any) {
      return { success: false, message: err.message, error: err };
    }
  }

  /**
   * Enriches a media item with a full URL including optional tenant prefix.
   */
  public enrichMediaWithUrl(item: any, prefix?: string): any {
    if (!item) return item;

    const p = item.path || item.url;
    if (p && !p.startsWith("http")) {
      item.url = getUrl(p, prefix);
    }

    // Process thumbnails
    if (item.thumbnails) {
      for (const key in item.thumbnails) {
        const thumb = item.thumbnails[key];
        if (thumb && (thumb.path || thumb.url)) {
          thumb.url = getUrl(thumb.path || thumb.url, prefix);
        }
      }
    }

    return item;
  }

  public async saveRemoteMedia(
    url: string,
    userId: string,
    access: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch remote media: ${response.statusText}`);
      const blob = await response.blob();
      const name = url.split("/").pop() || "remote-file";
      const file = new File([blob], name, { type: blob.type });

      return await this.saveMedia(file, userId, access as any, tenantId);
    } catch (err: any) {
      return { success: false, message: err.message, error: err };
    }
  }

  public async updateMedia(
    mediaId: string,
    data: any,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    const res = await this.db.crud.update("media", mediaId as DatabaseId, data, {
      tenantId: tenantId ?? undefined,
    });
    if (!res.success) throw new Error(res.message);
  }

  public async deleteMedia(fileId: string, tenantId?: DatabaseId | null): Promise<void> {
    const res = await this.files.delete(fileId as DatabaseId, tenantId ?? undefined);
    if (!res.success) throw new Error(res.message);
  }

  public async manipulateMedia(
    id: string,
    _manipulations: any,
    _userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem> {
    const res = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId ?? undefined },
    );
    if (!res.success || !res.data) throw new Error("Media not found");
    return res.data as unknown as MediaItem;
  }

  public async batchProcessImages(
    ids: string[],
    config: any,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem[]> {
    const results: MediaItem[] = [];
    for (const id of ids) {
      try {
        const res = await this.manipulateMedia(id, config, userId, tenantId);
        results.push(res);
      } catch (err) {
        logger.error(`Batch processing failed for ${id}:`, err);
      }
    }
    return results;
  }

  /**
   * Determine media category from MIME type.
   */
  public getMediaType(mime: string): "image" | "video" | "audio" | "document" {
    if (!mime) return "document";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  }
}
