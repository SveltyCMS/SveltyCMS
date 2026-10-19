/**
 * @file src/utils/media/folder-tree.ts
 * @description Pure hierarchy guards for virtual media folders.
 *
 * ### Features:
 * - Build an `id -> parentId` map from a folder list
 * - Detect moves into the folder itself or one of its descendants
 * - Visited-set walk so a pre-existing corrupt cycle cannot hang the check
 */

export interface FolderParentLink {
  _id: unknown;
  parentId?: unknown;
}

/** Build a normalized parent map once per request instead of re-walking arrays. */
export function buildFolderParentMap(
  folders: readonly FolderParentLink[],
): Map<string, string | null> {
  const parentById = new Map<string, string | null>();
  for (const folder of folders) {
    parentById.set(String(folder._id), folder.parentId ? String(folder.parentId) : null);
  }
  return parentById;
}

/**
 * True when moving `folderId` under `targetParentId` would create a cycle.
 * A root target (`null` / empty) is always safe.
 */
export function folderMoveCreatesCycle(
  parentById: ReadonlyMap<string, string | null>,
  folderId: string,
  targetParentId: string | null | undefined,
): boolean {
  if (!targetParentId) return false;

  const moving = String(folderId);
  const visited = new Set<string>();
  let current: string | null = String(targetParentId);

  while (current) {
    if (current === moving) return true;
    if (visited.has(current)) return false; // pre-existing corrupt cycle
    visited.add(current);
    current = parentById.get(current) ?? null;
  }

  return false;
}
