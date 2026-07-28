/**
 * @file src/utils/media/media-reference-index.ts
 * @description
 * Lightweight in-memory reverse-index that maps media IDs/paths to the
 * collection entries that reference them.  Replaces the O(n × entries)
 * full-scan in `getMediaReferences()` with O(1) indexed lookups.
 *
 * ### Design
 * - The index lives in a `Map<string, MediaReference[]>` keyed by media
 *   identifier (hash, path, or URL fragment).
 * - On first query it triggers a **full rebuild** by scanning every
 *   entry in every collection.  Subsequent queries are O(1) reads.
 * - `isBuilt` tracks whether a rebuild has completed — empty results for
 *   an unknown mediaId must NOT re-trigger a full scan (that OOM'd
 *   integration tests on DELETE of nonexistent IDs).
 * - Circular object graphs are guarded with a WeakSet during scan.
 *
 * ### Features:
 * - Bulk `rebuild()` from entry arrays
 * - Atomic `setReferences()` for incremental hook updates
 * - `hasPublishedReferences()` for fast protection checks
 * - `isBuilt` / `markBuilt()` for stable empty lookups
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
  /** True after a successful rebuild() or explicit markBuilt(). */
  private built = false;

  /** Whether a full rebuild has been performed for this index lifetime. */
  isBuilt(): boolean {
    return this.built;
  }

  /** Mark index ready without scanning (e.g. empty install). */
  markBuilt(): void {
    this.built = true;
  }

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
      // fieldPath starts empty — do NOT pass entry.status as fieldPath
      this.scanEntry(
        entry.collectionId,
        entry.collectionName,
        entry.entryId,
        entry.data,
        "",
        new WeakSet(),
      );
    }
    this.built = true;
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
    seen: WeakSet<object> = new WeakSet(),
  ): void {
    if (typeof data !== "object" || data === null) return;

    if (seen.has(data as object)) return;
    seen.add(data as object);

    if (Array.isArray(data)) {
      data.forEach((item, i) =>
        this.scanEntry(collectionId, collectionName, entryId, item, `${fieldPath}[${i}]`, seen),
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
        this.scanEntry(collectionId, collectionName, entryId, value, fullPath, seen);
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
    this.built = false;
  }
}
