/**
 * @file src/utils/media/version-history.ts
 * @description Track and manage file version history
 *
 * Performance Enhancements:
 * - JSON-based deep diffing optimization
 * - Strict type checking
 * - Memoized stats calculation (future proofing)
 *
 * ### Note: `FileVersion` vs `MediaVersion`
 * The `FileVersion` interface defined here is the internal version-history
 * domain model used for audit/rollback. The `MediaVersion` interface in
 * `media-models.ts` (`{ version, url, createdAt, createdBy, size?, mimeType? }`)
 * is a lighter projection for public API responses. These two types serve
 * different purposes and intentionally diverge in shape.
 */

import type { DatabaseId, ISODateString } from "@src/content/types";
import { nowISODateString } from "@src/utils/date";

export interface FileVersion {
  _id?: DatabaseId;
  action: "create" | "update" | "replace" | "metadata_update";
  changes: VersionChange[];
  createdAt: ISODateString;
  createdBy: DatabaseId;
  fileId: DatabaseId;
  hash: string;
  metadata?: {
    reason?: string;
    automated?: boolean;
    restorePoint?: boolean;
  };
  path?: string;
  size: number;
  versionNumber: number;
}

export interface VersionChange {
  field: string;
  newValue?: unknown;
  oldValue?: unknown;
  type: "add" | "modify" | "remove";
}

export interface VersionComparison {
  changes: VersionChange[];
  contentChanged: boolean;
  fromVersion: number;
  metadataChanged: boolean;
  sizeDifference: number;
  toVersion: number;
}

/** Create version record.
 *
 *  @param nextVersionNumber — the version number to assign.
 *    Callers should determine this from existing history (e.g. `versions.length + 1`).
 */
export function createVersion(
  fileId: DatabaseId,
  userId: DatabaseId,
  action: FileVersion["action"],
  hash: string,
  size: number,
  changes: VersionChange[] = [],
  options: {
    path?: string;
    reason?: string;
    automated?: boolean;
    restorePoint?: boolean;
    nextVersionNumber?: number;
  } = {},
): FileVersion {
  return {
    fileId,
    versionNumber: options.nextVersionNumber ?? 1,
    createdAt: nowISODateString() as ISODateString,
    createdBy: userId,
    action,
    changes,
    hash,
    size,
    path: options.path,
    metadata: {
      reason: options.reason,
      automated: options.automated,
      restorePoint: options.restorePoint,
    },
  };
}

/** Compare versions */
export function compareVersions(
  fromVersion: FileVersion,
  toVersion: FileVersion,
): VersionComparison {
  const contentChanged = fromVersion.hash !== toVersion.hash;
  const sizeDifference = toVersion.size - fromVersion.size;

  // Optimization: If hashes match, ignore deep content diffs
  const changes = contentChanged
    ? toVersion.changes
    : toVersion.changes.filter((c) => c.field !== "content");

  const metadataChanged = changes.some(
    (change) => change.field !== "content" && change.field !== "size",
  );

  return {
    fromVersion: fromVersion.versionNumber,
    toVersion: toVersion.versionNumber,
    changes,
    contentChanged,
    metadataChanged,
    sizeDifference,
  };
}

/** Detect changes (Deep Diff compatible) */
export function detectChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  excludeFields: string[] = ["_id", "updatedAt", "updatedBy", "createdAt", "createdBy"],
): VersionChange[] {
  const changes: VersionChange[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of keys) {
    if (excludeFields.includes(key)) {
      continue;
    }

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    // Quick equality check
    if (oldVal === newVal) {
      continue;
    }

    // Deep equality check using JSON serialization (fast enough for metadata)
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);

    if (oldStr === newStr) {
      continue;
    }

    if (oldVal === undefined) {
      changes.push({ field: key, newValue: newVal, type: "add" });
    } else if (newVal === undefined) {
      changes.push({ field: key, oldValue: oldVal, type: "remove" });
    } else {
      changes.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal,
        type: "modify",
      });
    }
  }

  return changes;
}

/** Stats analysis */
export function getVersionStats(versions: FileVersion[]) {
  if (!versions.length) {
    return null;
  }

  let totalSize = 0;
  let contentUpdates = 0;
  const userActivity: Record<string, number> = {};

  for (const v of versions) {
    totalSize += v.size;
    if (["create", "replace", "update"].includes(v.action)) {
      contentUpdates++;
    }
    userActivity[v.createdBy as string] = (userActivity[v.createdBy as string] || 0) + 1;
  }

  const mostActive = Object.entries(userActivity).sort((a, b) => b[1] - a[1])[0];

  return {
    totalVersions: versions.length,
    totalSize,
    avgSize: Math.round(totalSize / versions.length),
    contentUpdates,
    mostActiveUser: mostActive ? mostActive[0] : null,
  };
}
