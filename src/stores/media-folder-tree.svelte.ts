/**
 * @file src/stores/media-folder-tree.svelte.ts
 * @description
 * Shared flat list of media virtual folders for the sidebar tree and the
 * mobile drag folder rail. One fetch, many consumers.
 *
 * ### Features:
 * - cache-busted GET /api/system-virtual-folder
 * - childrenOf / getFolder helpers for rail drill-in
 * - event-driven refresh (folderCreated / Updated / Deleted)
 */

import { logger } from "@utils/logger";

export interface MediaFolderRecord {
  id: string;
  name: string;
  path: string;
  parentId?: string | null;
  order: number;
}

interface RawFolder {
  _id: string;
  name: string;
  order?: number;
  parentId?: string | null;
  path: string;
}

class MediaFolderTreeStore {
  folders = $state<MediaFolderRecord[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  /**
   * Fetch (or re-fetch) the flat folder list.
   * Cache-busts the API L1 cache so create/rename/delete appear immediately.
   */
  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const res = await fetch(`/api/system-virtual-folder?t=${Date.now()}`);
      if (!res.ok) throw new Error("Network error");
      const { success, data } = await res.json();
      if (!(success && data)) throw new Error("Invalid response");

      this.folders = (data as RawFolder[])
        .filter((f) => f.path?.startsWith("/"))
        .map((f) => ({
          id: f._id,
          name: f.name,
          path: f.path,
          parentId: f.parentId,
          order: f.order ?? 0,
        }));
    } catch (err) {
      this.error = "Failed to load folders";
      logger.error("[MediaFolderTree] Load error:", err);
    } finally {
      this.isLoading = false;
    }
  }

  getFolder(id: string): MediaFolderRecord | undefined {
    return this.folders.find((f) => f.id === id);
  }

  /** Direct children of a level. `root` = top-level orphans (no known parent). */
  childrenOf(levelId: string): MediaFolderRecord[] {
    const list =
      levelId === "root"
        ? this.folders.filter(
            (f) => !f.parentId || !this.folders.some((p) => p.id === f.parentId),
          )
        : this.folders.filter((f) => f.parentId === levelId);
    return [...list].sort((a, b) => a.order - b.order);
  }

  /** Parent folder id, or `root` when at the top. */
  parentLevelOf(levelId: string): string {
    if (levelId === "root") return "root";
    const parentId = this.getFolder(levelId)?.parentId;
    return parentId && this.getFolder(parentId) ? parentId : "root";
  }

  /** Root → … → level name chain for the rail path label. */
  pathOf(levelId: string): MediaFolderRecord[] {
    if (levelId === "root") return [];
    const chain: MediaFolderRecord[] = [];
    let current = this.getFolder(levelId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? this.getFolder(current.parentId) : undefined;
    }
    return chain;
  }
}

export const mediaFolderTree = new MediaFolderTreeStore();
