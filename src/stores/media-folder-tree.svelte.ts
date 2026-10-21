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
  folders = $state.raw<MediaFolderRecord[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);
  /** A load has been attempted (success or failure) — see ensureLoaded. */
  hasLoaded = $state(false);

  /**
   * Load once per session. Callers that only need the list to *exist* must use
   * this, never `load()`: an empty result or a failed request both leave
   * `folders` empty, so a `folders.length === 0` guard would re-fire forever
   * inside a reactive effect.
   */
  async ensureLoaded(): Promise<void> {
    if (this.hasLoaded || this.isLoading) return;
    await this.load();
  }

  /**
   * Fetch (or re-fetch) the flat folder list. Use for explicit refreshes
   * (folder created/renamed/deleted); use ensureLoaded() for first paint.
   * Cache-busts the API L1 cache so create/rename/delete appear immediately.
   */
  async load(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const res = await fetch(`/api/system-virtual-folder?t=${Date.now()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload: unknown = await res.json();
      // The endpoint may answer with the raw array, a `{ success, data }`
      // envelope, or a paginated `{ items }` payload depending on the adapter.
      // Normalize all three instead of assuming one shape — a shape mismatch
      // used to surface as the misleading "Failed to load folders" toast even
      // though the request succeeded.
      const envelope = (payload ?? {}) as {
        data?: unknown;
        items?: unknown;
      };
      const payloadData = envelope.data;
      const dataEnvelope = (payloadData ?? {}) as { items?: unknown; data?: unknown };
      const rows: unknown[] = Array.isArray(payloadData)
        ? payloadData
        : Array.isArray(dataEnvelope.items)
          ? dataEnvelope.items
          : Array.isArray(dataEnvelope.data)
            ? dataEnvelope.data
            : Array.isArray(payload)
              ? payload
              : [];

      this.folders = rows
        .filter((value): value is RawFolder => {
          if (!value || typeof value !== "object") return false;
          const folder = value as Partial<RawFolder>;
          return typeof folder.path === "string" && folder.path.length > 0;
        })
        .filter((f) => f.path.startsWith("/"))
        .map((f) => ({
          id: String(f._id),
          name: f.name,
          path: f.path,
          parentId: f.parentId ?? null,
          order: f.order ?? 0,
        }));
    } catch (err) {
      this.error = "Failed to load folders";
      logger.error("[MediaFolderTree] Load error:", err);
    } finally {
      this.isLoading = false;
      this.hasLoaded = true;
    }
  }

  getFolder(id: string): MediaFolderRecord | undefined {
    return this.folders.find((f) => f.id === id);
  }

  /** Direct children of a level. `root` = top-level orphans (no known parent). */
  childrenOf(levelId: string): MediaFolderRecord[] {
    const list =
      levelId === "root"
        ? this.folders.filter((f) => !f.parentId || !this.folders.some((p) => p.id === f.parentId))
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
