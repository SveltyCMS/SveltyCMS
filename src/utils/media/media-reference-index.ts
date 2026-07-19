/**
 * @file src/utils/media/media-reference-index.ts
 * @description
 * Lightweight in-memory reverse-index that maps media IDs/paths to the
 * collection entries that reference them.  Replaces the O(n × entries)
 * full-scan in `getMediaReferences()` with O(log n) indexed lookups.
 *
 * ### Design
 * - The index lives in a `Map<string, MediaReference[]>` keyed by media
 *   identifier (hash, path, or URL fragment).
 * - On first query it triggers a **full rebuild** by scanning every
 *   entry in every collection.  Subsequent queries are O(1) reads.
 * - For production workloads with thousands of entries consider a
 *   periodic rebuild via `setInterval` or a stale-while-revalidate
 *   pattern to avoid a synchronous stall on the first query.
 *
 * ### Features:
 * - Bulk `rebuild()` from entry arrays
 * - Atomic `setReferences()` for incremental hook updates
 * - `hasPublishedReferences()` for fast protection checks
 */

export interface MediaReference {
  mediaId: string;
  mediaPath: string;
  collectionId: string;
  collectionName: string;
  entryId: string;
  fieldPath: string;
  fieldName?: string;
  entryName?: string;
}

export class MediaReferenceIndex {
  private references = new Map<string, MediaReference[]>();

  /** Replace all references for a given mediaId atomically. */
  setReferences(mediaId: string, refs: MediaReference[]): void {
    this.references.set(mediaId, refs);
  }

  /** Get all references for a mediaId (O(1) after index is built). */
  getReferences(mediaId: string): MediaReference[] {
    return this.references.get(mediaId) ?? [];
  }

  /** Check if media is referenced by any published content. */
  hasPublishedReferences(mediaId: string, checkStatus: (entryId: string) => boolean): boolean {
    const refs = this.getReferences(mediaId);
    return refs.some((r) => checkStatus(r.entryId));
  }

  /**
   * Rebuild the entire index from a full scan of all collection entries.
   * Call this on first access or after a cache invalidation.
   */
  rebuild(
    entries: Array<{
      collectionId: string;
      collectionName: string;
      entryId: string;
      data: Record<string, unknown>;
      status?: string;
    }>,
  ): void {
    this.references.clear();
    for (const entry of entries) {
      this.scanEntry(
        entry.collectionId,
        entry.collectionName,
        entry.entryId,
        entry.data,
        entry.status,
      );
    }
  }

  /**
   * Recursively scan an entry data blob looking for media references.
   */
  private scanEntry(
    collectionId: string,
    collectionName: string,
    entryId: string,
    data: unknown,
    fieldPath = "",
  ): void {
    if (typeof data !== "object" || data === null) return;

    if (Array.isArray(data)) {
      data.forEach((item, i) =>
        this.scanEntry(collectionId, collectionName, entryId, item, `${fieldPath}[${i}]`),
      );
      return;
    }

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const fullPath = fieldPath ? `${fieldPath}.${key}` : key;

      if (typeof value === "string" && this.looksLikeMediaPath(value)) {
        const refs = this.references.get(value) ?? [];
        refs.push({
          mediaId: value,
          mediaPath: value,
          collectionId,
          collectionName,
          entryId,
          fieldPath: fullPath,
        });
        this.references.set(value, refs);
      } else if (typeof value === "object" && value !== null) {
        this.scanEntry(collectionId, collectionName, entryId, value, fullPath);
      }
    }
  }

  /**
   * Heuristic to detect whether a string value is a media reference.
   * Matches known storage paths, file-serving routes, or bare hex hashes.
   */
  private looksLikeMediaPath(value: string): boolean {
    return (
      value.includes("/original/") || value.includes("/files/") || /^[a-f0-9]{32,}$/.test(value)
    );
  }

  /** Drop the entire index (e.g. before a full rebuild). */
  clear(): void {
    this.references.clear();
  }
}
